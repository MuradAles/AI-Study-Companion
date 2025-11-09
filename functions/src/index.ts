import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { analyzeTranscript } from './openai-handlers';
import { generatePracticeQuestions, generateSingleQuestion } from './openai-handlers';
import { evaluateAnswer as evaluateAnswerAI } from './openai-handlers';
import { calculateLevel, isDateConsecutive, checkForNewBadges } from './gamification';
import { checkStudentHealth as checkStudentHealthHelper, sendBookingNudge, checkAllStudentsHealth } from './retention';
import { processGoalCompletion } from './crosssell';
import { generateChatResponse, generateChatPracticeQuestion } from './chat';

// Initialize Firebase Admin
admin.initializeApp();

/**
 * Process transcript when a new session document is created
 * Triggers AI analysis and stores results in Firestore
 */
export const processTranscript = functions.firestore
  .document('sessions/{sessionId}')
  .onCreate(async (snap, context) => {
    const session = snap.data();
    const sessionId = context.params.sessionId;

    // Validate required fields
    if (!session.transcript) {
      console.error(`Session ${sessionId} missing transcript`);
      return null;
    }

    if (!session.studentId) {
      console.error(`Session ${sessionId} missing studentId`);
      return null;
    }

    try {
      console.log(`Processing transcript for session ${sessionId}`);

      // Analyze transcript using OpenAI
      const analysis = await analyzeTranscript(session.transcript);

      // Update session document with analysis
      await snap.ref.update({
        aiAnalysis: {
          ...analysis,
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`Successfully processed transcript for session ${sessionId}`);

      return null;
    } catch (error) {
      console.error(`Error processing transcript for session ${sessionId}:`, error);
      
      // Update session with error status
      await snap.ref.update({
        aiAnalysis: null,
        processingError: error instanceof Error ? error.message : 'Unknown error',
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      throw error;
    }
  });

/**
 * Generate shared practice questions when a session is updated with AI analysis
 * Creates questions visible to all students with attribution to the creator
 * Triggers after processTranscript completes
 */
export const generateQuestions = functions.firestore
  .document('sessions/{sessionId}')
  .onUpdate(async (change, context) => {
    const newData = change.after.data();
    const oldData = change.before.data();
    const sessionId = context.params.sessionId;

    // Only proceed if aiAnalysis was just added
    if (!newData.aiAnalysis || oldData.aiAnalysis) {
      return null;
    }

    // Validate required fields
    if (!newData.studentId || !newData.goalId) {
      console.error(`Session ${sessionId} missing studentId or goalId`);
      return null;
    }

    try {
      console.log(`Generating shared questions for session ${sessionId}`);

      // Get session context
      const sessionContext = {
        tutorName: newData.tutorName || 'Your tutor',
        subject: newData.subject || 'Unknown',
        sessionDate: newData.date ? newData.date.toDate().toISOString() : new Date().toISOString(),
      };

      // Generate questions based on analysis
      const questions = await generatePracticeQuestions(newData.aiAnalysis, sessionContext);

      // Log questions with answers for debugging
      console.log(`📝 Generated ${questions.length} shared questions for session ${sessionId} (${sessionContext.subject}):`);
      questions.forEach((q, idx) => {
        console.log(`  Q${idx + 1}: ${q.text}`);
        console.log(`  ✅ Answer: ${q.correctAnswer}`);
      });

      // Get student info for attribution
      const studentDoc = await admin.firestore().collection('students').doc(newData.studentId).get();
      const studentName = studentDoc.exists ? (studentDoc.data()?.name || 'Anonymous') : 'Anonymous';

      // Add each question to shared questions collection
      const batch = admin.firestore().batch();
      questions.forEach((question: any) => {
        const questionRef = admin.firestore().collection('questions').doc();
        batch.set(questionRef, {
          subject: newData.subject || 'Unknown',
          topics: newData.aiAnalysis.topicsCovered || [],
          difficulty: question.difficulty || 'medium',
          text: question.text,
          correctAnswer: question.correctAnswer,
          explanation: question.explanation || question.aiFeedback || '',
          hint: question.hint || '',
          passage: question.passage || '', // Include passage for reading comprehension questions
          // Attribution
          createdBy: newData.studentId,
          createdByName: studentName,
          source: 'session_analysis',
          sessionId: sessionId,
          // Metadata
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          upvotes: 0,
          timesAttempted: 0,
          timesCorrect: 0,
        });
      });

      await batch.commit();

      console.log(`✅ Successfully added ${questions.length} shared questions to pool from session ${sessionId}`);

      return null;
    } catch (error) {
      console.error(`Error generating shared questions for session ${sessionId}:`, error);
      throw error;
    }
  });

/**
 * Evaluate student answer for shared questions and update gamification
 * Callable function from client
 */
export const evaluateAnswer = functions.https.onCall(async (data, context) => {
  // Check authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { questionId, studentAnswer } = data;
  const studentId = context.auth.uid;

  if (!questionId || !studentAnswer) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  try {
    console.log(`Evaluating answer for question ${questionId} from student ${studentId}`);
    
    // Get question from shared collection
    const questionDoc = await admin.firestore()
      .collection('questions')
      .doc(questionId)
      .get();

    if (!questionDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Question not found');
    }

    const question = questionDoc.data();
    if (!question) {
      throw new functions.https.HttpsError('not-found', 'Question data not found');
    }

    console.log(`Question found: ${question.text.substring(0, 50)}...`);

    // Evaluate answer with AI
    let evaluation;
    try {
      evaluation = await evaluateAnswerAI(question as any, studentAnswer);
      console.log(`Evaluation result: isCorrect=${evaluation.isCorrect}`);
    } catch (evalError) {
      console.error('Error in evaluateAnswerAI:', evalError);
      // Fallback evaluation
      const isCorrect = studentAnswer.toLowerCase().trim() === question.correctAnswer.toLowerCase().trim();
      evaluation = {
        isCorrect,
        feedback: isCorrect 
          ? 'Correct! Great job!' 
          : `Not quite. The correct answer is: ${question.correctAnswer}. Keep practicing!`,
      };
    }

    // Calculate points
    const pointsToAward = evaluation.isCorrect 
      ? 10  // Standard points for correct answer
      : 0;  // No points for incorrect answer

    // Record user response in shared collection
    await admin.firestore().collection('user_responses').add({
      studentId,
      questionId,
      studentAnswer,
      isCorrect: evaluation.isCorrect,
      feedback: evaluation.feedback,
      pointsAwarded: pointsToAward,
      attemptedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Update question statistics
    await questionDoc.ref.update({
      timesAttempted: admin.firestore.FieldValue.increment(1),
      timesCorrect: evaluation.isCorrect ? admin.firestore.FieldValue.increment(1) : question.timesCorrect || 0,
    });

    // Get student data
    const studentRef = admin.firestore().collection('students').doc(studentId);
    const studentDoc = await studentRef.get();
    
    if (!studentDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Student not found');
    }

    const student = studentDoc.data();
    if (!student) {
      throw new functions.https.HttpsError('not-found', 'Student data not found');
    }

    const gamification = student.gamification || {
      totalPoints: 0,
      level: 1,
      currentStreak: 0,
      longestStreak: 0,
      lastActivityDate: '',
      badges: [],
      dailyGoals: { date: '', target: 3, completed: 0, status: 'in_progress' },
    };

    // Update points and level
    const newTotalPoints = (gamification.totalPoints || 0) + pointsToAward;
    const newLevel = calculateLevel(newTotalPoints);

    // Check streak
    const today = new Date().toISOString().split('T')[0];
    const lastActivity = gamification.lastActivityDate || today;
    const isConsecutive = isDateConsecutive(lastActivity, today);
    const newStreak = isConsecutive ? (gamification.currentStreak || 0) + 1 : 1;

    // Check daily goal
    const dailyProgress = gamification.dailyGoals?.date === today
      ? (gamification.dailyGoals.completed || 0) + 1
      : 1;
    const dailyGoalComplete = dailyProgress >= 3 && (gamification.dailyGoals?.completed || 0) < 3;

    // Check for new badges
    let newBadges: any[] = [];
    try {
      newBadges = await checkForNewBadges(student, {
        answeredQuestion: true,
        isCorrect: evaluation.isCorrect,
        dailyProgress,
        newStreak,
      });
    } catch (badgeError) {
      console.error('Error checking for badges:', badgeError);
      // Continue without badges if there's an error
    }

    // Award daily goal bonus
    const bonusPoints = dailyGoalComplete ? 15 : 0;
    const finalPoints = pointsToAward + bonusPoints;

    // Update student gamification
    const updateData: any = {
      'gamification.totalPoints': newTotalPoints + bonusPoints,
      'gamification.level': newLevel,
      'gamification.currentStreak': newStreak,
      'gamification.longestStreak': Math.max(gamification.longestStreak || 0, newStreak),
      'gamification.lastActivityDate': today,
      'gamification.dailyGoals.completed': dailyProgress,
      'gamification.dailyGoals.date': today,
      'gamification.dailyGoals.status': dailyProgress >= 3 ? 'completed' : 'in_progress',
    };

    if (newBadges.length > 0) {
      updateData['gamification.badges'] = admin.firestore.FieldValue.arrayUnion(...newBadges);
    }

    await studentRef.update(updateData);

    console.log(`Successfully evaluated answer. Points: ${finalPoints}, Level: ${newLevel}`);

    return {
      isCorrect: evaluation.isCorrect,
      feedback: evaluation.feedback,
      pointsAwarded: finalPoints,
      leveledUp: newLevel > (gamification.level || 1),
      newLevel,
      newBadges,
      dailyGoalComplete,
      currentStreak: newStreak,
    };
  } catch (error) {
    console.error('Error evaluating answer:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', `Failed to evaluate answer: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

/**
 * Retention Automation - Check Student Health
 * Runs daily at 10 AM EST to identify at-risk students and send booking nudges
 */
export const checkStudentHealth = functions.pubsub
  .schedule('0 10 * * *') // Every day at 10 AM
  .timeZone('America/New_York')
  .onRun(async (context) => {
    console.log('Starting daily student health check...');
    
    try {
      const results = await checkAllStudentsHealth();
      console.log('Health check results:', results);
      return results;
    } catch (error) {
      console.error('Error during health check:', error);
      throw error;
    }
  });

/**
 * Detect goal completion and trigger cross-sell suggestions
 * Triggers when a student document is updated and a goal status changes to 'completed'
 */
export const onGoalCompletion = functions.firestore
  .document('students/{studentId}')
  .onUpdate(async (change, context) => {
    const newData = change.after.data();
    const oldData = change.before.data();
    const studentId = context.params.studentId;

    const newGoals = newData.goals || [];
    const oldGoals = oldData.goals || [];

    // Find goals that were just completed
    for (const newGoal of newGoals) {
      const oldGoal = oldGoals.find((g: any) => g.goalId === newGoal.goalId);
      
      // Check if goal status changed to 'completed'
      if (oldGoal && oldGoal.status !== 'completed' && newGoal.status === 'completed') {
        console.log(`Goal completed: ${newGoal.subject} for student ${studentId}`);
        
        try {
          await processGoalCompletion(studentId, newGoal);
        } catch (error) {
          console.error(`Error processing goal completion for ${studentId}:`, error);
        }
      }
    }

    return null;
  });

/**
 * Generate more questions similar to an existing one
 * Callable function from client
 */
export const generateMoreQuestions = functions.https.onCall(async (data, context) => {
  // Check authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { questionId, count = 3 } = data;
  const studentId = context.auth.uid;

  if (!questionId) {
    throw new functions.https.HttpsError('invalid-argument', 'questionId is required');
  }

  try {
    console.log(`Generating ${count} more questions similar to ${questionId}`);

    // Get the original question
    const questionDoc = await admin.firestore().collection('questions').doc(questionId).get();
    
    if (!questionDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Question not found');
    }

    const originalQuestion = questionDoc.data();
    if (!originalQuestion) {
      throw new functions.https.HttpsError('not-found', 'Question data not found');
    }

    // Get student info for attribution
    const studentDoc = await admin.firestore().collection('students').doc(studentId).get();
    const studentName = studentDoc.exists ? (studentDoc.data()?.name || 'Anonymous') : 'Anonymous';

    // Generate similar questions using OpenAI
    const { generateSimilarQuestionsAI } = require('./openai-handlers');
    const newQuestions = await generateSimilarQuestionsAI({
      subject: originalQuestion.subject,
      topics: originalQuestion.topics,
      difficulty: originalQuestion.difficulty,
      exampleQuestion: originalQuestion.text,
      count,
    });

    // Add generated questions to shared collection
    const batch = admin.firestore().batch();
    newQuestions.forEach((question: any) => {
      const questionRef = admin.firestore().collection('questions').doc();
      batch.set(questionRef, {
        subject: originalQuestion.subject,
        topics: originalQuestion.topics,
        difficulty: originalQuestion.difficulty,
        text: question.text,
        correctAnswer: question.correctAnswer,
        explanation: question.explanation || '',
        hint: question.hint || '',
        passage: question.passage || '', // Include passage for reading comprehension questions
        // Attribution
        createdBy: studentId,
        createdByName: studentName,
        source: 'user_generated',
        basedOnQuestionId: questionId,
        // Metadata
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        upvotes: 0,
        timesAttempted: 0,
        timesCorrect: 0,
      });
    });

    await batch.commit();

    console.log(`✅ Successfully generated ${newQuestions.length} similar questions`);

    return {
      success: true,
      count: newQuestions.length,
      message: `Generated ${newQuestions.length} new questions!`,
    };
  } catch (error) {
    console.error('Error generating similar questions:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', `Failed to generate questions: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

/**
 * Generate chat response with context
 * Callable function from client
 */
export const generateChatResponseFunction = functions.https.onCall(async (data, context) => {
  // Check authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { message, conversationHistory } = data;
  const studentId = context.auth.uid;

  if (!message || typeof message !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'Message is required');
  }

  try {
    const result = await generateChatResponse(studentId, message, conversationHistory || []);
    return result;
  } catch (error) {
    console.error('Error generating chat response:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', `Failed to generate chat response: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

/**
 * Validate chat practice question answer
 * Callable function from client
 */
export const validateChatAnswer = functions.https.onCall(async (data, context) => {
  // Check authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { questionId, correctAnswer, studentAnswer } = data;
  const studentId = context.auth.uid;

  if (!questionId || !correctAnswer || !studentAnswer) {
    throw new functions.https.HttpsError('invalid-argument', 'questionId, correctAnswer, and studentAnswer are required');
  }

  try {
    const isCorrect = studentAnswer === correctAnswer;
    
    // Generate feedback using OpenAI
    const { callOpenAI } = await import('./openai');
    const feedbackPrompt = isCorrect
      ? `The student answered correctly: "${studentAnswer}". Provide brief, encouraging feedback.`
      : `The student answered "${studentAnswer}" but the correct answer is "${correctAnswer}". Provide helpful, encouraging feedback explaining why.`;

    const feedback = await callOpenAI(
      [
        { role: 'system', content: 'You are a helpful tutor providing feedback on practice questions. Be encouraging and educational.' },
        { role: 'user', content: feedbackPrompt },
      ],
      {
        model: 'gpt-4o',
        temperature: 0.7,
        maxTokens: 150,
      }
    );

    return {
      isCorrect,
      feedback,
    };
  } catch (error) {
    console.error('Error validating answer:', error);
    // Fallback feedback
    const isCorrect = studentAnswer === correctAnswer;
    return {
      isCorrect,
      feedback: isCorrect ? 'Correct! Great job!' : `Incorrect. The correct answer is ${correctAnswer}.`,
    };
  }
});

/**
 * Generate realistic tutoring conversation transcript using OpenAI
 * Works for ANY subject: Math, English, Science, History, etc.
 * Callable function from client
 */
export const generateTutoringTranscript = functions.https.onCall(async (data, context) => {
  // Check authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { studentName, tutorName, subject, topic } = data;

  if (!studentName || !tutorName || !subject) {
    throw new functions.https.HttpsError('invalid-argument', 'studentName, tutorName, and subject are required');
  }

  try {
    console.log(`🎨 Generating realistic conversation for ${subject}${topic ? ` - ${topic}` : ''}`);
    
    const { callOpenAI } = await import('./openai');
    
    // Create a detailed system prompt for realistic tutoring conversations
    const systemPrompt = `You are an expert at creating realistic tutoring conversation transcripts. 
Generate an authentic, natural-sounding conversation between a tutor and student about ${subject}${topic ? ` focusing on ${topic}` : ''}.

CRITICAL REQUIREMENTS:
- Include ACTUAL CONTENT: real equations, problems, examples, passages, etc. 
- For Math: Include real equations like "2x + 5 = 13" or "x² - 5x + 6 = 0" and work through solutions
- For English/Reading: Include actual passages, literary analysis, grammar examples
- For Science: Include real concepts, formulas, experiments
- For History: Include dates, events, cause-and-effect relationships
- The conversation should show the student struggling initially, then understanding with tutor's help
- Make it feel like a REAL tutoring session with specific content, not vague discussion
- Include 10-12 message exchanges total (alternating tutor/student)

Return your response in JSON format with an array of conversation messages:
{
  "conversation": [
    {"speaker": "tutor", "message": "...", "timestamp": "ISO string"},
    {"speaker": "student", "message": "...", "timestamp": "ISO string"}
  ]
}`;

    const userPrompt = `Generate a realistic tutoring conversation transcript:
- Student: ${studentName}
- Tutor: ${tutorName}  
- Subject: ${subject}
- Topic: ${topic || 'General concepts'}

Make it authentic with actual problems, examples, or content from this subject!`;

    const response = await callOpenAI(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      {
        model: 'gpt-4o',
        temperature: 0.8, // Higher temperature for more creative, varied responses
        maxTokens: 2000,
        responseFormat: { type: 'json_object' },
      }
    );

    // Parse JSON response
    let conversation;
    try {
      const parsed = JSON.parse(response);
      conversation = parsed.conversation || [];
    } catch (parseError) {
      console.error('Failed to parse OpenAI response as JSON:', parseError);
      throw new functions.https.HttpsError('internal', 'Failed to parse conversation data');
    }

    if (!conversation || conversation.length === 0) {
      throw new functions.https.HttpsError('internal', 'Generated conversation is empty');
    }

    console.log(`✅ Generated ${conversation.length} conversation exchanges`);

    return {
      conversation,
      subject,
      topic: topic || 'General',
    };
  } catch (error) {
    console.error('Error generating tutoring transcript:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', `Failed to generate transcript: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

