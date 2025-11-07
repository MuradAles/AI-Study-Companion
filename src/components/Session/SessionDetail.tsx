import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../../contexts/AuthContext';
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
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        
        if (sessionData.studentId !== currentUser.uid) {
          setError('You do not have permission to view this session');
          setLoading(false);
          return;
        }

        setSession(sessionData);
        setLoading(false);
      } catch (err) {
        console.error('Error loading session:', err);
        setError('Failed to load session');
        setLoading(false);
      }
    };

    loadSession();
  }, [sessionId, currentUser]);

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
            <button onClick={() => navigate('/dashboard')}>
              Back to Dashboard
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
              <div className="moments-list">
                {analysis.keyMoments.map((moment, index) => (
                  <div key={index} className={`moment-item ${moment.type}`}>
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
              {session.transcript.split('\n').map((line, index) => (
                <p key={index} className="transcript-line">
                  {line}
                </p>
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
