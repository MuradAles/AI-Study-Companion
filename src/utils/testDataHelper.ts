/**
 * Test Data Helper Script
 * 
 * This script helps create test data for development and testing.
 * Run this in the browser console or create a helper component.
 * 
 * Usage in browser console:
 * ```
 * // First, get your user ID
 * const userId = firebase.auth().currentUser?.uid;
 * 
 * // Then run the helper functions
 * createTestSession(userId, 'Mathematics', 'Sample transcript here...');
 * ```
 */

import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '../services/firebase';

/**
 * Create a test session document
 * This will trigger processTranscript -> generateQuestions automatically
 */
export async function createTestSession(
  studentId: string,
  subject: string,
  transcript: string,
  tutorName = 'Test Tutor'
) {
  const goalId = `goal-${subject.toLowerCase().replace(/\s+/g, '-')}`;
  
  const sessionData = {
    studentId,
    goalId,
    subject,
    tutorName,
    transcript,
    date: Timestamp.now(),
    status: 'completed',
  };

  try {
    const docRef = await addDoc(collection(db, 'sessions'), sessionData);
    console.log('✅ Test session created:', docRef.id);
    console.log('📝 Transcript will be processed automatically');
    console.log('📚 Practice questions will be generated automatically');
    return docRef.id;
  } catch (error) {
    console.error('❌ Error creating test session:', error);
    throw error;
  }
}

/**
 * Create multiple test sessions for different subjects
 */
export async function createTestSessions(studentId: string) {
  const sessions = [
    {
      subject: 'Mathematics',
      transcript: `Tutor: "Today we're working on quadratic equations. Can you explain what a quadratic equation is?"
Student: "I think it's an equation with x squared?"
Tutor: "Exactly! A quadratic equation has the form ax² + bx + c = 0. Let's solve x² - 5x + 6 = 0."
Student: "Um, I'm not sure how to factor this."
Tutor: "Let's break it down. We need two numbers that multiply to 6 and add to -5."
Student: "Oh! -2 and -3?"
Tutor: "Perfect! So (x - 2)(x - 3) = 0. What are the solutions?"
Student: "x = 2 or x = 3!"
Tutor: "Excellent work! You've got it!"`,
      tutorName: 'Dr. Smith',
    },
    {
      subject: 'Science',
      transcript: `Tutor: "Today we're exploring photosynthesis. What do you know about it?"
Student: "It's how plants make food using sunlight?"
Tutor: "That's a great start! Photosynthesis converts light energy into chemical energy. The formula is: 6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂"
Student: "So plants take in carbon dioxide and water, and make glucose and oxygen?"
Tutor: "Exactly! And where does this happen in the plant?"
Student: "In the leaves? The chloroplasts?"
Tutor: "Perfect! Chloroplasts contain chlorophyll which captures the light energy."
Student: "That makes sense now!"`,
      tutorName: 'Prof. Johnson',
    },
    {
      subject: 'Mathematics',
      transcript: `Tutor: "Let's review linear equations today. Solve: 2x + 5 = 13"
Student: "So I subtract 5 from both sides, getting 2x = 8"
Tutor: "Great! Now what?"
Student: "Divide by 2, so x = 4"
Tutor: "Perfect! You're getting the hang of this!"
Student: "Thanks! I think I understand it better now."`,
      tutorName: 'Dr. Smith',
    },
  ];

  const createdSessions = [];
  for (const session of sessions) {
    try {
      const sessionId = await createTestSession(
        studentId,
        session.subject,
        session.transcript,
        session.tutorName
      );
      createdSessions.push(sessionId);
      
      // Wait a bit between sessions to avoid overwhelming functions
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Error creating session for ${session.subject}:`, error);
    }
  }

  console.log(`✅ Created ${createdSessions.length} test sessions`);
  return createdSessions;
}

/**
 * Update student goals to include more subjects
 */
export async function updateStudentGoals(studentId: string) {
  const { doc, updateDoc } = await import('firebase/firestore');
  const studentRef = doc(db, 'students', studentId);

  const goals = [
    {
      goalId: 'goal-mathematics',
      subject: 'Mathematics',
      status: 'active',
      sessionsCompleted: 0,
      targetSessions: 10,
    },
    {
      goalId: 'goal-science',
      subject: 'Science',
      status: 'active',
      sessionsCompleted: 0,
      targetSessions: 8,
    },
    {
      goalId: 'goal-english',
      subject: 'English',
      status: 'active',
      sessionsCompleted: 0,
      targetSessions: 12,
    },
  ];

  try {
    await updateDoc(studentRef, { goals });
    console.log('✅ Updated student goals');
  } catch (error) {
    console.error('❌ Error updating goals:', error);
    throw error;
  }
}

// Export for use in browser console or React components
if (typeof window !== 'undefined') {
  (window as any).createTestSession = createTestSession;
  (window as any).createTestSessions = createTestSessions;
  (window as any).updateStudentGoals = updateStudentGoals;
}

