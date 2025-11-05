/**
 * Cross-Sell Suggestions
 * 
 * Suggests additional subjects when a student completes a goal
 */

import * as admin from 'firebase-admin';

/**
 * Cross-sell mapping: When a subject is completed, suggest these related subjects
 */
const CROSS_SELL_MAP: Record<string, string[]> = {
  'Mathematics': ['Physics', 'Statistics', 'Computer Science'],
  'Science': ['Physics', 'Chemistry', 'Biology'],
  'Physics': ['Mathematics', 'Chemistry', 'Engineering'],
  'Chemistry': ['Biology', 'Physics', 'Medicine'],
  'Biology': ['Chemistry', 'Medicine', 'Environmental Science'],
  'English': ['Literature', 'Writing', 'Communication'],
  'SAT Math': ['College Essays', 'AP Calculus', 'SAT Reading'],
  'SAT Reading': ['College Essays', 'AP English', 'SAT Writing'],
  'College Essays': ['SAT Reading', 'AP English', 'Creative Writing'],
  'AP Calculus': ['AP Physics', 'Statistics', 'Computer Science'],
  'Statistics': ['Mathematics', 'Data Science', 'Economics'],
  'Computer Science': ['Mathematics', 'Statistics', 'Engineering'],
};

/**
 * Get cross-sell suggestions for a completed subject
 */
export function getCrossSellSuggestions(completedSubject: string, existingGoals: Array<{ subject: string }>): string[] {
  const suggestions = CROSS_SELL_MAP[completedSubject] || [];
  
  // Filter out subjects the student already has as goals
  const existingSubjects = existingGoals.map(g => g.subject);
  return suggestions.filter(subject => !existingSubjects.includes(subject));
}

/**
 * Send cross-sell notification to student
 */
export async function sendCrossSellNotification(
  studentId: string,
  completedSubject: string,
  suggestions: string[]
): Promise<void> {
  try {
    // Get student's FCM token
    const studentRef = admin.firestore().collection('students').doc(studentId);
    const studentDoc = await studentRef.get();
    
    if (!studentDoc.exists) {
      throw new Error(`Student ${studentId} not found`);
    }

    const studentData = studentDoc.data()!;
    const fcmToken = studentData.fcmToken;

    if (!fcmToken) {
      console.log(`Student ${studentId} has no FCM token - skipping notification`);
      // Still create notification document for in-app display
      await admin.firestore().collection('notifications').add({
        studentId,
        type: 'cross_sell',
        title: `🎉 Congrats on completing ${completedSubject}!`,
        body: `Students like you often enjoy: ${suggestions.slice(0, 2).join(', ')}. Explore now!`,
        suggestions,
        completedSubject,
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
      });
      return;
    }

    // Create notification payload
    const message = {
      token: fcmToken,
      notification: {
        title: `🎉 Congrats on completing ${completedSubject}!`,
        body: `Students like you often enjoy: ${suggestions.slice(0, 2).join(', ')}. Explore now!`,
      },
      data: {
        type: 'cross_sell',
        studentId,
        completedSubject,
        suggestions: JSON.stringify(suggestions),
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
      webpush: {
        notification: {
          title: `🎉 Congrats on completing ${completedSubject}!`,
          body: `Students like you often enjoy: ${suggestions.slice(0, 2).join(', ')}. Explore now!`,
          icon: '/icon-192x192.png',
          badge: '/icon-192x192.png',
        },
        fcmOptions: {
          link: '/dashboard',
        },
      },
    };

    // Send notification
    const response = await admin.messaging().send(message);
    console.log(`✅ Successfully sent cross-sell notification to student ${studentId}:`, response);

    // Record notification in Firestore
    await admin.firestore().collection('notifications').add({
      studentId,
      type: 'cross_sell',
      title: message.notification.title,
      body: message.notification.body,
      suggestions,
      completedSubject,
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      read: false,
    });

  } catch (error: any) {
    console.error(`❌ Error sending cross-sell notification to student ${studentId}:`, error);
    
    // Handle invalid token errors
    if (error.code === 'messaging/invalid-registration-token' || 
        error.code === 'messaging/registration-token-not-registered') {
      // Remove invalid token from student document
      await admin.firestore().collection('students').doc(studentId).update({
        fcmToken: admin.firestore.FieldValue.delete(),
      });
      console.log(`Removed invalid FCM token for student ${studentId}`);
    }
    
    // Still create notification document for in-app display
    try {
      await admin.firestore().collection('notifications').add({
        studentId,
        type: 'cross_sell',
        title: `🎉 Congrats on completing ${completedSubject}!`,
        body: `Students like you often enjoy: ${suggestions.slice(0, 2).join(', ')}. Explore now!`,
        suggestions,
        completedSubject,
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
      });
    } catch (notifError) {
      console.error('Error creating notification document:', notifError);
    }
  }
}

/**
 * Process goal completion and send cross-sell suggestions
 */
export async function processGoalCompletion(studentId: string, completedGoal: {
  goalId: string;
  subject: string;
  status: string;
}): Promise<void> {
  // Get student's existing goals
  const studentRef = admin.firestore().collection('students').doc(studentId);
  const studentDoc = await studentRef.get();
  
  if (!studentDoc.exists) {
    throw new Error(`Student ${studentId} not found`);
  }

  const studentData = studentDoc.data()!;
  const existingGoals = studentData.goals || [];

  // Get cross-sell suggestions
  const suggestions = getCrossSellSuggestions(completedGoal.subject, existingGoals);

  if (suggestions.length === 0) {
    console.log(`No cross-sell suggestions for ${completedGoal.subject}`);
    return;
  }

  // Check if we've already sent a notification for this goal completion
  const notificationsQuery = await admin.firestore()
    .collection('notifications')
    .where('studentId', '==', studentId)
    .where('type', '==', 'cross_sell')
    .where('completedSubject', '==', completedGoal.subject)
    .limit(1)
    .get();

  if (!notificationsQuery.empty) {
    console.log(`Cross-sell notification already sent for ${completedGoal.subject}`);
    return;
  }

  // Send cross-sell notification
  await sendCrossSellNotification(studentId, completedGoal.subject, suggestions);

  // Update student document with cross-sell suggestions
  await studentRef.update({
    crossSellSuggestions: admin.firestore.FieldValue.arrayUnion({
      completedSubject: completedGoal.subject,
      suggestions,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }),
  });
}

