import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { analyzeTranscript } from './openai-handlers';
import { generatePracticeQuestions, generateSingleQuestion } from './openai-handlers';
import { evaluateAnswer as evaluateAnswerAI } from './openai-handlers';
import { generateChatResponse } from './openai-handlers';
import { calculateLevel, isDateConsecutive, checkForNewBadges } from './gamification';
import { checkStudentHealth as checkStudentHealthHelper, sendBookingNudge, checkAllStudentsHealth } from './retention';
import { processGoalCompletion } from './crosssell';
import { createLearningPathFromSession, updateCheckpointCompletion } from './learning-path';

// Initialize Firebase Admin
admin.initializeApp();

// Example function - replace with actual implementation
export const helloWorld = functions.https.onRequest((request, response) => {
  response.json({ message: 'Hello from Firebase Functions!' });
});

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
 * Generate practice questions when a session is updated with AI analysis
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
      console.log(`Generating questions for session ${sessionId}`);

      // Get session context
      const sessionContext = {
        tutorName: newData.tutorName || 'Your tutor',
        subject: newData.subject || 'Unknown',
        sessionDate: newData.date ? newData.date.toDate().toISOString() : new Date().toISOString(),
      };

      // Generate questions based on analysis
      const questions = await generatePracticeQuestions(newData.aiAnalysis, sessionContext);

      // Schedule for next day at 3pm (15:00)
      const scheduledFor = new Date();
      scheduledFor.setDate(scheduledFor.getDate() + 1);
      scheduledFor.setHours(15, 0, 0, 0);

      // Create practice item document
      await admin.firestore().collection('practice_items').add({
        studentId: newData.studentId,
        sessionId: sessionId,
        goalId: newData.goalId,
        scheduledFor: admin.firestore.Timestamp.fromDate(scheduledFor),
        status: 'pending',
        questions: questions,
        responses: [],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`Successfully generated ${questions.length} questions for session ${sessionId}`);

      return null;
    } catch (error) {
      console.error(`Error generating questions for session ${sessionId}:`, error);
      throw error;
    }
  });

/**
 * Evaluate student answer and update gamification
 * Callable function from client
 */
