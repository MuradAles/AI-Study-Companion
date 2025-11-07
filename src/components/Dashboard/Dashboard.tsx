import React, { useEffect, useState } from 'react';
import { doc, onSnapshot, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useInitializeStudent } from '../../hooks/useInitializeStudent';
import { useNavigate } from 'react-router-dom';
import Navigation from '../Shared/Navigation';
import './Dashboard.css';

interface Student {
  id: string;
  name: string;
  gamification: {
    totalPoints: number;
    currentStreak: number;
    level: number;
    dailyGoals: {
      date: string;
      target: number;
      completed: number;
    };
  };
}

interface Session {
  id: string;
  subject: string;
  tutorName: string;
  status: string;
  questionsCount: number;
  createdAt: any;
  date: any;
}

interface Achievement {
  id: string;
  emoji: string;
  title: string;
  description: string;
  unlocked: boolean;
  progress?: number;
  target?: number;
}

function Dashboard() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [practiceCount, setPracticeCount] = useState(0);
  const [questionsAnswered, setQuestionsAnswered] = useState(0);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [topicsExplored, setTopicsExplored] = useState(0);
  const [achievements, setAchievements] = useState<Achievement[]>([]);

  useInitializeStudent();

  const userId = currentUser?.uid || '';

  // Load student data
  useEffect(() => {
    if (!userId) return;

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

  // Load practice count and topics
  useEffect(() => {
    if (!userId) return;

    const loadPracticeData = async () => {
      const practiceQuery = query(
        collection(db, 'practice_items'),
        where('studentId', '==', userId)
      );
      const snapshot = await getDocs(practiceQuery);
      
      let total = 0;
      const uniqueTopics = new Set<string>();
      
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const questions = data.questions || [];
        const responses = data.responses || [];
        const answeredIds = new Set(responses.map((r: any) => r.questionId));
        const unanswered = questions.filter((q: any) => !answeredIds.has(q.questionId));
        total += unanswered.length;
        
        // Count unique topics
        questions.forEach((q: any) => {
          if (q.topic) uniqueTopics.add(q.topic);
        });
      });
      
      setPracticeCount(total);
      setTopicsExplored(uniqueTopics.size);
    };

    loadPracticeData();
  }, [userId]);

  // Load stats and sessions
  useEffect(() => {
    if (!userId) return;

    const loadData = async () => {
      // Practice stats
      const practiceQuery = query(
        collection(db, 'practice_items'),
        where('studentId', '==', userId)
      );
      const practiceSnapshot = await getDocs(practiceQuery);
      
      let answered = 0;
      let correct = 0;
      
      practiceSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const responses = data.responses || [];
        responses.forEach((r: any) => {
          answered++;
          if (r.isCorrect) correct++;
        });
      });
      
      setQuestionsAnswered(answered);
      setCorrectAnswers(correct);

      // Sessions - simplified query without orderBy
      const sessionsQuery = query(
        collection(db, 'sessions'),
        where('studentId', '==', userId),
        limit(5)
      );
      const sessionsSnapshot = await getDocs(sessionsQuery);
      const sessionsData = sessionsSnapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Session))
        .sort((a, b) => {
          // Sort by createdAt in memory instead
          const aTime = a.createdAt?.toMillis?.() || 0;
          const bTime = b.createdAt?.toMillis?.() || 0;
          return bTime - aTime;
        });
      setSessions(sessionsData);
    };

    loadData();
  }, [userId]);

  // Calculate achievements
  useEffect(() => {
    const stars = Math.floor(questionsAnswered / 3);
    const streak = student?.gamification?.currentStreak || 0;
    
    const achievementsList: Achievement[] = [
      {
        id: 'first_steps',
        emoji: '🎯',
        title: 'First Steps',
        description: 'Answer your first question',
        unlocked: questionsAnswered >= 1,
      },
      {
        id: 'explorer',
        emoji: '📚',
        title: 'Explorer',
        description: 'Explore 3 different topics',
        unlocked: topicsExplored >= 3,
        progress: topicsExplored,
        target: 3,
      },
      {
        id: 'dedicated',
        emoji: '🔥',
        title: 'Dedicated',
        description: 'Maintain a 3-day streak',
        unlocked: streak >= 3,
        progress: streak,
        target: 3,
      },
      {
        id: 'problem_solver',
        emoji: '⚡',
        title: 'Problem Solver',
        description: 'Solve 10 questions',
        unlocked: questionsAnswered >= 10,
        progress: questionsAnswered,
        target: 10,
      },
      {
        id: 'star_collector',
        emoji: '⭐',
        title: 'Star Collector',
        description: 'Earn 10 stars',
        unlocked: stars >= 10,
        progress: stars,
        target: 10,
      },
      {
        id: 'accuracy_master',
        emoji: '🎓',
        title: 'Accuracy Master',
        description: 'Achieve 80% accuracy',
        unlocked: questionsAnswered >= 5 && (correctAnswers / questionsAnswered) >= 0.8,
        progress: questionsAnswered >= 5 ? Math.round((correctAnswers / questionsAnswered) * 100) : 0,
        target: 80,
      },
    ];
    
    setAchievements(achievementsList);
  }, [questionsAnswered, correctAnswers, topicsExplored, student]);

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
    currentStreak: 0,
    level: 1,
    dailyGoals: { date: '', target: 3, completed: 0 },
  };

  const today = new Date().toISOString().split('T')[0];
  const isToday = gamification.dailyGoals.date === today;
  const completed = isToday ? gamification.dailyGoals.completed : 0;
  const target = gamification.dailyGoals.target || 3;
  const accuracy = questionsAnswered > 0 ? Math.round((correctAnswers / questionsAnswered) * 100) : 0;
  const stars = Math.floor(questionsAnswered / 3);
  
  // Calculate level based on total points (every 100 points = 1 level)
  const currentLevel = Math.floor(gamification.totalPoints / 100) + 1;
  const pointsForNextLevel = 100;
  const pointsProgress = gamification.totalPoints % 100;

  const unlockedAchievements = achievements.filter(a => a.unlocked);
  const lockedAchievements = achievements.filter(a => !a.unlocked);

  const handleSessionClick = (sessionId: string) => {
    navigate(`/session/${sessionId}`);
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>AI Study Companion</h1>
        <Navigation />
      </header>
      <main className="dashboard-main">
        <div className="dashboard-content">
          
          {/* Profile Header */}
          <div className="profile-header">
            <div className="profile-info">
              <div className="profile-avatar">🧙‍♂️</div>
              <div className="profile-text">
                <h2>{student?.name || 'Student'}</h2>
                <p className="profile-title">Level {currentLevel} • Learning Champion</p>
              </div>
            </div>
            <div className="level-progress">
              <div className="level-info">
                <span className="level-text">Level {currentLevel}</span>
                <span className="points-text">{pointsProgress}/{pointsForNextLevel} pts to Level {currentLevel + 1}</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${(pointsProgress / pointsForNextLevel) * 100}%` }} />
              </div>
            </div>
          </div>

          {/* Stats Cards with Emojis */}
          <div className="stats-grid">
            <div className="stat-card blue-card">
              <div className="stat-icon">🎯</div>
              <div className="stat-info">
                <div className="stat-value">{questionsAnswered}</div>
                <div className="stat-name">Problems Solved</div>
              </div>
            </div>
            <div className="stat-card pink-card">
              <div className="stat-icon">📚</div>
              <div className="stat-info">
                <div className="stat-value">{topicsExplored}</div>
                <div className="stat-name">Topics Explored</div>
              </div>
            </div>
            <div className="stat-card yellow-card">
              <div className="stat-icon">⭐</div>
              <div className="stat-info">
                <div className="stat-value">{stars}</div>
                <div className="stat-name">Stars Earned</div>
              </div>
            </div>
          </div>

          {/* Today's Goal + Practice Questions */}
          <div className="top-row">
            <div className="daily-goal-compact">
              <span className="goal-label">Today's Goal</span>
              <div className="goal-progress">
                <span className="goal-number">{completed}/{target}</span>
                <div className="goal-bar">
                  <div 
                    className="goal-bar-fill" 
                    style={{ width: `${(completed / target) * 100}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="practice-questions-card">
              <span className="questions-label">Practice Questions</span>
              <div className="questions-content">
                <span className="questions-number">{practiceCount}</span>
                <button 
                  className="start-button" 
                  onClick={() => navigate('/practice')}
                  disabled={practiceCount === 0}
                >
                  {practiceCount > 0 ? 'Start' : 'None'}
                </button>
              </div>
            </div>
          </div>

          {/* Achievements Section */}
          <div className="achievements-section">
            <div className="achievements-header">
              <h3>🏆 Your Achievements</h3>
              <div className="achievement-count">
                {unlockedAchievements.length} / {achievements.length}
              </div>
            </div>
            
            <div className="achievements-tabs">
              <div className="tab active">
                <span className="tab-icon">🎉</span>
                Unlocked ({unlockedAchievements.length})
              </div>
              <div className="tab">
                <span className="tab-icon">🔒</span>
                To Unlock ({lockedAchievements.length})
              </div>
            </div>

            <div className="achievements-grid">
              {unlockedAchievements.map(achievement => (
                <div key={achievement.id} className="achievement-card unlocked">
                  <div className="achievement-emoji">{achievement.emoji}</div>
                  <div className="achievement-content">
                    <h4>{achievement.title}</h4>
                    <p>{achievement.description}</p>
                    <div className="achievement-badge">✨ Unlocked</div>
                  </div>
                </div>
              ))}
              {lockedAchievements.map(achievement => (
                <div key={achievement.id} className="achievement-card locked">
                  <div className="achievement-emoji grayscale">{achievement.emoji}</div>
                  <div className="achievement-content">
                    <h4>{achievement.title}</h4>
                    <p>{achievement.description}</p>
                    {achievement.progress !== undefined && achievement.target && (
                      <div className="achievement-progress">
                        <div className="progress-mini-bar">
                          <div 
                            className="progress-mini-fill" 
                            style={{ width: `${(achievement.progress / achievement.target) * 100}%` }}
                          />
                        </div>
                        <span className="progress-text">{achievement.progress}/{achievement.target}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sessions */}
          {sessions.length > 0 && (
            <div className="sessions-section">
              <h3>📝 My Sessions</h3>
              <div className="sessions-table-container">
                <table className="sessions-table">
                  <thead>
                    <tr>
                      <th>Subject/Topic</th>
                      <th>Tutor Name</th>
                      <th>Last Met</th>
                      <th>Schedule Meeting</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map(session => {
                      const sessionDate = session.date?.toDate?.() || session.createdAt?.toDate?.() || new Date();
                      return (
                        <tr key={session.id}>
                          <td className="session-subject-cell">{session.subject}</td>
                          <td className="session-tutor-cell">{session.tutorName || 'N/A'}</td>
                          <td className="session-date-cell">
                            {sessionDate.toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </td>
                          <td className="session-action-cell">
                            <button 
                              className="schedule-meeting-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                alert(`Schedule meeting with ${session.tutorName} for ${session.subject} - Coming soon!`);
                              }}
                            >
                              📅 Book Meeting
                            </button>
                          </td>
                          <td className="session-action-cell">
                            <button 
                              className="view-details-btn"
                              onClick={() => navigate(`/session/${session.id}`)}
                            >
                              View Details →
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default Dashboard;
