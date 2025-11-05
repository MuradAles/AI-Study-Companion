import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '../services/firebase';

export interface PracticeQuestion {
  questionId: string;
  text: string;
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard';
  hint: string;
  correctAnswer: string;
  pointsValue: number;
  passage?: string; // Optional passage text for reading comprehension questions
}

export interface PracticeItem {
  id: string;
  studentId: string;
  sessionId: string;
  goalId: string;
  scheduledFor: Timestamp;
  status: 'pending' | 'completed' | 'skipped';
  questions: PracticeQuestion[];
  responses: Array<{
    questionId: string;
    studentAnswer: string;
    submittedAt: Timestamp;
    isCorrect: boolean;
    aiFeedback: string;
    pointsAwarded: number;
  }>;
}

export function usePracticeItems(studentId: string) {
  const [practiceItems, setPracticeItems] = useState<PracticeItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentId) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'practice_items'),
      where('studentId', '==', studentId),
      where('status', '==', 'pending'),
      orderBy('scheduledFor', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as PracticeItem[];

      setPracticeItems(items);
      setLoading(false);
    });

    return unsubscribe;
  }, [studentId]);

  return { practiceItems, loading };
}

