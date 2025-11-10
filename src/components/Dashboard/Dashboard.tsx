import React, { useEffect, useState } from 'react';
import { doc, onSnapshot, collection, query, where, getDocs, limit, updateDoc, orderBy } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import BookMeetingModal from './BookMeetingModal';
import './Dashboard.css';

interface Student {
  id: string;
  name: string;
  goals?: Array<{
    goalId: string;
    subject: string;
    status: 'active' | 'completed' | 'paused';
  }>;
  crossSellSuggestions?: Array<{
    completedSubject: string;
    suggestions: string[];
    createdAt: any;
  }>;
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

interface Booking {
  id: string;
  tutorName: string;
  subject: string;
  topic: string;
  date: any;
  status: string;
  createdAt: any;
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

interface Notification {
  id: string;
  type: 'booking_nudge' | 'cross_sell' | 'streak_reminder' | 'practice_reminder' | 'achievement';
  title: string;
  body: string;
  read: boolean;
  sentAt: any;
  suggestions?: string[];
  completedSubject?: string;
  sessionCount?: number;
}

function Dashboard() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [questionsAnswered, setQuestionsAnswered] = useState(0);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [topicsExplored, setTopicsExplored] = useState(0);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [dismissedBanners, setDismissedBanners] = useState<Set<string>>(new Set());

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
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [userId]);

  // Load topics explored
  useEffect(() => {
    if (!userId) return;

    const loadTopicsData = async () => {
      const uniqueTopics = new Set<string>();
      
      // Load practice_items (session-generated questions) to count topics
      const practiceQuery = query(
        collection(db, 'practice_items'),
        where('studentId', '==', userId)
      );
      const practiceSnapshot = await getDocs(practiceQuery);
      
      practiceSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const questions = data.questions || [];
        const responses = data.responses || [];
        const answeredIds = new Set(responses.map((r: any) => r.questionId));
        
        // Count unique topics from practice_items questions the user has answered
        questions.forEach((q: any) => {
          if (answeredIds.has(q.questionId) && q.topic) {
            uniqueTopics.add(q.topic);
          }
        });
      });

      // Load user responses to shared questions to count topics they've explored
      const userResponsesQuery = query(
        collection(db, 'user_responses'),
        where('studentId', '==', userId)
      );
      const userResponsesSnapshot = await getDocs(userResponsesQuery);
      
      // Get unique question IDs the user has answered
      const answeredQuestionIds = new Set(
        userResponsesSnapshot.docs.map(doc => doc.data().questionId)
      );
      
      // Load shared questions that the user has answered to get their topics
      if (answeredQuestionIds.size > 0) {
        const sharedQuestionsQuery = query(
          collection(db, 'questions')
        );
        const sharedQuestionsSnapshot = await getDocs(sharedQuestionsQuery);
        
        sharedQuestionsSnapshot.docs.forEach(doc => {
          const data = doc.data();
          // Only count topics from questions the user has actually answered
          if (answeredQuestionIds.has(doc.id)) {
            // Shared questions can have 'topics' (array), 'topic' (string), or 'subject'
            if (data.topics && Array.isArray(data.topics)) {
              data.topics.forEach((topic: string) => uniqueTopics.add(topic));
            } else if (data.topic) {
              uniqueTopics.add(data.topic);
            } else if (data.subject) {
              uniqueTopics.add(data.subject);
            }
          }
        });
      }
      
      setTopicsExplored(uniqueTopics.size);
    };

