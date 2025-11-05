/**
 * Retention Automation - Detect At-Risk Students
 * 
 * Identifies students with fewer than 3 sessions in their first week
 * and sends booking nudges via Firebase Cloud Messaging
 */

import * as admin from 'firebase-admin';

export interface StudentHealthCheck {
  studentId: string;
  isAtRisk: boolean;
  reason: string;
  daysSinceFirstSession: number;
  sessionCount: number;
  firstSessionDate: Date | null;
}

/**
 * Check if a student is at risk (less than 3 sessions in first week)
 */
export async function checkStudentHealth(studentId: string): Promise<StudentHealthCheck> {
  const studentRef = admin.firestore().collection('students').doc(studentId);
  const studentDoc = await studentRef.get();

  if (!studentDoc.exists) {
    throw new Error(`Student ${studentId} not found`);
  }

  const studentData = studentDoc.data()!;
  
  // Get student's first session date
  const firstSessionQuery = await admin.firestore()
    .collection('sessions')
    .where('studentId', '==', studentId)
    .orderBy('date', 'asc')
    .limit(1)
    .get();

  if (firstSessionQuery.empty) {
    // No sessions yet - not at risk, just new
    return {
      studentId,
      isAtRisk: false,
      reason: 'No sessions yet',
      daysSinceFirstSession: 0,
      sessionCount: 0,
      firstSessionDate: null,
    };
  }

  const firstSession = firstSessionQuery.docs[0].data();
  const firstSessionDate = firstSession.date?.toDate() || new Date();
  const now = new Date();
  const daysSinceFirstSession = Math.floor(
    (now.getTime() - firstSessionDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Check if within first week (7 days)
  if (daysSinceFirstSession > 7) {
    return {
      studentId,
      isAtRisk: false,
      reason: 'Outside first week',
      daysSinceFirstSession,
      sessionCount: 0,
      firstSessionDate,
    };
  }

  // Count sessions within first week
  const weekEndDate = new Date(firstSessionDate);
  weekEndDate.setDate(weekEndDate.getDate() + 7);

  const sessionsQuery = await admin.firestore()
    .collection('sessions')
    .where('studentId', '==', studentId)
    .where('date', '>=', admin.firestore.Timestamp.fromDate(firstSessionDate))
    .where('date', '<=', admin.firestore.Timestamp.fromDate(weekEndDate))
    .get();

  const sessionCount = sessionsQuery.size;
  const isAtRisk = sessionCount < 3;

  return {
    studentId,
    isAtRisk,
    reason: isAtRisk 
      ? `Only ${sessionCount} session(s) in first week (target: 3+)`
      : `Healthy: ${sessionCount} sessions in first week`,
    daysSinceFirstSession,
    sessionCount,
    firstSessionDate,
  };
}

/**
 * Send booking nudge notification to at-risk student
 */
export async function sendBookingNudge(studentId: string, healthCheck: StudentHealthCheck): Promise<void> {
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
      return;
    }

    // Create notification payload
    const message = {
      token: fcmToken,
      notification: {
        title: '📚 Ready for your next session?',
        body: `You've completed ${healthCheck.sessionCount} session(s). Book another session to stay on track!`,
      },
      data: {
        type: 'booking_nudge',
        studentId,
        sessionCount: healthCheck.sessionCount.toString(),
        click_action: 'FLUTTER_NOTIFICATION_CLICK', // For web, this opens the app
      },
      webpush: {
        notification: {
          title: '📚 Ready for your next session?',
          body: `You've completed ${healthCheck.sessionCount} session(s). Book another session to stay on track!`,
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
    console.log(`✅ Successfully sent booking nudge to student ${studentId}:`, response);

    // Record notification in Firestore
    await admin.firestore().collection('notifications').add({
      studentId,
      type: 'booking_nudge',
      title: message.notification.title,
      body: message.notification.body,
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      read: false,
    });

  } catch (error: any) {
    console.error(`❌ Error sending booking nudge to student ${studentId}:`, error);
    
    // Handle invalid token errors
    if (error.code === 'messaging/invalid-registration-token' || 
        error.code === 'messaging/registration-token-not-registered') {
      // Remove invalid token from student document
      await admin.firestore().collection('students').doc(studentId).update({
        fcmToken: admin.firestore.FieldValue.delete(),
      });
      console.log(`Removed invalid FCM token for student ${studentId}`);
    }
    
    throw error;
  }
}

/**
 * Check all students and send nudges to at-risk ones
 */
export async function checkAllStudentsHealth(): Promise<{
  checked: number;
  atRisk: number;
  notified: number;
  errors: number;
}> {
  const studentsSnapshot = await admin.firestore()
    .collection('students')
    .get();

  let checked = 0;
  let atRisk = 0;
  let notified = 0;
  let errors = 0;

  const results = await Promise.allSettled(
    studentsSnapshot.docs.map(async (doc) => {
      checked++;
      try {
        const healthCheck = await checkStudentHealth(doc.id);
        
        if (healthCheck.isAtRisk) {
          atRisk++;
          await sendBookingNudge(doc.id, healthCheck);
          notified++;
        }
      } catch (error) {
        errors++;
        console.error(`Error checking student ${doc.id}:`, error);
      }
    })
  );

  console.log(`Health check complete: ${checked} checked, ${atRisk} at-risk, ${notified} notified, ${errors} errors`);

  return { checked, atRisk, notified, errors };
}

