import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { analyzeTranscript } from './openai-handlers';
import { generatePracticeQuestions } from './openai-handlers';
import { evaluateAnswer as evaluateAnswerAI } from './openai-handlers';
import { calculateLevel, isDateConsecutive, checkForNewBadges } from './gamification';
import { checkAllStudentsHealth } from './retention';
import { processGoalCompletion } from './crosssell';
import { generateChatResponse } from './chat';

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
      return null;
    }

    if (!session.studentId) {
      return null;
    }

    try {

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

      return null;
    } catch (error) {
      
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
      return null;
    }

    try {

      // Get session context
      const sessionContext = {
        tutorName: newData.tutorName || 'Your tutor',
        subject: newData.subject || 'Unknown',
        sessionDate: newData.date ? newData.date.toDate().toISOString() : new Date().toISOString(),
      };

      // Generate questions based on analysis
      const questions = await generatePracticeQuestions(newData.aiAnalysis, sessionContext);

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

      return null;
    } catch (error) {
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

    // Evaluate answer with AI
    let evaluation;
    try {
      evaluation = await evaluateAnswerAI(question as any, studentAnswer);
    } catch (evalError) {
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
    try {
      const results = await checkAllStudentsHealth();
      return results;
    } catch (error) {
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
        try {
          await processGoalCompletion(studentId, newGoal);
        } catch (error) {
          // Error processing goal completion
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

    return {
      success: true,
      count: newQuestions.length,
      message: `Generated ${newQuestions.length} new questions!`,
    };
  } catch (error) {
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
/**
 * Generate questions for a specific tutor and subject
 * Callable function from client
 */
export const generateQuestionsForTutor = functions.https.onCall(async (data, context) => {
  // Check authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { subject, tutorName, difficulty, count = 3 } = data;
  const studentId = context.auth.uid;

  if (!subject || !tutorName || !difficulty) {
    throw new functions.https.HttpsError('invalid-argument', 'subject, tutorName, and difficulty are required');
  }

  try {
    // Get student's sessions with this tutor and subject
    // Note: Firestore may require a composite index for multiple where clauses
    // If index error occurs, create index at: https://console.firebase.google.com/project/_/firestore/indexes
    const sessionsQuery = await admin.firestore()
      .collection('sessions')
      .where('studentId', '==', studentId)
      .where('subject', '==', subject)
      .where('tutorName', '==', tutorName)
      .limit(10)
      .get();

    if (sessionsQuery.empty) {
      throw new functions.https.HttpsError('not-found', 'No sessions found for this tutor and subject');
    }

    // Find a session with AI analysis
    let sessionWithAnalysis: { id: string; aiAnalysis: any; date: string; [key: string]: any } | null = null;
    for (const doc of sessionsQuery.docs) {
      const sessionData = doc.data();
      if (sessionData.aiAnalysis) {
        sessionWithAnalysis = {
          id: doc.id,
          ...sessionData,
          aiAnalysis: sessionData.aiAnalysis,
          date: sessionData.date?.toDate().toISOString() || new Date().toISOString(),
        };
        break;
      }
    }

    if (!sessionWithAnalysis || !sessionWithAnalysis.aiAnalysis) {
      throw new functions.https.HttpsError('not-found', 'No session analysis found. Please complete a session first.');
    }

    // Generate questions using OpenAI
    // Always generate exactly the requested count for the specific difficulty
    const { generateSingleQuestion } = require('./openai-handlers');
    const sessionContext = {
      tutorName: tutorName,
      subject: subject,
      sessionDate: sessionWithAnalysis.date,
    };

    // Generate exactly 'count' questions of the requested difficulty
    const filteredQuestions = [];
    for (let i = 0; i < count; i++) {
      const question = await generateSingleQuestion(
        sessionWithAnalysis.aiAnalysis,
        sessionContext,
        difficulty as 'easy' | 'medium' | 'hard'
      );
      filteredQuestions.push(question);
    }

    // Get the most recent session ID for practice_items
    const mostRecentSession = sessionsQuery.docs[0];
    const sessionId = mostRecentSession.id;

    // Check if practice_item exists for this session
    let practiceItemRef = await admin.firestore()
      .collection('practice_items')
      .where('studentId', '==', studentId)
      .where('sessionId', '==', sessionId)
      .limit(1)
      .get();

    let practiceItemId: string;
    if (practiceItemRef.empty) {
      // Create new practice_item
      const newPracticeItem = await admin.firestore().collection('practice_items').add({
        studentId,
        sessionId,
        subject,
        tutorName,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        questions: [],
        responses: [],
      });
      practiceItemId = newPracticeItem.id;
    } else {
      practiceItemId = practiceItemRef.docs[0].id;
    }

    // Add questions to practice_item
    const practiceItemDoc = await admin.firestore().collection('practice_items').doc(practiceItemId).get();
    const existingQuestions = practiceItemDoc.data()?.questions || [];

    const newQuestions = filteredQuestions.map((q: { text: string; topic: string; difficulty: string; hint: string; correctAnswer: string; passage?: string }) => ({
      questionId: `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      text: q.text,
      topic: q.topic || subject,
      difficulty: q.difficulty,
      hint: q.hint || '',
      correctAnswer: q.correctAnswer,
      passage: q.passage || '',
    }));

    await admin.firestore().collection('practice_items').doc(practiceItemId).update({
      questions: [...existingQuestions, ...newQuestions],
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      count: newQuestions.length,
      message: `Generated ${newQuestions.length} new ${difficulty} questions!`,
    };
  } catch (error) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', `Failed to generate questions: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

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
      throw new functions.https.HttpsError('internal', 'Failed to parse conversation data');
    }

    if (!conversation || conversation.length === 0) {
      throw new functions.https.HttpsError('internal', 'Generated conversation is empty');
    }

    return {
      conversation,
      subject,
      topic: topic || 'General',
    };
  } catch (error) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', `Failed to generate transcript: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

