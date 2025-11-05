import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { createAllDemoSessions } from '../../utils/demoSessions';
import './LoadDemoSessions.css';

interface LoadDemoSessionsProps {
  onComplete?: () => void;
}

function LoadDemoSessions({ onComplete }: LoadDemoSessionsProps) {
  const { currentUser } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleLoadDemoSessions = async () => {
    if (!currentUser) {
      setError('You must be signed in to load demo sessions');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(false);

    try {
      console.log('Creating demo sessions...');
      await createAllDemoSessions(currentUser.uid);
      console.log('✅ Demo sessions created successfully');
      setSuccess(true);
      
      // Wait a bit for the user to see the success message
      setTimeout(() => {
        if (onComplete) {
          onComplete();
        } else {
          // Refresh the page to show new sessions
          window.location.reload();
        }
      }, 3000);
    } catch (error: any) {
      console.error('Error loading demo sessions:', error);
      setError(error.message || 'Failed to load demo sessions. Please try again.');
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="demo-sessions-success">
        <div className="success-content">
          <span className="success-icon">✅</span>
          <div>
            <h4>Demo Sessions Created!</h4>
            <p>The AI is analyzing your sessions and generating practice questions. Check back in a few minutes!</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="load-demo-sessions">
      <div className="demo-sessions-card">
        <div className="demo-header">
          <span className="demo-icon">🎓</span>
          <div>
            <h3>Load Demo Sessions</h3>
            <p>Get started with sample tutoring sessions</p>
          </div>
        </div>

        <div className="demo-description">
          <p>This will create <strong>5 demo sessions</strong> covering:</p>
          <ul>
            <li>📐 Mathematics (Quadratic Equations)</li>
            <li>📊 SAT Math (Systems of Equations)</li>
            <li>📖 SAT Reading (Reading Comprehension)</li>
            <li>📐 Geometry (Pythagorean Theorem)</li>
            <li>🔢 Algebra (Linear Equations)</li>
          </ul>
          <p className="demo-note">
            The AI will analyze each session and generate personalized practice questions. 
            Questions will be available tomorrow.
          </p>
        </div>

        {error && (
          <div className="demo-error">
            {error}
          </div>
        )}

        <button
          onClick={handleLoadDemoSessions}
          disabled={isLoading || !currentUser}
          className="demo-button"
        >
          {isLoading ? (
            <>
              <span className="loading-spinner">⏳</span>
              Creating Sessions...
            </>
          ) : (
            <>
              <span>🚀</span>
              Load Demo Sessions
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default LoadDemoSessions;

