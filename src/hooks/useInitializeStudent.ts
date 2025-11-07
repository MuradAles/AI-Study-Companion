import { useEffect } from 'react';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../contexts/AuthContext';

/**
 * Initialize test data for a new student
 * Creates student document with gamification data and sample goals
 */
export function useInitializeStudent() {
  const { currentUser } = useAuth();

  useEffect(() => {
    if (!currentUser) return;

    const initializeStudent = async () => {
      const studentRef = doc(db, 'students', currentUser.uid);
      const studentDoc = await getDoc(studentRef);

      // Only initialize if student doesn't exist
      if (!studentDoc.exists()) {
        await setDoc(studentRef, {
          name: 'Test Student',
          email: currentUser.email || 'test@example.com',
          createdAt: Timestamp.now(),
          goals: [
            {
              goalId: 'goal-mathematics',
              subject: 'Mathematics',
              status: 'active',
              sessionsCompleted: 0,
              targetSessions: 10,
            },
            {
              goalId: 'goal-sat-math',
              subject: 'SAT Math',
              status: 'active',
              sessionsCompleted: 0,
              targetSessions: 8,
            },
            {
              goalId: 'goal-sat-reading',
              subject: 'SAT Reading',
              status: 'active',
              sessionsCompleted: 0,
              targetSessions: 8,
            },
            {
              goalId: 'goal-geometry',
              subject: 'Geometry',
              status: 'active',
              sessionsCompleted: 0,
              targetSessions: 10,
            },
            {
              goalId: 'goal-algebra',
              subject: 'Algebra',
              status: 'active',
              sessionsCompleted: 0,
              targetSessions: 10,
            },
          ],
          gamification: {
            totalPoints: 0,
            level: 1,
            currentStreak: 0,
            longestStreak: 0,
            lastActivityDate: '',
            badges: [],
            dailyGoals: {
              date: new Date().toISOString().split('T')[0],
              target: 3,
              completed: 0,
              status: 'in_progress',
            },
          },
        });
        console.log('✅ Student initialized with test data');
      }
    };

    initializeStudent().catch((error) => {
      console.error('Error initializing student:', error);
    });
  }, [currentUser]);
}

