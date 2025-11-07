import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { analyzeTranscript } from './openai-handlers';
import { generatePracticeQuestions, generateSingleQuestion } from './openai-handlers';
import { evaluateAnswer as evaluateAnswerAI } from './openai-handlers';
import { calculateLevel, isDateConsecutive, checkForNewBadges } from './gamification';
import { checkStudentHealth as checkStudentHealthHelper, sendBookingNudge, checkAllStudentsHealth } from './retention';
import { processGoalCompletion } from './crosssell';
import { createLearningPathFromSession } from './learning-path';

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
 * Generate questions on-demand for a checkpoint
 * Now with caching support for instant loading!
 * Callable function from client
 */
export const generateCheckpointQuestions = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { sessionIds, difficulty, subject, checkpointId } = data;
  const studentId = context.auth.uid;

  if (!sessionIds || !Array.isArray(sessionIds) || sessionIds.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'sessionIds array is required');
  }

  if (!difficulty || !['easy', 'medium', 'hard'].includes(difficulty)) {
    throw new functions.https.HttpsError('invalid-argument', 'difficulty must be easy, medium, or hard');
  }

  try {
    const db = admin.firestore();
    
    // 🚀 CHECK CACHE FIRST for instant loading!
    if (checkpointId) {
      const cacheId = `${checkpointId}_${studentId}_${difficulty}`;
      const cacheDoc = await db.collection('checkpoint_questions_cache').doc(cacheId).get();
      
      if (cacheDoc.exists) {
        const cacheData = cacheDoc.data();
        console.log(`✅ Cache HIT! Loading questions instantly for ${cacheId}`);
        return {
          questions: cacheData?.questions || [],
          sessionIds: sessionIds,
          difficulty: difficulty,
          fromCache: true,
        };
      }
      console.log(`❌ Cache MISS for ${cacheId}, generating...`);
    }
    
    // Get the first session to get analysis data
    const sessionDoc = await db.collection('sessions').doc(sessionIds[0]).get();
    
    if (!sessionDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Session not found');
    }

    const sessionData = sessionDoc.data();
    if (!sessionData || !sessionData.aiAnalysis) {
      throw new functions.https.HttpsError('invalid-argument', 'Session does not have AI analysis');
    }

    if (sessionData.studentId !== studentId) {
      throw new functions.https.HttpsError('permission-denied', 'Access denied');
    }

    // Get session context
    const sessionContext = {
      tutorName: sessionData.tutorName || 'Your tutor',
      subject: subject || sessionData.subject || 'Unknown',
      sessionDate: sessionData.date ? sessionData.date.toDate().toISOString() : new Date().toISOString(),
    };

    // Generate 3 questions with the selected difficulty
    const allQuestions = await generatePracticeQuestions(sessionData.aiAnalysis, sessionContext);
    
    // Filter questions by difficulty and take 3
    const filteredQuestions = allQuestions
      .filter((q: any) => q.difficulty === difficulty)
      .slice(0, 3);
    
    // If we don't have enough questions of the selected difficulty, generate more
    if (filteredQuestions.length < 3) {
      const needed = 3 - filteredQuestions.length;
      for (let i = 0; i < needed; i++) {
        const newQuestion = await generateSingleQuestion(
          sessionData.aiAnalysis,
          sessionContext,
          difficulty
        );
        filteredQuestions.push(newQuestion);
      }
    }

    const finalQuestions = filteredQuestions.slice(0, 3);

    // 💾 SAVE TO CACHE for next time
    if (checkpointId) {
      const cacheId = `${checkpointId}_${studentId}_${difficulty}`;
      await db.collection('checkpoint_questions_cache').doc(cacheId).set({
        checkpointId,
        studentId,
        difficulty,
        subject,
        questions: finalQuestions,
        sessionIds: sessionIds,
        generatedAt: admin.firestore.FieldValue.serverTimestamp(),
        used: false,
      });
      console.log(`💾 Cached questions for ${cacheId}`);
    }

    return {
      questions: finalQuestions,
      sessionIds: sessionIds,
      difficulty: difficulty,
      fromCache: false,
    };
  } catch (error) {
    console.error('Error generating checkpoint questions:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', 'Failed to generate questions');
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
 * Generate a fake tutoring session using AI
 * Callable function from client - creates realistic demo sessions
 */
export const generateFakeSession = functions.https.onCall(async (data, context) => {
  // Check authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { subject, tutorName } = data;
  const studentId = context.auth.uid;

  // Default values if not provided
  const sessionSubject = subject || 'Mathematics';
  const sessionTutorName = tutorName || 'Dr. Sarah Chen';

  try {
    // Import OpenAI handler
    const { callOpenAI } = await import('./openai');

    // Generate a realistic tutoring session transcript using AI
    const systemPrompt = `You are a tutoring session transcript generator. Create a realistic, natural conversation between a tutor and student about ${sessionSubject}.

Requirements:
- Make it sound like a real tutoring session (10-15 exchanges)
- Include the tutor teaching concepts, asking questions, and providing feedback
- Show the student asking questions, making mistakes, and learning
- Cover 2-3 key concepts in ${sessionSubject}
- Use natural, conversational language
- Include some mathematical work or examples if applicable
- Format as: "Tutor: \"...\"\nStudent: \"...\"\nTutor: \"...\"" (with quotes)

Generate a realistic transcript that would come from a real tutoring session.`;

    const transcript = await callOpenAI(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Generate a realistic ${sessionSubject} tutoring session transcript between ${sessionTutorName} and a student.` }
      ],
      {
        model: 'gpt-3.5-turbo',
        temperature: 0.8,
        maxTokens: 1000,
      }
    );

    // Get student's goals to determine goalId
    const studentDoc = await admin.firestore().collection('students').doc(studentId).get();
    const studentData = studentDoc.data();
    const goals = studentData?.goals || [];
    
    // Find matching goal or create a default goalId
    let goalId = goals.find((g: any) => g.subject === sessionSubject)?.goalId;
    if (!goalId) {
      goalId = `goal-${sessionSubject.toLowerCase().replace(/\s+/g, '-')}`;
    }

    // Create session document in Firestore
    // This will automatically trigger processTranscript -> generateQuestions
    const sessionData = {
      studentId,
      goalId,
      subject: sessionSubject,
      tutorName: sessionTutorName,
      transcript: transcript.trim(),
      date: admin.firestore.Timestamp.now(),
      status: 'completed',
    };

    const sessionRef = await admin.firestore().collection('sessions').add(sessionData);
    console.log(`✅ Generated fake session ${sessionRef.id} for subject ${sessionSubject}`);

    return { 
      success: true, 
      sessionId: sessionRef.id,
      message: `Fake ${sessionSubject} session created! The AI will analyze it and generate practice questions.` 
    };
  } catch (error) {
    console.error(`Error generating fake session:`, error);
    throw new functions.https.HttpsError(
      'internal',
      `Failed to generate fake session: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
});

/**
 * Manually retry processing a session
 * Callable function from client - useful for retrying failed sessions
 */
export const retrySessionProcessing = functions.https.onCall(async (data, context) => {
  // Check authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { sessionId } = data;
  const studentId = context.auth.uid;

  if (!sessionId) {
    throw new functions.https.HttpsError('invalid-argument', 'sessionId is required');
  }

  try {
    // Get session document
    const sessionRef = admin.firestore().collection('sessions').doc(sessionId);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Session not found');
    }

    const session = sessionDoc.data()!;

    // Verify ownership
    if (session.studentId !== studentId) {
      throw new functions.https.HttpsError('permission-denied', 'Not authorized to process this session');
    }

    // Validate required fields
    if (!session.transcript) {
      throw new functions.https.HttpsError('invalid-argument', 'Session missing transcript');
    }

    console.log(`Manually retrying processing for session ${sessionId}`);

    // Analyze transcript using OpenAI
    const { analyzeTranscript } = await import('./openai-handlers');
    const analysis = await analyzeTranscript(session.transcript);

    // Update session document with analysis
    await sessionRef.update({
      aiAnalysis: {
        ...analysis,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
      processingError: admin.firestore.FieldValue.delete(),
    });

    console.log(`Successfully processed transcript for session ${sessionId}`);

    return { success: true, message: 'Session processed successfully' };
  } catch (error) {
    console.error(`Error processing session ${sessionId}:`, error);
    
    // Update session with error status
    const sessionRef = admin.firestore().collection('sessions').doc(sessionId);
    await sessionRef.update({
      processingError: error instanceof Error ? error.message : 'Unknown error',
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', 'Failed to process session');
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

// Re-export learning path functions so they're available to Firebase Functions runtime
export { createLearningPathFromSession };

// Export chat companion functions
export { chatCompanion, scheduleTutorMeeting } from './chat-companion';

