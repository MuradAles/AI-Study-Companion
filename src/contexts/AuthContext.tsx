import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from 'firebase/auth';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut,
  updateProfile
} from 'firebase/auth';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { auth, db } from '../services/firebase';

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string, role: 'student' | 'tutor') => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signUp = async (email: string, password: string, displayName: string, role: 'student' | 'tutor') => {
    if (!displayName.trim()) {
      throw new Error('Name is required');
    }

    if (!role || (role !== 'student' && role !== 'tutor')) {
      throw new Error('Role must be either "student" or "tutor"');
    }

    console.log('Signing up user with role:', role);

    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    if (userCredential.user) {
      await updateProfile(userCredential.user, { displayName: displayName.trim() });
    }
    
    // Create ONLY the role-specific document (no 'users' collection)
    if (userCredential.user) {
      if (role === 'student') {
        // Create student document with gamification
        const studentRef = doc(db, 'students', userCredential.user.uid);
        await setDoc(studentRef, {
          name: displayName.trim(),
          email: email,
          role: 'student',
          createdAt: Timestamp.now(),
          goals: [],
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
        console.log('✅ Student account created');
      } else if (role === 'tutor') {
        // Create tutor document - simple, just name, email, role
        const tutorRef = doc(db, 'tutors', userCredential.user.uid);
        await setDoc(tutorRef, {
          name: displayName.trim(),
          email: email,
          role: 'tutor',
          createdAt: Timestamp.now(),
        });
        console.log('✅ Tutor account created');
      }
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  const value: AuthContextType = {
    currentUser,
    loading,
    signIn,
    signUp,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

