import { useEffect, useState } from 'react';
import { doc, onSnapshot, collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../services/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useInitializeStudent } from '../../hooks/useInitializeStudent';
import { useNotifications } from '../../hooks/useNotifications';
import { useNavigate } from 'react-router-dom';
import Navigation from '../Shared/Navigation';
import LoadDemoSessions from './LoadDemoSessions';
import './Dashboard.css';

interface Student {
  id: string;
  name: string;
  email: string;
  goals: Array<{
    goalId: string;
    subject: string;
    status: string;
    sessionsCompleted: number;
    targetSessions: number;
  }>;
  gamification: {
    totalPoints: number;
    level: number;
    currentStreak: number;
    longestStreak: number;
    dailyGoals: {
      date: string;
      target: number;
      completed: number;
      status: string;
    };
  };
  crossSellSuggestions?: Array<{
    completedSubject: string;
    suggestions: string[];
    createdAt: Timestamp | string;
  }>;
}

interface TranscriptAnalysis {
  topicsCovered: string[];
  studentStruggles: string[];
  studentStrengths: string[];
  keyMoments: Array<{
    timestamp: string;
    type: 'confusion' | 'breakthrough' | 'question' | 'explanation';
    note: string;
  }>;
  confidenceLevel: number;
  suggestedTopics: string[];
  processedAt?: string | Timestamp;
}

interface Session {
  id: string;
  studentId: string;
  goalId: string;
  subject: string;
  tutorName: string;
  transcript?: string;
  aiAnalysis?: TranscriptAnalysis;
  processingError?: string;
  date?: Timestamp;
  status?: string;
}

