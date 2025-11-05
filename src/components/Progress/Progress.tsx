import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, Timestamp, doc, orderBy, limit } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../../contexts/AuthContext';
import Navigation from '../Shared/Navigation';
import './Progress.css';

interface Goal {
  goalId: string;
  subject: string;
  status: string;
  sessionsCompleted: number;
  targetSessions: number;
}

interface Session {
  id: string;
  subject: string;
  date: Timestamp;
  tutorName?: string;
  status?: string;
}

interface PracticeItem {
  id: string;
  goalId: string;
  subject?: string;
  scheduledFor: Timestamp;
  status: string;
  questions: any[];
}

interface PracticeStats {
  totalAnswered: number;
  correctAnswers: number;
  totalPoints: number;
}

interface Gamification {
  totalPoints: number;
  level: number;
  currentStreak: number;
  longestStreak: number;
  badges: string[];
  dailyGoals: {
    date: string;
    target: number;
    completed: number;
    status: string;
  };
}

function Progress() {
  const { currentUser } = useAuth();
  const userId = currentUser?.uid || '';
  const [goals, setGoals] = useState<Goal[]>([]);
  const [recentSessions, setRecentSessions] = useState<Session[]>([]);
  const [upcomingPractice, setUpcomingPractice] = useState<PracticeItem[]>([]);
  const [practiceStats, setPracticeStats] = useState<PracticeStats>({
    totalAnswered: 0,
    correctAnswers: 0,
    totalPoints: 0,
  });
  const [gamification, setGamification] = useState<Gamification | null>(null);
  const [loading, setLoading] = useState(true);

  // Load student goals and gamification
  useEffect(() => {
    if (!userId) return;

    const unsubscribe = onSnapshot(
      doc(db, 'students', userId),
      (docSnapshot) => {
        if (docSnapshot.exists()) {
          const data = docSnapshot.data();
          setGoals(data.goals || []);
          setGamification(data.gamification || null);
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

  // Load recent sessions
  useEffect(() => {
    if (!userId) return;

    let unsubscribe: (() => void) | null = null;

    // Try to fetch with ordering first (requires Firestore index)
    const sessionsQuery = query(
      collection(db, 'sessions'),
      where('studentId', '==', userId),
      orderBy('date', 'desc'),
      limit(10)
    );

    unsubscribe = onSnapshot(
      sessionsQuery,
      (snapshot) => {
        const sessions = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as Session[];
        setRecentSessions(sessions);
      },
      (error) => {
        console.error('Error loading sessions:', error);
        // If index error (failed-precondition), fallback to query without orderBy
        if (error.code === 'failed-precondition') {
          console.warn('Firestore index not available, using fallback query');
          const fallbackQuery = query(
            collection(db, 'sessions'),
            where('studentId', '==', userId)
          );
          const fallbackUnsubscribe = onSnapshot(fallbackQuery, (snapshot) => {
            const sessions = snapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data(),
            })) as Session[];
            // Sort by date manually
            const sortedSessions = sessions.sort((a, b) => {
              const dateA = a.date?.toMillis?.() || 0;
              const dateB = b.date?.toMillis?.() || 0;
              return dateB - dateA;
            });
            setRecentSessions(sortedSessions.slice(0, 10));
          });
          if (unsubscribe) {
            unsubscribe();
          }
          unsubscribe = fallbackUnsubscribe;
        }
      }
    );

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [userId]);

  // Load practice statistics and upcoming practice items
  useEffect(() => {
    if (!userId) return;

    const practiceQuery = query(
      collection(db, 'practice_items'),
      where('studentId', '==', userId),
    );

    const unsubscribe = onSnapshot(practiceQuery, (snapshot) => {
      let totalAnswered = 0;
      let correctAnswers = 0;
      let totalPoints = 0;
      const upcoming: PracticeItem[] = [];
      const now = Timestamp.now();

      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const practiceItem = {
          id: doc.id,
          ...data,
        } as PracticeItem;

        // Calculate stats from completed practice
        if (data.responses && Array.isArray(data.responses)) {
          data.responses.forEach((response: any) => {
            totalAnswered++;
            if (response.isCorrect) {
              correctAnswers++;
            }
            totalPoints += response.pointsAwarded || 0;
          });
        }

        // Collect upcoming practice items (scheduled for future or today)
        if (data.status === 'pending' && data.scheduledFor) {
          if (data.scheduledFor.toMillis() >= now.toMillis() - 86400000) { // Include today and future
            upcoming.push(practiceItem);
          }
        }
      });

      // Sort upcoming by scheduled date
      upcoming.sort((a, b) => {
        const dateA = a.scheduledFor?.toMillis() || 0;
        const dateB = b.scheduledFor?.toMillis() || 0;
        return dateA - dateB;
      });

      setPracticeStats({ totalAnswered, correctAnswers, totalPoints });
      setUpcomingPractice(upcoming.slice(0, 10)); // Next 10 upcoming
    });

    return unsubscribe;
  }, [userId]);

  if (loading) {
    return (
      <div className="progress">
        <header className="progress-header">
          <h1>AI Study Companion</h1>
          <Navigation />
        </header>
        <main className="progress-main">
          <p>Loading progress...</p>
        </main>
      </div>
    );
  }

  const accuracyRate = practiceStats.totalAnswered > 0
    ? Math.round((practiceStats.correctAnswers / practiceStats.totalAnswered) * 100)
    : 0;

  // Calculate subject-specific statistics
  const subjectStats = goals.map(goal => {
    const subjectSessions = recentSessions.filter(s => s.subject === goal.subject);
    const subjectPractice = upcomingPractice.filter(p => {
      // Match practice items to goals by goalId
      return p.goalId === goal.goalId;
    });
    
    return {
      goal,
      sessionsCount: subjectSessions.length,
      upcomingPracticeCount: subjectPractice.length,
      nextPracticeDate: subjectPractice.length > 0 
        ? subjectPractice[0].scheduledFor?.toDate() 
        : null,
    };
  });

  return (
    <div className="progress">
      <header className="progress-header">
        <h1>AI Study Companion</h1>
        <Navigation />
      </header>
      <main className="progress-main">
        <div className="progress-container">
          <h2>Your Progress Overview</h2>

          {/* Practice Statistics */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{practiceStats.totalAnswered}</div>
              <div className="stat-label">Questions Answered</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{accuracyRate}%</div>
              <div className="stat-label">Accuracy Rate</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{gamification?.level || 1}</div>
              <div className="stat-label">Level</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{gamification?.currentStreak || 0}</div>
              <div className="stat-label">Day Streak</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{gamification?.totalPoints || 0}</div>
              <div className="stat-label">Total Points</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{recentSessions.length}</div>
              <div className="stat-label">Sessions Completed</div>
            </div>
          </div>

          {/* Gamification Badges */}
          {gamification && gamification.badges && gamification.badges.length > 0 && (
            <div className="progress-section">
              <h3>Badges Earned</h3>
              <div className="badges-list">
                {gamification.badges.map((badge, index) => (
                  <div key={index} className="badge-item">
                    <span className="badge-icon">🏆</span>
                    <span className="badge-name">{badge}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Multi-Subject Progress View */}
          <div className="progress-section">
            <h3>Subject Progress Overview</h3>
            {subjectStats.length > 0 ? (
              <div className="subjects-grid">
                {subjectStats.map(({ goal, sessionsCount, upcomingPracticeCount, nextPracticeDate }) => {
                  const progress = goal.targetSessions > 0
                    ? (goal.sessionsCompleted / goal.targetSessions) * 100
                    : 0;
                  
                  return (
                    <div key={goal.goalId} className="subject-card">
                      <div className="subject-card-header">
                        <h4 className="subject-name">{goal.subject}</h4>
                        <span className={`goal-status ${goal.status}`}>
                          {goal.status}
                        </span>
                      </div>
                      
                      <div className="subject-progress-bar">
                        <div className="progress-bar">
                          <div
                            className="progress-fill"
                            style={{ width: `${Math.min(progress, 100)}%` }}
                          />
                        </div>
                        <div className="progress-info">
                          <span className="progress-numbers">
                            {goal.sessionsCompleted} / {goal.targetSessions} sessions
                          </span>
                          <span className="progress-percentage">
                            {Math.round(progress)}%
                          </span>
                        </div>
                      </div>

                      <div className="subject-stats">
                        <div className="stat-item">
                          <span className="stat-icon">📚</span>
                          <span className="stat-text">{sessionsCount} completed</span>
                        </div>
                        {upcomingPracticeCount > 0 && (
                          <div className="stat-item">
                            <span className="stat-icon">📝</span>
                            <span className="stat-text">
                              {upcomingPracticeCount} practice{upcomingPracticeCount > 1 ? 's' : ''} upcoming
                            </span>
                          </div>
                        )}
                        {nextPracticeDate && (
                          <div className="stat-item">
                            <span className="stat-icon">⏰</span>
                            <span className="stat-text">
                              Next: {nextPracticeDate.toLocaleDateString()}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p>No active goals. Complete sessions to see your progress!</p>
            )}
          </div>

          {/* Subject Progress */}
          <div className="progress-section">
            <h3>Subject Progress</h3>
            {goals.length > 0 ? (
              <div className="goals-list">
                {goals.map((goal) => {
                  const progress = goal.targetSessions > 0
                    ? (goal.sessionsCompleted / goal.targetSessions) * 100
                    : 0;
                  
                  return (
                    <div key={goal.goalId} className="goal-progress-card">
                      <div className="goal-header">
                        <span className="goal-subject">{goal.subject}</span>
                        <span className={`goal-status ${goal.status}`}>
                          {goal.status}
                        </span>
                      </div>
                      <div className="progress-bar-container">
                        <div className="progress-bar">
                          <div
                            className="progress-fill"
                            style={{ width: `${Math.min(progress, 100)}%` }}
                          />
                        </div>
                        <div className="progress-text">
                          {goal.sessionsCompleted} / {goal.targetSessions} sessions
                        </div>
                      </div>
                      <div className="progress-percentage">
                        {Math.round(progress)}% complete
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p>No active goals. Complete sessions to see your progress!</p>
            )}
          </div>

          {/* Upcoming Practice Sessions */}
          {upcomingPractice.length > 0 && (
            <div className="progress-section">
              <h3>Upcoming Practice Sessions</h3>
              <div className="upcoming-practice-list">
                {upcomingPractice.map((practice) => {
                  const goal = goals.find(g => g.goalId === practice.goalId);
                  const scheduledDate = practice.scheduledFor?.toDate();
                  
                  return (
                    <div key={practice.id} className="practice-item-card">
                      <div className="practice-header">
                        <span className="practice-subject">
                          {goal?.subject || 'Practice'}
                        </span>
                        <span className="practice-status">{practice.status}</span>
                      </div>
                      <div className="practice-details">
                        <span className="practice-date">
                          📅 {scheduledDate?.toLocaleDateString() || 'Scheduled'}
                        </span>
                        <span className="practice-questions">
                          {practice.questions?.length || 0} questions
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recent Sessions */}
          <div className="progress-section">
            <h3>Recent Sessions</h3>
            {recentSessions.length > 0 ? (
              <div className="sessions-list">
                {recentSessions.map((session) => (
                  <div key={session.id} className="session-card">
                    <div className="session-info">
                      <span className="session-subject">{session.subject}</span>
                      <span className="session-date">
                        {session.date?.toDate?.().toLocaleDateString() || 'Recent'}
                      </span>
                    </div>
                    {session.tutorName && (
                      <div className="session-tutor">with {session.tutorName}</div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p>No sessions yet. Start your first tutoring session to see progress!</p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default Progress;
