import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../contexts/AuthContext';

export function useUserRole() {
  const { currentUser } = useAuth();
  const [role, setRole] = useState<'student' | 'tutor' | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) {
      setRole(null);
      setLoading(false);
      return;
    }

    const loadRole = async () => {
      try {
        // Check if tutor document exists first (tutors are rarer)
        const tutorRef = doc(db, 'tutors', currentUser.uid);
        const tutorDoc = await getDoc(tutorRef);
        
        if (tutorDoc.exists()) {
          setRole('tutor');
          setLoading(false);
          return;
        }

        // Check if student document exists
        const studentRef = doc(db, 'students', currentUser.uid);
        const studentDoc = await getDoc(studentRef);
        
        if (studentDoc.exists()) {
          setRole('student');
          setLoading(false);
          return;
        }

        // If neither exists, default to student
        setRole('student');
      } catch (error: any) {
        setRole('student'); // Default fallback
      } finally {
        setLoading(false);
      }
    };

    loadRole();
  }, [currentUser]);

  return { role, loading };
}