function Dashboard() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasSessions, setHasSessions] = useState<boolean | null>(null);
  const [practiceItemsCount, setPracticeItemsCount] = useState<number | null>(null);
  const [sessionsStatus, setSessionsStatus] = useState<{
    total: number;
    processed: number;
    processing: number;
    error: number;
  } | null>(null);
  const [recentSessions, setRecentSessions] = useState<Session[]>([]);
  const [retryingSessions, setRetryingSessions] = useState<Set<string>>(new Set());

  // Initialize student data if needed
  useInitializeStudent();

  // Register for notifications
  useNotifications();

  const userId = currentUser?.uid || '';

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'students', userId),
      (doc) => {
        if (doc.exists()) {
          setStudent({ id: doc.id, ...doc.data() } as Student);
        }
        setLoading(false);
      },
      (error) => {
        console.error('Error loading student:', error);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [userId]);

  // Check if student has any sessions
  useEffect(() => {
    if (!userId) {
      setHasSessions(null);
      return;
    }

    const checkSessions = async () => {
      try {
        const sessionsQuery = query(
          collection(db, 'sessions'),
          where('studentId', '==', userId)
        );
        const snapshot = await getDocs(sessionsQuery);
        const sessions = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Session[];
        
        setHasSessions(!snapshot.empty);
        console.log(`📊 Student has ${snapshot.size} sessions`);
        
        // Check session processing status
        const processed = sessions.filter(s => s.aiAnalysis).length;
        const processing = sessions.filter(s => !s.aiAnalysis && !s.processingError).length;
        const error = sessions.filter(s => s.processingError).length;
        
        setSessionsStatus({
          total: snapshot.size,
          processed,
          processing,
          error,
        });

        // Store recent sessions for display
        setRecentSessions(sessions.slice(0, 5));
        
        // Debug logging
        sessions.forEach(session => {
          console.log(`Session ${session.id} (${session.subject}):`, {
            hasTranscript: !!session.transcript,
            hasAiAnalysis: !!session.aiAnalysis,
            hasError: !!session.processingError,
            error: session.processingError
          });
        });
      } catch (error) {
        console.error('Error checking sessions:', error);
        setHasSessions(false);
      }
    };

    checkSessions();
  }, [userId]);

  // Check for available practice items
  useEffect(() => {
    if (!userId) {
      setPracticeItemsCount(null);
      return;
    }

    const checkPracticeItems = async () => {
      try {
        const practiceQuery = query(
          collection(db, 'practice_items'),
          where('studentId', '==', userId),
          where('status', '==', 'pending')
        );
        const snapshot = await getDocs(practiceQuery);
        const totalQuestions = snapshot.docs.reduce((sum, doc) => {
          const data = doc.data();
          return sum + (data.questions?.length || 0);
        }, 0);
        setPracticeItemsCount(totalQuestions);
        console.log(`📚 Student has ${totalQuestions} practice questions available`);
      } catch (error) {
        console.error('Error checking practice items:', error);
        setPracticeItemsCount(0);
      }
    };

    checkPracticeItems();
    
    // Refresh practice items when sessions status changes
    if (sessionsStatus) {
      const interval = setInterval(checkPracticeItems, 5000); // Check every 5 seconds
      return () => clearInterval(interval);
    }
  }, [userId, sessionsStatus]);

  // Retry processing failed sessions
  const retryFailedSessions = async () => {
    if (!userId || !recentSessions.length) return;
    
    const failedSessions = recentSessions.filter(s => s.processingError);
    if (failedSessions.length === 0) return;

    setRetryingSessions(new Set(failedSessions.map(s => s.id)));

    try {
      const retrySessionProcessing = httpsCallable(functions, 'retrySessionProcessing');
      
      // Retry each failed session
      const retryPromises = failedSessions.map(async (session) => {
        try {
          await retrySessionProcessing({ sessionId: session.id });
          return { sessionId: session.id, success: true };
        } catch (error) {
          console.error(`Error retrying session ${session.id}:`, error);
          return { sessionId: session.id, success: false, error };
        }
      });

      const results = await Promise.all(retryPromises);
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;

      // Refresh sessions after a short delay to allow processing to complete
      setTimeout(async () => {
        const sessionsQuery = query(
          collection(db, 'sessions'),
          where('studentId', '==', userId)
        );
        const snapshot = await getDocs(sessionsQuery);
        const sessions = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Session[];
        setRecentSessions(sessions.slice(0, 5));
      }, 2000);

      if (failCount > 0) {
        console.warn(`✅ Retried ${successCount} session(s) successfully.\n❌ ${failCount} session(s) failed. Check console for details.`);
      } else {
        console.log(`✅ Successfully retried ${successCount} session(s)! Processing will complete shortly.`);
      }
    } catch (error) {
      console.error('Error retrying sessions:', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setRetryingSessions(new Set());
    }
  };

  if (loading) {
    return (
      <div className="dashboard">
        <header className="dashboard-header">
          <h1>AI Study Companion</h1>
          <Navigation />
        </header>
        <main className="dashboard-main">
          <p>Loading...</p>
        </main>
      </div>
    );
  }

  const gamification = student?.gamification || {
    totalPoints: 0,
    level: 1,
    currentStreak: 0,
    longestStreak: 0,
    dailyGoals: { date: '', target: 3, completed: 0, status: 'in_progress' },
  };

  const dailyGoals = gamification.dailyGoals;
  const today = new Date().toISOString().split('T')[0];
  const isToday = dailyGoals.date === today;
  const completed = isToday ? dailyGoals.completed : 0;
  const target = dailyGoals.target || 3;

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>AI Study Companion</h1>
        <Navigation />
      </header>
      <main className="dashboard-main">
        <div className="dashboard-content">
          {/* Gamification Header */}
          <div className="gamification-header">
            <div className="student-info">
              <h2>{student?.name || 'Student'}</h2>
              <div className="stats">
                <span>Level {gamification.level}</span>
                <span>•</span>
                <span>{gamification.totalPoints} pts</span>
                <span>•</span>
                <span>🔥 {gamification.currentStreak} day streak</span>
              </div>
            </div>
          </div>

          {/* Daily Goals */}
          <div className="daily-goals-section">
            <h3>Today's Goal 🎯</h3>
            <div className="goal-progress">
              {Array.from({ length: target }).map((_, i) => (
                <span key={i} className={i < completed ? 'completed' : 'pending'}>
                  {i < completed ? '✨' : '⭕'}
                </span>
              ))}
              <span className="goal-text">
                ({completed}/{target} questions)
              </span>
            </div>
          </div>

          {/* Demo Sessions Loader - Show for new users without sessions */}
          {hasSessions === false && (
            <LoadDemoSessions 
              onComplete={() => {
                // Refresh student data after demo sessions are created
                setHasSessions(true);
                window.location.reload();
              }}
            />
          )}
          

          {/* Debug: Session Status */}
          {sessionsStatus && sessionsStatus.total > 0 && (
            <div className="session-status-debug" style={{
              margin: '20px 0',
              padding: '15px',
              backgroundColor: '#f5f5f5',
              borderRadius: '8px',
              fontSize: '14px'
            }}>
              <h4 style={{ marginTop: 0 }}>Session Processing Status</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginTop: '10px' }}>
                <div>
                  <strong>Total:</strong> {sessionsStatus.total}
                </div>
                <div style={{ color: sessionsStatus.processed > 0 ? 'green' : 'gray' }}>
                  <strong>Processed:</strong> {sessionsStatus.processed}
                </div>
                <div style={{ color: sessionsStatus.processing > 0 ? 'orange' : 'gray' }}>
                  <strong>Processing:</strong> {sessionsStatus.processing}
                </div>
                <div style={{ color: sessionsStatus.error > 0 ? 'red' : 'gray' }}>
                  <strong>Errors:</strong> {sessionsStatus.error}
                </div>
              </div>
              {recentSessions.length > 0 && (
                <div style={{ marginTop: '15px' }}>
                  <strong>Recent Sessions:</strong>
                  <ul style={{ marginTop: '8px', paddingLeft: '20px' }}>
                    {recentSessions.map(session => (
                      <li key={session.id} style={{ marginBottom: '5px' }}>
                        <strong>{session.subject}</strong> - 
                        {session.aiAnalysis ? (
                          <span style={{ color: 'green' }}> ✅ Processed</span>
                        ) : session.processingError ? (
                          <span style={{ color: 'red' }}> ❌ Error: {session.processingError.substring(0, 50)}...</span>
                        ) : session.transcript ? (
                          <span style={{ color: 'orange' }}> ⏳ Processing...</span>
                        ) : (
                          <span style={{ color: 'gray' }}> ⚠️ No transcript</span>
                        )}
                      </li>
                    ))}
                  </ul>
                  {sessionsStatus && sessionsStatus.error > 0 && (
                    <button
                      onClick={retryFailedSessions}
                      disabled={retryingSessions.size > 0}
                      style={{
                        marginTop: '10px',
                        padding: '8px 16px',
                        backgroundColor: retryingSessions.size > 0 ? '#ccc' : '#4CAF50',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: retryingSessions.size > 0 ? 'not-allowed' : 'pointer',
                        fontSize: '14px'
                      }}
                    >
                      {retryingSessions.size > 0 ? 'Retrying...' : `🔄 Retry ${sessionsStatus.error} Failed Session${sessionsStatus.error > 1 ? 's' : ''}`}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Practice Alert / Welcome Message */}
          {practiceItemsCount !== null && practiceItemsCount > 0 ? (
            <div className="practice-alert">
              <div className="alert-content">
                <span className="alert-icon">🔔</span>
                <div>
                  <h4>Practice Questions Available!</h4>
                  <p>You have {practiceItemsCount} {practiceItemsCount === 1 ? 'question' : 'questions'} ready to practice. Start now and earn points!</p>
                </div>
                <button className="alert-button" onClick={() => navigate('/practice')}>
                  Start Practicing
                </button>
              </div>
            </div>
          ) : practiceItemsCount === 0 && sessionsStatus && sessionsStatus.processed > 0 ? (
            <div className="practice-alert">
              <div className="alert-content">
                <span className="alert-icon">✅</span>
                <div>
                  <h4>Sessions Processed!</h4>
                  <p>Your {sessionsStatus.processed} {sessionsStatus.processed === 1 ? 'session has' : 'sessions have'} been analyzed. Practice questions should be available now!</p>
                </div>
                <button className="alert-button" onClick={() => navigate('/practice')}>
                  Check Practice
                </button>
              </div>
            </div>
          ) : practiceItemsCount === 0 && sessionsStatus && sessionsStatus.processing > 0 ? (
            <div className="practice-alert">
              <div className="alert-content">
                <span className="alert-icon">⏳</span>
                <div>
                  <h4>Processing Sessions...</h4>
                  <p>{sessionsStatus.processing} {sessionsStatus.processing === 1 ? 'session is' : 'sessions are'} being analyzed by AI. Practice questions will be available soon!</p>
                </div>
              </div>
            </div>
          ) : practiceItemsCount === 0 && hasSessions ? (
            <div className="practice-alert">
              <div className="alert-content">
                <span className="alert-icon">⏳</span>
                <div>
                  <h4>Practice Questions Coming Soon!</h4>
                  <p>Your sessions are being analyzed. Practice questions will be available soon!</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="practice-alert welcome-message">
              <div className="alert-content">
                <span className="alert-icon">👋</span>
                <div>
                  <h4>Or Create Your Own Session</h4>
                  <p>Create a tutoring session manually. The AI will analyze your session and generate personalized practice questions for tomorrow.</p>
                </div>
                <button className="alert-button" onClick={() => navigate('/create-session')}>
                  Create Your Own Session
                </button>
              </div>
            </div>
          )}

          {/* Progress Tracker */}
          <div className="progress-section">
            <h3>Your Progress 📊</h3>
            {student?.goals && student.goals.length > 0 ? (
              <div className="goals-list">
                {student.goals.map((goal) => {
                  const progress = (goal.sessionsCompleted / goal.targetSessions) * 100;
                  return (
                    <div key={goal.goalId} className="goal-item">
                      <div className="goal-header">
                        <span className="goal-subject">{goal.subject}</span>
                        <span className="goal-status">{goal.status}</span>
                      </div>
                      <div className="progress-bar">
                        <div
                          className="progress-fill"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <div className="goal-details">
                        {goal.sessionsCompleted}/{goal.targetSessions} sessions
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p>No active goals. Start a new subject to begin tracking progress!</p>
            )}
          </div>

          {/* Cross-Sell Suggestions */}
          {student?.crossSellSuggestions && student.crossSellSuggestions.length > 0 && (
            <div className="cross-sell-section">
              <h3>🎉 Recommended Next Steps</h3>
              {student.crossSellSuggestions.slice(-1).map((suggestion, index) => (
                <div key={index} className="cross-sell-card">
                  <p className="cross-sell-title">
                    Congrats on completing <strong>{suggestion.completedSubject}</strong>!
                  </p>
                  <p className="cross-sell-subtitle">
                    Students like you often enjoy:
                  </p>
                  <div className="suggestions-list">
                    {suggestion.suggestions.map((subject, idx) => (
                      <button
                        key={idx}
                        className="suggestion-button"
                        onClick={() => {
                          // TODO: Navigate to subject selection or booking
                          console.log(`Selected: ${subject}`);
                        }}
                      >
                        {subject}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default Dashboard;
