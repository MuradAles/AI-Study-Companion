import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, Timestamp, doc, orderBy } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import Navigation from '../Shared/Navigation';
import './Progress.css';

interface Goal {
  goalId: string;
  subject: string;
  status: string;
  sessionsCompleted: number;
  targetSessions: number;
}

interface CrossSellSuggestion {
  completedSubject: string;
  suggestions: string[];
  createdAt: any;
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
  subject: string;
  date: Timestamp;
  tutorName?: string;
  status?: string;
  transcript?: string;
  aiAnalysis?: TranscriptAnalysis;
  processingError?: string;
}


interface PracticeStats {
  totalAnswered: number;
  correctAnswers: number;
  totalPoints: number;
}

interface Badge {
  badgeId: string;
  emoji: string;
  name: string;
  earnedAt: string;
}

interface Gamification {
  totalPoints: number;
  level: number;
  currentStreak: number;
  longestStreak: number;
  badges: Badge[] | string[]; // Support both formats for backward compatibility
  dailyGoals: {
    date: string;
    target: number;
    completed: number;
    status: string;
  };
}

function Progress() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const userId = currentUser?.uid || '';
  const [goals, setGoals] = useState<Goal[]>([]);
  const [recentSessions, setRecentSessions] = useState<Session[]>([]);
  const [practiceStats, setPracticeStats] = useState<PracticeStats>({
    totalAnswered: 0,
    correctAnswers: 0,
    totalPoints: 0,
  });
  const [gamification, setGamification] = useState<Gamification | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [crossSellSuggestions, setCrossSellSuggestions] = useState<CrossSellSuggestion[]>([]);

  // Load student goals, gamification, and cross-sell suggestions
  useEffect(() => {
    if (!userId) return;

    const unsubscribe = onSnapshot(
      doc(db, 'students', userId),
      (docSnapshot) => {
        if (docSnapshot.exists()) {
          const data = docSnapshot.data();
          setGoals(data.goals || []);
          setGamification(data.gamification || null);
          setCrossSellSuggestions(data.crossSellSuggestions || []);
        }
        setLoading(false);
      },
      (error) => {
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
      orderBy('date', 'desc')
      // Remove limit to get all sessions for better viewing
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
        // If index error (failed-precondition), fallback to query without orderBy
        if (error.code === 'failed-precondition') {
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
            setRecentSessions(sortedSessions); // Show all sessions, not just 10
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

  // Load practice statistics
  useEffect(() => {
    if (!userId) return;

    const practiceQuery = query(
      collection(db, 'practice_items'),
      where('studentId', '==', userId),
    );

    const unsubscribe = onSnapshot(
      practiceQuery,
      (snapshot) => {
        let totalAnswered = 0;
        let correctAnswers = 0;
        let totalPoints = 0;

        snapshot.docs.forEach(doc => {
          try {
            const data = doc.data();

            // Calculate stats from completed practice
            if (data.responses && Array.isArray(data.responses)) {
              data.responses.forEach((response: any) => {
                if (response) {
                  totalAnswered++;
                  if (response.isCorrect === true) {
                    correctAnswers++;
                  }
                  totalPoints += (response.pointsAwarded || 0);
                }
              });
            }
          } catch (error) {
            // Error processing practice item
          }
        });

        setPracticeStats({ totalAnswered, correctAnswers, totalPoints });
      },
      (error) => {
        // Set empty stats on error instead of crashing
        setPracticeStats({ totalAnswered: 0, correctAnswers: 0, totalPoints: 0 });
      }
    );

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

  // Get unique subjects ONLY from ACTUAL SESSIONS (not from goals)
  // This ensures we only show subjects that have sessions, not goals without sessions
  const uniqueSubjectsFromSessions = Array.from(new Set(recentSessions.map(s => s.subject)));
  const uniqueSubjects = uniqueSubjectsFromSessions; // ONLY use subjects that have sessions
  
  // Calculate subject-specific statistics based on ACTUAL SESSIONS
  // Iterate over subjects from sessions only, not goals, to ensure we only show subjects with sessions
  const subjectStats = uniqueSubjects
    .filter(subject => !selectedSubject || subject === selectedSubject)
    .map(subject => {
      // Find matching goal for this subject, or create a default one
      const matchingGoal = goals.find(g => g.subject === subject);
      const subjectSessions = recentSessions.filter(s => s.subject === subject);
      const actualSessionsCompleted = subjectSessions.length;
      
      // Only create a goal structure if there are actual sessions for this subject
      const goal = matchingGoal || {
        goalId: `goal-${subject.toLowerCase().replace(/\s+/g, '-')}`,
        subject: subject,
        status: 'active',
        sessionsCompleted: 0,
        targetSessions: 10, // Default target if no goal exists
      };
      
      return {
        goal,
        sessionsCount: actualSessionsCompleted,
        actualSessionsCompleted,
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
                {gamification.badges.map((badge, index) => {
                  // Handle both object and string formats for backward compatibility
                  const badgeName = typeof badge === 'string' ? badge : badge.name;
                  const badgeEmoji = typeof badge === 'string' ? '🏆' : badge.emoji;
                  const badgeKey = typeof badge === 'string' ? badge : badge.badgeId || index;
                  
                  return (
                    <div key={badgeKey} className="badge-item">
                      <span className="badge-icon">{badgeEmoji}</span>
                      <span className="badge-name">{badgeName}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Session Progress by Subject */}
          <div className="progress-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <h3>Session Progress by Subject</h3>
                <p style={{ margin: '10px 0 0 0', color: '#666', fontSize: '14px', maxWidth: '600px', lineHeight: '1.6' }}>
                  <strong>What this means:</strong> This tracks how many <strong>tutoring sessions</strong> you've completed for each subject (e.g., "3/10 Math sessions completed"). 
                  The count comes from your <strong>Recent Sessions</strong> - each tutoring session you complete is counted toward your goal. 
                  This tracks practice question completion.
                </p>
              </div>
              {uniqueSubjects.length > 1 && (
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setSelectedSubject(null)}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: selectedSubject === null ? '#667eea' : '#f0f0f0',
                      color: selectedSubject === null ? 'white' : '#333',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: selectedSubject === null ? 'bold' : 'normal'
                    }}
                  >
                    All Subjects
                  </button>
                  {uniqueSubjects.map(subject => (
                    <button
                      key={subject}
                      onClick={() => setSelectedSubject(subject)}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: selectedSubject === subject ? '#667eea' : '#f0f0f0',
                        color: selectedSubject === subject ? 'white' : '#333',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: selectedSubject === subject ? 'bold' : 'normal'
                      }}
                    >
                      {subject}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {subjectStats.length > 0 ? (
              <div className="subjects-grid">
                {subjectStats.map(({ goal, sessionsCount, actualSessionsCompleted }) => {
                  // Use actual count from Recent Sessions, not goal.sessionsCompleted (which may not be updated)
                  const progress = goal.targetSessions > 0
                    ? (actualSessionsCompleted / goal.targetSessions) * 100
                    : 0;
                  
                  // Find cross-sell suggestions for this completed goal
                  const goalSuggestions = goal.status === 'completed' 
                    ? crossSellSuggestions.find(cs => cs.completedSubject === goal.subject)
                    : null;
                  
                  return (
                    <div key={goal.goalId} className="subject-card">
                      <div className="subject-card-header">
                        <h4 className="subject-name">{goal.subject}</h4>
                        <span className={`goal-status ${goal.status}`}>
                          {goal.status === 'completed' ? '✓ COMPLETE' : goal.status}
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
                            {actualSessionsCompleted} / {goal.targetSessions} sessions
                          </span>
                          <span className="progress-percentage">
                            {Math.round(progress)}%
                          </span>
                        </div>
                      </div>

                      <div className="subject-stats">
                        <div className="stat-item">
                          <span className="stat-icon">📚</span>
                          <span className="stat-text">{sessionsCount} session{sessionsCount !== 1 ? 's' : ''} completed</span>
                        </div>
                      </div>

                      {/* Cross-Sell Suggestions for Completed Goals */}
                      {goal.status === 'completed' && goalSuggestions && goalSuggestions.suggestions.length > 0 && (
                        <div className="cross-sell-section">
                          <p className="cross-sell-label">💡 Suggested Next Steps:</p>
                          <div className="cross-sell-suggestions">
                            {goalSuggestions.suggestions.map((subject, idx) => (
                              <button
                                key={idx}
                                className="cross-sell-button"
                                onClick={() => {
                                  // Navigate to dashboard to book meeting with this subject
                                  navigate('/dashboard');
                                }}
                              >
                                {subject} →
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p>No active goals. Complete sessions to see your progress!</p>
            )}
          </div>


          {/* Recent Sessions */}
          <div className="progress-section">
            <h3>Recent Sessions</h3>
            {recentSessions.length > 0 ? (
              <div style={{
                backgroundColor: '#fff',
                borderRadius: '8px',
                border: '1px solid #e0e0e0',
                overflow: 'hidden'
              }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse'
                }}>
                  <thead>
                    <tr style={{
                      backgroundColor: '#f8f9fa',
                      borderBottom: '2px solid #e0e0e0'
                    }}>
                      <th style={{
                        padding: '12px 16px',
                        textAlign: 'left',
                        fontSize: '14px',
                        fontWeight: '600',
                        color: '#333',
                        borderBottom: '2px solid #e0e0e0'
                      }}>Subject</th>
                      <th style={{
                        padding: '12px 16px',
                        textAlign: 'left',
                        fontSize: '14px',
                        fontWeight: '600',
                        color: '#333',
                        borderBottom: '2px solid #e0e0e0'
                      }}>Tutor</th>
                      <th style={{
                        padding: '12px 16px',
                        textAlign: 'left',
                        fontSize: '14px',
                        fontWeight: '600',
                        color: '#333',
                        borderBottom: '2px solid #e0e0e0'
                      }}>Date</th>
                      <th style={{
                        padding: '12px 16px',
                        textAlign: 'left',
                        fontSize: '14px',
                        fontWeight: '600',
                        color: '#333',
                        borderBottom: '2px solid #e0e0e0'
                      }}>Status</th>
                      <th style={{
                        padding: '12px 16px',
                        textAlign: 'left',
                        fontSize: '14px',
                        fontWeight: '600',
                        color: '#333',
                        borderBottom: '2px solid #e0e0e0'
                      }}>Topics</th>
                      <th style={{
                        padding: '12px 16px',
                        textAlign: 'center',
                        fontSize: '14px',
                        fontWeight: '600',
                        color: '#333',
                        borderBottom: '2px solid #e0e0e0'
                      }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentSessions.map((session, index) => {
                      const sessionDate = session.date?.toDate?.() || new Date();
                      const isExpanded = expandedSessionId === session.id;
                      const status = session.aiAnalysis ? 'Processed' : session.processingError ? 'Error' : 'Processing';
                      const statusColor = session.aiAnalysis ? '#4caf50' : session.processingError ? '#f44336' : '#ff9800';
                      const topicsCount = session.aiAnalysis?.topicsCovered?.length || 0;
                      
                      return (
                        <React.Fragment key={session.id}>
                          <tr
                            style={{
                              backgroundColor: index % 2 === 0 ? '#fff' : '#fafafa',
                              borderBottom: '1px solid #e0e0e0',
                              cursor: 'pointer',
                              transition: 'background-color 0.2s'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = '#f0f0f0';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = index % 2 === 0 ? '#fff' : '#fafafa';
                            }}
                          >
                            <td style={{
                              padding: '16px',
                              fontSize: '15px',
                              fontWeight: '500',
                              color: '#333'
                            }}>
                              {session.subject}
                            </td>
                            <td style={{
                              padding: '16px',
                              fontSize: '14px',
                              color: '#666'
                            }}>
                              {session.tutorName || 'N/A'}
                            </td>
                            <td style={{
                              padding: '16px',
                              fontSize: '14px',
                              color: '#666'
                            }}>
                              {sessionDate.toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric'
                              })}
                            </td>
                            <td style={{
                              padding: '16px',
                              fontSize: '14px'
                            }}>
                              <span style={{
                                padding: '4px 12px',
                                borderRadius: '12px',
                                backgroundColor: statusColor + '20',
                                color: statusColor,
                                fontWeight: '500',
                                fontSize: '12px'
                              }}>
                                {status}
                              </span>
                            </td>
                            <td style={{
                              padding: '16px',
                              fontSize: '14px',
                              color: '#666'
                            }}>
                              {topicsCount > 0 ? (
                                <span style={{
                                  padding: '4px 10px',
                                  backgroundColor: '#e8f0fe',
                                  color: '#667eea',
                                  borderRadius: '12px',
                                  fontSize: '12px',
                                  fontWeight: '500'
                                }}>
                                  {topicsCount} topic{topicsCount !== 1 ? 's' : ''}
                                </span>
                              ) : (
                                <span style={{ color: '#999' }}>—</span>
                              )}
                            </td>
                            <td style={{
                              padding: '16px',
                              textAlign: 'center'
                            }}>
                              <button
                                onClick={() => setExpandedSessionId(isExpanded ? null : session.id)}
                                style={{
                                  padding: '6px 14px',
                                  backgroundColor: isExpanded ? '#667eea' : '#f0f0f0',
                                  color: isExpanded ? 'white' : '#333',
                                  border: 'none',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  fontSize: '13px',
                                  fontWeight: '500',
                                  transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => {
                                  if (!isExpanded) {
                                    e.currentTarget.style.backgroundColor = '#e0e0e0';
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (!isExpanded) {
                                    e.currentTarget.style.backgroundColor = '#f0f0f0';
                                  }
                                }}
                              >
                                {isExpanded ? 'Hide' : 'View'}
                              </button>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan={6} style={{
                                padding: '0',
                                backgroundColor: '#fafafa'
                              }}>
                                <div style={{
                                  padding: '24px',
                                  borderTop: '2px solid #e0e0e0'
                                }}>
                                  {session.aiAnalysis && (
                                    <div style={{ marginBottom: '24px' }}>
                                      <h5 style={{
                                        margin: '0 0 16px 0',
                                        fontSize: '18px',
                                        color: '#333',
                                        fontWeight: '600'
                                      }}>
                                        AI Analysis
                                      </h5>
                                      
                                      {session.aiAnalysis.topicsCovered && session.aiAnalysis.topicsCovered.length > 0 && (
                                        <div style={{ marginBottom: '16px' }}>
                                          <strong style={{
                                            fontSize: '14px',
                                            color: '#667eea',
                                            display: 'block',
                                            marginBottom: '8px'
                                          }}>
                                            Topics Covered:
                                          </strong>
                                          <div style={{
                                            display: 'flex',
                                            flexWrap: 'wrap',
                                            gap: '8px'
                                          }}>
                                            {session.aiAnalysis.topicsCovered.map((topic, idx) => (
                                              <span key={idx} style={{
                                                padding: '6px 14px',
                                                backgroundColor: '#e8f0fe',
                                                color: '#667eea',
                                                borderRadius: '16px',
                                                fontSize: '13px',
                                                fontWeight: '500'
                                              }}>
                                                {topic}
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                      
                                      <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: '1fr 1fr',
                                        gap: '20px',
                                        marginBottom: '16px'
                                      }}>
                                        {session.aiAnalysis.studentStrengths && session.aiAnalysis.studentStrengths.length > 0 && (
                                          <div>
                                            <strong style={{
                                              fontSize: '14px',
                                              color: '#4caf50',
                                              display: 'block',
                                              marginBottom: '8px'
                                            }}>
                                              Strengths:
                                            </strong>
                                            <ul style={{
                                              margin: '0',
                                              paddingLeft: '20px',
                                              fontSize: '14px',
                                              color: '#555',
                                              lineHeight: '1.6'
                                            }}>
                                              {session.aiAnalysis.studentStrengths.map((strength, idx) => (
                                                <li key={idx}>{strength}</li>
                                              ))}
                                            </ul>
                                          </div>
                                        )}
                                        
                                        {session.aiAnalysis.studentStruggles && session.aiAnalysis.studentStruggles.length > 0 && (
                                          <div>
                                            <strong style={{
                                              fontSize: '14px',
                                              color: '#f44336',
                                              display: 'block',
                                              marginBottom: '8px'
                                            }}>
                                              Areas to Improve:
                                            </strong>
                                            <ul style={{
                                              margin: '0',
                                              paddingLeft: '20px',
                                              fontSize: '14px',
                                              color: '#555',
                                              lineHeight: '1.6'
                                            }}>
                                              {session.aiAnalysis.studentStruggles.map((struggle, idx) => (
                                                <li key={idx}>{struggle}</li>
                                              ))}
                                            </ul>
                                          </div>
                                        )}
                                      </div>
                                      
                                      {session.aiAnalysis.confidenceLevel && (
                                        <div style={{
                                          padding: '12px 16px',
                                          backgroundColor: '#f8f9fa',
                                          borderRadius: '8px',
                                          marginBottom: '16px'
                                        }}>
                                          <strong style={{
                                            fontSize: '14px',
                                            color: '#333',
                                            marginRight: '10px'
                                          }}>
                                            Confidence Level:
                                          </strong>
                                          <span style={{
                                            fontSize: '16px',
                                            color: '#667eea',
                                            fontWeight: '600'
                                          }}>
                                            {session.aiAnalysis.confidenceLevel}/10
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  
                                  {session.transcript && (
                                    <div>
                                      <h5 style={{
                                        margin: '0 0 12px 0',
                                        fontSize: '18px',
                                        color: '#333',
                                        fontWeight: '600'
                                      }}>
                                        Transcript
                                      </h5>
                                      <div style={{
                                        maxHeight: '400px',
                                        overflowY: 'auto',
                                        padding: '16px',
                                        backgroundColor: '#f8f9fa',
                                        borderRadius: '8px',
                                        border: '1px solid #e0e0e0',
                                        fontSize: '14px',
                                        lineHeight: '1.7',
                                        color: '#555',
                                        whiteSpace: 'pre-wrap',
                                        wordWrap: 'break-word',
                                        fontFamily: 'monospace'
                                      }}>
                                        {session.transcript}
                                      </div>
                                    </div>
                                  )}
                                  
                                  {!session.aiAnalysis && !session.transcript && (
                                    <p style={{
                                      color: '#999',
                                      fontSize: '14px',
                                      fontStyle: 'italic',
                                      textAlign: 'center',
                                      padding: '20px'
                                    }}>
                                      No additional details available for this session.
                                    </p>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{
                padding: '40px',
                textAlign: 'center',
                color: '#999',
                fontSize: '16px'
              }}>
                No sessions yet. Start your first tutoring session to see progress!
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default Progress;
