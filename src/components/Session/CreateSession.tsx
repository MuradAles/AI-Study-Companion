import { useState } from 'react';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import Navigation from '../Shared/Navigation';
import './CreateSession.css';

interface CreateSessionProps {
  onSuccess?: () => void;
}

function CreateSession({ onSuccess }: CreateSessionProps) {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [subject, setSubject] = useState('');
  const [tutorName, setTutorName] = useState('');
  const [transcript, setTranscript] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentUser) {
      setError('You must be signed in to create a session');
      return;
    }

    if (!subject.trim() || !transcript.trim()) {
      setError('Please fill in subject and transcript');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const goalId = `goal-${subject.toLowerCase().replace(/\s+/g, '-')}`;
      
      const sessionData = {
        studentId: currentUser.uid,
        goalId,
        subject: subject.trim(),
        tutorName: tutorName.trim() || 'Tutor',
        transcript: transcript.trim(),
        date: Timestamp.now(),
        status: 'completed',
      };

      const docRef = await addDoc(collection(db, 'sessions'), sessionData);
      console.log('✅ Session created:', docRef.id);
      
      // Success - show success state and redirect
      setSuccessMessage('Session created successfully! The AI is analyzing your transcript. Practice questions will be available tomorrow.');
      
      // Redirect after a short delay
      setTimeout(() => {
        if (onSuccess) {
          onSuccess();
        } else {
          navigate('/dashboard');
        }
      }, 2000);
    } catch (error: any) {
      console.error('Error creating session:', error);
      setError(error.message || 'Failed to create session. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="create-session">
      <header className="create-session-header">
        <h1>AI Study Companion</h1>
        <Navigation />
      </header>
      <main className="create-session-main">
        <div className="create-session-card">
          <h2>Create a Tutoring Session</h2>
        <p className="create-session-description">
          Add a session transcript to generate practice questions. The AI will analyze the transcript
          and create personalized practice questions for you.
        </p>

        <form onSubmit={handleSubmit} className="create-session-form">
          <div className="form-group">
            <label htmlFor="subject">Subject *</label>
            <input
              id="subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g., Mathematics, Physics, English"
              required
              disabled={isSubmitting}
            />
          </div>

          <div className="form-group">
            <label htmlFor="tutorName">Tutor Name</label>
            <input
              id="tutorName"
              type="text"
              value={tutorName}
              onChange={(e) => setTutorName(e.target.value)}
              placeholder="e.g., Dr. Smith (optional)"
              disabled={isSubmitting}
            />
          </div>

          <div className="form-group">
            <label htmlFor="transcript">Session Transcript *</label>
            <textarea
              id="transcript"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Paste the conversation from your tutoring session here. For example:&#10;Tutor: 'Today we're working on quadratic equations...'&#10;Student: 'I think it's an equation with x squared?'&#10;Tutor: 'Exactly! A quadratic equation has the form...'"
              rows={10}
              required
              disabled={isSubmitting}
            />
            <small className="form-hint">
              Include the conversation between you and your tutor. The AI will analyze this to create practice questions.
            </small>
          </div>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          {successMessage && (
            <div className="success-message">
              ✅ {successMessage}
            </div>
          )}

          <div className="form-actions">
            <button
              type="submit"
              disabled={isSubmitting || !subject.trim() || !transcript.trim()}
              className="submit-button"
            >
              {isSubmitting ? 'Creating Session...' : 'Create Session'}
            </button>
          </div>
        </form>

        <div className="create-session-info">
          <h3>What happens next?</h3>
          <ol>
            <li>AI will analyze your transcript (takes a few seconds)</li>
            <li>Practice questions will be generated (takes 1-2 minutes)</li>
            <li>Questions will be available tomorrow in the Practice section</li>
            <li>You'll receive a notification when questions are ready</li>
          </ol>
        </div>
      </div>
      </main>
    </div>
  );
}

export default CreateSession;