    loadTopicsData();
  }, [userId]);

  // Load stats and sessions
  useEffect(() => {
    if (!userId) return;

    const loadData = async () => {
      // Practice stats from practice_items (session-generated questions)
      const practiceQuery = query(
        collection(db, 'practice_items'),
        where('studentId', '==', userId)
      );
      const practiceSnapshot = await getDocs(practiceQuery);
      
      let correctFromPractice = 0;
      
      practiceSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const responses = data.responses || [];
        // Count only correct answers from practice_items
        responses.forEach((r: any) => {
          if (r.isCorrect) correctFromPractice++;
        });
      });

      // Also count correct answers from shared questions (user_responses collection)
      const userResponsesQuery = query(
        collection(db, 'user_responses'),
        where('studentId', '==', userId)
      );
      const userResponsesSnapshot = await getDocs(userResponsesQuery);
      
      let correctFromShared = 0;
      userResponsesSnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.isCorrect) {
          correctFromShared++;
        }
      });

      // Total correct answers (problems solved) = correct from both sources
      const totalCorrect = correctFromPractice + correctFromShared;
      
      setQuestionsAnswered(totalCorrect); // Show only correctly solved questions
      setCorrectAnswers(totalCorrect);

      // Real-time listener for sessions
      const sessionsQuery = query(
        collection(db, 'sessions'),
        where('studentId', '==', userId),
        limit(5)
      );
      
      const unsubscribeSessions = onSnapshot(sessionsQuery, (snapshot) => {
        const sessionsData = snapshot.docs
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
      });

      // Real-time listener for bookings
      const bookingsQuery = query(
        collection(db, 'booking_requests'),
        where('studentId', '==', userId)
      );
      
      const unsubscribeBookings = onSnapshot(bookingsQuery, (snapshot) => {
        const bookingsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Booking));
        
        // Sort by date (upcoming first)
        bookingsData.sort((a, b) => {
          const aDate = a.date?.toMillis?.() || 0;
          const bDate = b.date?.toMillis?.() || 0;
          return aDate - bDate;
        });
        
        setBookings(bookingsData);
      });

      // Cleanup listeners on unmount
      return () => {
        unsubscribeSessions();
        unsubscribeBookings();
      };
    };

    loadData();
  }, [userId]);

  // Load notifications for booking nudges and cross-sell
  useEffect(() => {
    if (!userId) return;

    const notificationsQuery = query(
      collection(db, 'notifications'),
      where('studentId', '==', userId),
      where('read', '==', false),
      orderBy('sentAt', 'desc'),
      limit(10)
    );

    const unsubscribeNotifications = onSnapshot(notificationsQuery, (snapshot) => {
      const notificationsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Notification[];
      setNotifications(notificationsData);
    }, (error) => {
      // Error handled silently
    });

    return unsubscribeNotifications;
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

  // Get today's date in YYYY-MM-DD format (using UTC to match backend)
  // Backend uses: new Date().toISOString().split('T')[0] which is UTC
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

  const handleBookMeeting = (session?: Session) => {
    if (session) {
      setSelectedSession(session);
    } else {
      setSelectedSession(null);
    }
    setIsBookingModalOpen(true);
  };

  // Find booking for a specific session (by tutor name)
  const getBookingForSession = (session: Session): Booking | undefined => {
    return bookings.find(
      booking => 
        booking.tutorName === session.tutorName && 
        booking.status === 'pending' &&
        booking.date?.toMillis?.() >= Date.now() // Only future bookings
    );
  };

  const handleCloseBookingModal = () => {
    setIsBookingModalOpen(false);
    setSelectedSession(null);
  };

  // Get booking nudge notification (most recent unread)
  const bookingNudge = notifications.find(n => n.type === 'booking_nudge' && !dismissedBanners.has(n.id));

  // Get cross-sell suggestions from student document or notifications
  const crossSellNotification = notifications.find(n => n.type === 'cross_sell' && !dismissedBanners.has(n.id));
  const crossSellFromStudent = student?.crossSellSuggestions?.[0];
  const crossSellData = crossSellNotification || crossSellFromStudent;
  const crossSellId = crossSellNotification?.id || 'cross-sell-student';

  // Check if student is at risk (<3 sessions by Day 7)
  const isAtRisk = bookingNudge !== undefined;

  // Handle banner dismissal
  const handleDismissBanner = (bannerId: string) => {
    setDismissedBanners(prev => new Set(prev).add(bannerId));
    // Mark notification as read
    const notificationRef = doc(db, 'notifications', bannerId);
    updateDoc(notificationRef, { read: true });
  };

  // Handle cross-sell subject click
  const handleCrossSellClick = (subject: string) => {
    // Navigate to booking modal with suggested subject
    handleBookMeeting();
    // Could pre-fill subject in modal if needed
  };

  return (
    <div className="dashboard">
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

          {/* Booking Nudge Banner (<3 sessions by Day 7) */}
          {isAtRisk && bookingNudge && (
            <div className="banner booking-nudge-banner">
              <div className="banner-content">
                <div className="banner-icon">📚</div>
                <div className="banner-text">
                  <h3 className="banner-title">{bookingNudge.title}</h3>
                  <p className="banner-body">{bookingNudge.body}</p>
                  {bookingNudge.sessionCount !== undefined && (
                    <p className="banner-subtitle">
                      You've completed {bookingNudge.sessionCount} session(s). Students who book 3+ in week 1 see 40% better results!
                    </p>
                  )}
                </div>
                <div className="banner-actions">
                  <button 
                    className="banner-button primary"
                    onClick={() => handleBookMeeting()}
                  >
                    Book Next Session →
                  </button>
                  <button 
                    className="banner-dismiss"
                    onClick={() => handleDismissBanner(bookingNudge.id)}
                    aria-label="Dismiss"
                  >
                    ×
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Cross-Sell Banner (Goal Completion) */}
          {crossSellData && crossSellData.suggestions && crossSellData.suggestions.length > 0 && (
            <div className="banner cross-sell-banner">
              <div className="banner-content">
                <div className="banner-icon">🎉</div>
                <div className="banner-text">
                  <h3 className="banner-title">
                    {crossSellData.completedSubject 
                      ? `Congrats on completing ${crossSellData.completedSubject}!`
                      : 'Want to try something new?'}
                  </h3>
                  <p className="banner-body">Students like you often enjoy:</p>
                  <div className="suggestions-grid">
                    {crossSellData.suggestions.map((subject, idx) => (
                      <button
                        key={idx}
                        className="suggestion-chip"
                        onClick={() => handleCrossSellClick(subject)}
                      >
                        {subject}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="banner-actions">
                  <button 
                    className="banner-button secondary"
                    onClick={() => navigate('/progress')}
                  >
                    View Progress →
                  </button>
                  <button 
                    className="banner-dismiss"
                    onClick={() => {
                      if (crossSellNotification) {
                        handleDismissBanner(crossSellId);
                      } else {
                        // If from student document, just hide it
                        setDismissedBanners(prev => new Set(prev).add(crossSellId));
                      }
                    }}
                    aria-label="Dismiss"
                  >
                    ×
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Today's Goal and Book Meeting */}
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
            <div className="book-meeting-card">
              <div className="book-meeting-content">
                <div className="book-meeting-icon">📅</div>
                <div className="book-meeting-text">
                  <h3>Book a Meeting</h3>
                  <p>Schedule your next tutoring session</p>
                </div>
                <button 
                  className="book-meeting-button"
                  onClick={() => handleBookMeeting()}
                >
                  Book Now
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
                      const existingBooking = getBookingForSession(session);
                      const bookingDate = existingBooking?.date?.toDate?.();
                      
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
                            {existingBooking && bookingDate ? (
                              <div className="booking-info">
                                <div className="booking-date-display">
                                  <span className="booking-icon">📅</span>
                                  <span className="booking-text">
                                    {bookingDate.toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric'
                                    })}
                                    {' at '}
                                    {bookingDate.toLocaleTimeString('en-US', {
                                      hour: 'numeric',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                </div>
                                <button 
                                  className="schedule-meeting-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleBookMeeting(session);
                                  }}
                                >
                                  View/Edit
                                </button>
                              </div>
                            ) : (
                            <button 
                              className="schedule-meeting-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                  handleBookMeeting(session);
                              }}
                            >
                              📅 Book Meeting
                            </button>
                            )}
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

          {/* All Booking Requests - Moved to bottom */}
          {bookings.length > 0 && (() => {
            const pendingBookings = bookings.filter(b => b.status === 'pending');
            const acceptedBookings = bookings.filter(b => b.status === 'accepted');
            
            return (
              <div className="card bookings-status-section">
                <h3>📅 Your Tutoring Requests</h3>
                
                {/* Pending Requests First */}
                {pendingBookings.length > 0 && (
                  <div className="bookings-group">
                    <h4 className="bookings-group-title">⏳ Pending Requests</h4>
                    <div className="bookings-status-list">
                      {pendingBookings.map(booking => {
                        const bookingDate = booking.date?.toDate?.();
                        
                        return (
                          <div key={booking.id} className={`booking-status-item ${booking.status}`}>
                            <div className="booking-status-icon">⏳</div>
                            <div className="booking-status-details">
                              <div className="booking-status-header">
                                <p className="booking-status-topic"><strong>{booking.subject}</strong></p>
                                <span className={`status-badge ${booking.status}`}>⏳ Pending</span>
                              </div>
                              <p className="booking-status-tutor">Waiting for tutor to accept...</p>
                              <p className="booking-status-date">
                                {bookingDate?.toLocaleDateString('en-US', {
                                  weekday: 'short',
                                  month: 'short',
                                  day: 'numeric',
                                })}
                                {' at '}
                                {bookingDate?.toLocaleTimeString('en-US', {
                                  hour: 'numeric',
                                  minute: '2-digit',
                                })}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Accepted Requests Second */}
                {acceptedBookings.length > 0 && (
                  <div className="bookings-group">
                    <h4 className="bookings-group-title">✅ Accepted Requests</h4>
                    <div className="bookings-status-list">
                      {acceptedBookings.map(booking => {
                        const bookingDate = booking.date?.toDate?.();
                        
                        return (
                          <div key={booking.id} className={`booking-status-item ${booking.status}`}>
                            <div className="booking-status-icon">✅</div>
                            <div className="booking-status-details">
                              <div className="booking-status-header">
                                <p className="booking-status-topic"><strong>{booking.subject}</strong></p>
                                <span className={`status-badge ${booking.status}`}>✅ Accepted</span>
                              </div>
                              {booking.tutorName && (
                                <p className="booking-status-tutor">with {booking.tutorName}</p>
                              )}
                              <p className="booking-status-date">
                                {bookingDate?.toLocaleDateString('en-US', {
                                  weekday: 'short',
                                  month: 'short',
                                  day: 'numeric',
                                })}
                                {' at '}
                                {bookingDate?.toLocaleTimeString('en-US', {
                                  hour: 'numeric',
                                  minute: '2-digit',
                                })}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </main>

      {/* Book Meeting Modal */}
      <BookMeetingModal
        isOpen={isBookingModalOpen}
        onClose={handleCloseBookingModal}
        tutorName={selectedSession?.tutorName}
        subject={selectedSession?.subject}
        existingBooking={selectedSession ? getBookingForSession(selectedSession) : undefined}
      />
    </div>
  );
}

export default Dashboard;