export const evaluateAnswer = functions.https.onCall(async (data, context) => {
  // Check authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { practiceId, questionId, studentAnswer } = data;
  const studentId = context.auth.uid;

  if (!practiceId || !questionId || !studentAnswer) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  try {
    console.log(`Evaluating answer for practice ${practiceId}, question ${questionId}`);
    
    // Get practice item
    const practiceDoc = await admin.firestore()
      .collection('practice_items')
      .doc(practiceId)
      .get();

    if (!practiceDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Practice item not found');
    }

    const practiceData = practiceDoc.data();
    if (!practiceData) {
      throw new functions.https.HttpsError('not-found', 'Practice item data not found');
    }

    if (practiceData.studentId !== studentId) {
      throw new functions.https.HttpsError('permission-denied', 'Not authorized');
    }

    // Find question
    const question = practiceData.questions?.find((q: any) => q.questionId === questionId);
    if (!question) {
      console.error(`Question ${questionId} not found in practice item ${practiceId}`);
      throw new functions.https.HttpsError('not-found', 'Question not found');
    }

    console.log(`Question found: ${question.text.substring(0, 50)}...`);

    // Evaluate answer with AI
    let evaluation;
    try {
      evaluation = await evaluateAnswerAI(question, studentAnswer);
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
      ? (question.pointsValue || 10)
      : Math.floor((question.pointsValue || 10) / 2);

    // If answer is incorrect, regenerate the question instead of just recording it
    if (!evaluation.isCorrect) {
      // Get session data to regenerate question
      const sessionDoc = await admin.firestore()
        .collection('sessions')
        .doc(practiceData.sessionId)
        .get();
      
      if (sessionDoc.exists) {
        const sessionData = sessionDoc.data();
        if (sessionData?.aiAnalysis) {
          // Generate new question with same difficulty
          const sessionContext = {
            tutorName: sessionData.tutorName || 'Your tutor',
            subject: sessionData.subject || 'Unknown',
            sessionDate: sessionData.date ? sessionData.date.toDate().toISOString() : new Date().toISOString(),
          };
          
          const newQuestion = await generateSingleQuestion(
            sessionData.aiAnalysis,
            sessionContext,
            question.difficulty || 'medium'
          );
          
          // Replace the incorrect question with the new one
          const questions = practiceData.questions || [];
          const questionIndex = questions.findIndex((q: any) => q.questionId === questionId);
          
          if (questionIndex >= 0) {
            questions[questionIndex] = newQuestion;
            
            // Update practice item with new question (don't add incorrect response)
            await practiceDoc.ref.update({
              questions: questions,
            });
            
            // Get student data for gamification (but don't update points for wrong answer)
            const studentRef = admin.firestore().collection('students').doc(studentId);
            const studentDoc = await studentRef.get();
            
            if (studentDoc.exists) {
              const student = studentDoc.data();
              const gamification = student?.gamification || {
                totalPoints: 0,
                level: 1,
                currentStreak: 0,
                longestStreak: 0,
                lastActivityDate: '',
                badges: [],
                dailyGoals: { date: '', target: 3, completed: 0, status: 'in_progress' },
              };
              
              return {
                isCorrect: false,
                feedback: evaluation.feedback + ' A new question has been generated for you to try again!',
                pointsAwarded: 0,
                regenerated: true,
                newQuestion: newQuestion,
                leveledUp: false,
                newLevel: gamification.level || 1,
                newBadges: [],
                dailyGoalComplete: false,
                currentStreak: gamification.currentStreak || 0,
              };
            }
          }
        }
      }
      
      // If regeneration failed, return error response
      return {
        isCorrect: false,
        feedback: evaluation.feedback + ' Please try again!',
        pointsAwarded: 0,
        regenerated: false,
        leveledUp: false,
        newLevel: 1,
        newBadges: [],
        dailyGoalComplete: false,
        currentStreak: 0,
      };
    }

    // If answer is correct, record the response normally
    const response = {
      questionId,
      studentAnswer,
      submittedAt: admin.firestore.Timestamp.now(),
      isCorrect: evaluation.isCorrect,
      aiFeedback: evaluation.feedback,
      pointsAwarded: pointsToAward,
    };

    await practiceDoc.ref.update({
      responses: admin.firestore.FieldValue.arrayUnion(response),
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
 * Callable function from client
 */
export const generateCheckpointQuestions = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { sessionIds, difficulty, subject } = data;
  const studentId = context.auth.uid;

  if (!sessionIds || !Array.isArray(sessionIds) || sessionIds.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'sessionIds array is required');
  }

  if (!difficulty || !['easy', 'medium', 'hard'].includes(difficulty)) {
    throw new functions.https.HttpsError('invalid-argument', 'difficulty must be easy, medium, or hard');
  }

  try {
    const db = admin.firestore();
    
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

    return {
      questions: filteredQuestions.slice(0, 3), // Ensure exactly 3 questions
      sessionIds: sessionIds,
      difficulty: difficulty,
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
 * Generate AI chat response with context
 * Callable function from client
 */
export const generateChatResponseFunction = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { conversationId, userMessage, studentContext } = data;
  const studentId = context.auth.uid;

  if (!conversationId || !userMessage || !studentContext) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  try {
    // Get conversation history from Firestore
    const messagesSnapshot = await admin.firestore()
      .collection('conversations')
      .doc(conversationId)
      .collection('messages')
      .orderBy('timestamp', 'asc')
      .limit(10) // Last 10 messages for context
      .get();

    const conversationHistory = messagesSnapshot.docs.map(doc => {
      const msgData = doc.data();
      return {
        role: msgData.role as 'user' | 'assistant',
        content: msgData.content,
      };
    });

    // Generate AI response
    const aiResponse = await generateChatResponse(conversationHistory, studentContext);

    return { response: aiResponse };
  } catch (error) {
    console.error('Error generating chat response:', error);
    throw new functions.https.HttpsError('internal', 'Failed to generate chat response');
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
 * Manual trigger for student health check (for testing)
 * Call via: httpsCallable(functions, 'checkStudentHealthManual')
 */
export const checkStudentHealthManual = functions.https.onCall(async (data, context) => {
  // Only allow authenticated users (or add admin check)
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const results = await checkAllStudentsHealth();
    return results;
  } catch (error) {
    console.error('Error during manual health check:', error);
    throw new functions.https.HttpsError('internal', 'Failed to check student health');
  }
});

/**
 * Check health for a specific student (for testing)
 */
export const checkSingleStudentHealth = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { studentId } = data;
  if (!studentId) {
    throw new functions.https.HttpsError('invalid-argument', 'studentId is required');
  }

  // Only allow checking own health or admin
  if (context.auth.uid !== studentId) {
    throw new functions.https.HttpsError('permission-denied', 'Can only check own health');
  }

  try {
    const healthCheck = await checkStudentHealthHelper(studentId);
    
    // If at risk, send nudge
    if (healthCheck.isAtRisk) {
      await sendBookingNudge(studentId, healthCheck);
    }

    return healthCheck;
  } catch (error) {
    console.error('Error checking student health:', error);
    throw new functions.https.HttpsError('internal', 'Failed to check student health');
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
 * Retention Automation - Check Student Health
 * Runs daily at 10 AM EST to identify at-risk students and send booking nudges
 */
export const checkStudentHealthScheduled = functions.pubsub
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

// Re-export learning path functions so they're available to Firebase Functions runtime
export { createLearningPathFromSession, updateCheckpointCompletion };


