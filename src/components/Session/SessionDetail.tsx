import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useUserRole } from '../../hooks/useUserRole';
import { useNavigate, useParams } from 'react-router-dom';
import Navigation from '../Shared/Navigation';
import './SessionDetail.css';

interface AIAnalysis {
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
}

interface SessionData {
  subject: string;
  tutorName: string;
  transcript: string;
  date: any;
  studentId: string;
  aiAnalysis?: AIAnalysis;
}

function SessionDetail() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { currentUser } = useAuth();
  const { role } = useUserRole();
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [momentsExpanded, setMomentsExpanded] = useState(false);

  useEffect(() => {
    if (!sessionId || !currentUser) return;

    const loadSession = async () => {
      try {
        const sessionDoc = await getDoc(doc(db, 'sessions', sessionId));
        
        if (!sessionDoc.exists()) {
          setError('Session not found');
          setLoading(false);
          return;
        }

        const sessionData = sessionDoc.data() as SessionData;
        
        // Allow access if user is the student OR a tutor
        // Tutors can view sessions of students they're helping
        if (role !== 'tutor' && sessionData.studentId !== currentUser.uid) {
          setError('You do not have permission to view this session');
          setLoading(false);
          return;
        }

        setSession(sessionData);
        setLoading(false);
      } catch (err) {
        setError('Failed to load session');
        setLoading(false);
      }
    };

    loadSession();
  }, [sessionId, currentUser, role]);

  if (loading) {
    return (
      <div className="session-detail">
        <header className="session-detail-header">
          <h1>AI Study Companion</h1>
          <Navigation />
        </header>
        <main className="session-detail-main">
          <p>Loading session...</p>
        </main>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="session-detail">
        <header className="session-detail-header">
          <h1>AI Study Companion</h1>
          <Navigation />
        </header>
        <main className="session-detail-main">
          <div className="error-card">
            <p>{error || 'Session not found'}</p>
            <button onClick={() => navigate(role === 'tutor' ? '/tutor' : '/dashboard')}>
              Back to {role === 'tutor' ? 'Tutor Dashboard' : 'Dashboard'}
            </button>
          </div>
        </main>
      </div>
    );
  }

  const sessionDate = session.date?.toDate?.() || new Date();
  const formattedDate = sessionDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const analysis = session.aiAnalysis;

  // Parse transcript into messages
  const parseTranscript = (transcript: string | any[], tutorName: string) => {
    const messages: Array<{ speaker: 'tutor' | 'student'; text: string }> = [];
    
    // If transcript is already an array (new format from fake sessions)
    if (Array.isArray(transcript)) {
      return transcript.map(item => ({
        speaker: item.speaker === 'tutor' ? 'tutor' : 'student',
        text: item.message,
      }));
    }
    
    // If transcript is a string (old format)
    if (typeof transcript !== 'string') return messages;
    
    const lines = transcript.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
      
      // Check for common transcript patterns
      const tutorPattern = new RegExp(`^(${tutorName}|Tutor|Teacher|Instructor):\\s*(.+)`, 'i');
      const studentPattern = /^(Student|You|User):\s*(.+)/i;
      
      if (tutorPattern.test(trimmedLine)) {
        const match = trimmedLine.match(tutorPattern);
        if (match && match[2]) {
          messages.push({ speaker: 'tutor', text: match[2].trim() });
        }
      } else if (studentPattern.test(trimmedLine)) {
        const match = trimmedLine.match(studentPattern);
        if (match && match[2]) {
          messages.push({ speaker: 'student', text: match[2].trim() });
        }
      } else {
        // If no pattern matches, try to infer from context
        // If last message was from tutor, this might be from student, and vice versa
        if (messages.length > 0) {
          const lastSpeaker = messages[messages.length - 1].speaker;
          messages.push({ 
            speaker: lastSpeaker === 'tutor' ? 'student' : 'tutor', 
            text: trimmedLine 
          });
        } else {
          // First message defaults to tutor
          messages.push({ speaker: 'tutor', text: trimmedLine });
        }
      }
    }
    
    return messages;
  };

  return (
    <div className="session-detail">
      <header className="session-detail-header">
        <div className="header-content">
          <button className="back-button" onClick={() => navigate('/dashboard')}>
            ← Back
          </button>
          <div className="session-title">
            <h1>{session.subject}</h1>
            <p>with {session.tutorName} • {formattedDate}</p>
          </div>
        </div>
        <Navigation />
      </header>
      <main className="session-detail-main">
        <div className="session-detail-content">
          
          {/* Topics Covered */}
          {analysis?.topicsCovered && analysis.topicsCovered.length > 0 && (
            <div className="analysis-card topics-card">
              <h2>📚 Topics Covered</h2>
              <div className="topics-grid">
                {analysis.topicsCovered.map((topic, index) => (
                  <div key={index} className="topic-badge">
                    {topic}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Confidence Level */}
          {analysis?.confidenceLevel !== undefined && (
            <div className="analysis-card confidence-card">
              <h2>🎯 Understanding Level</h2>
              <div className="confidence-bar">
                <div 
                  className="confidence-fill" 
                  style={{ width: `${analysis.confidenceLevel * 10}%` }}
                />
              </div>
              <p className="confidence-text">
                {analysis.confidenceLevel}/10 - {
                  analysis.confidenceLevel >= 8 ? 'Great understanding!' :
                  analysis.confidenceLevel >= 6 ? 'Good progress' :
                  analysis.confidenceLevel >= 4 ? 'Making progress' :
                  'Needs more practice'
                }
              </p>
            </div>
          )}

          {/* Strengths and Struggles */}
          <div className="strengths-struggles-grid">
            {analysis?.studentStrengths && analysis.studentStrengths.length > 0 && (
              <div className="analysis-card strengths-card">
                <h2>✨ What You're Good At</h2>
                <ul>
                  {analysis.studentStrengths.map((strength, index) => (
                    <li key={index}>{strength}</li>
                  ))}
                </ul>
              </div>
            )}

            {analysis?.studentStruggles && analysis.studentStruggles.length > 0 && (
              <div className="analysis-card struggles-card">
                <h2>💪 Areas to Practice</h2>
                <ul>
                  {analysis.studentStruggles.map((struggle, index) => (
                    <li key={index}>{struggle}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Key Moments */}
          {analysis?.keyMoments && analysis.keyMoments.length > 0 && (
            <div className="analysis-card moments-card">
              <h2>🔑 Key Moments</h2>
              <div className={`moments-grid ${momentsExpanded ? 'expanded' : ''}`}>
                {analysis.keyMoments
                  .slice(0, momentsExpanded ? analysis.keyMoments.length : 4)
                  .map((moment, index) => (
                    <div 
                      key={index} 
                      className={`moment-item ${moment.type}`}
                      style={{ 
                        animationDelay: momentsExpanded && index >= 4 ? `${(index - 4) * 0.1}s` : '0s'
                      }}
                    >
                      <span className="moment-icon">
                        {moment.type === 'breakthrough' ? '🎉' :
                         moment.type === 'confusion' ? '❓' :
                         moment.type === 'question' ? '🤔' : '💡'}
                      </span>
                      <div className="moment-content">
                        <span className="moment-type">{moment.type}</span>
                        <p>{moment.note}</p>
                      </div>
                    </div>
                  ))}
              </div>
              {analysis.keyMoments.length > 4 && (
                <button 
                  className="expand-moments-btn"
                  onClick={() => setMomentsExpanded(!momentsExpanded)}
                >
                  {momentsExpanded ? 'Show Less' : `Show All (${analysis.keyMoments.length})`}
                </button>
              )}
            </div>
          )}

          {/* Suggested Topics */}
          {analysis?.suggestedTopics && analysis.suggestedTopics.length > 0 && (
            <div className="analysis-card suggested-card">
              <h2>🚀 What to Study Next</h2>
              <div className="topics-grid">
                {analysis.suggestedTopics.map((topic, index) => (
                  <div key={index} className="topic-badge suggested">
                    {topic}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Transcript */}
          <div className="analysis-card transcript-card">
            <h2>📝 Session Transcript</h2>
            <div className="transcript-content">
              {parseTranscript(session.transcript, session.tutorName).map((message, index) => (
                <div 
                  key={index} 
                  className={`transcript-message ${message.speaker === 'tutor' ? 'tutor-message' : 'student-message'}`}
                >
                  <div className="message-content">
                    <div className="message-header">
                      <span className="speaker-name">
                        {message.speaker === 'tutor' ? session.tutorName : 'You'}
                      </span>
                    </div>
                    <p className="message-text">{message.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* No Analysis Yet */}
          {!analysis && (
            <div className="analysis-card no-analysis-card">
              <h2>⏳ Analysis in Progress</h2>
              <p>We're analyzing this session to provide insights. Check back soon!</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default SessionDetail;
