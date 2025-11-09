import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import './Login.css';

function Login() {
  const { signIn, signUp, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [userRole, setUserRole] = useState<'student' | 'tutor'>('student');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (isSignUp) {
        if (!displayName.trim()) {
          setError('Please enter your name');
          setIsSubmitting(false);
          return;
        }
        if (!userRole || (userRole !== 'student' && userRole !== 'tutor')) {
          setError('Please select whether you are a student or tutor');
          setIsSubmitting(false);
          return;
        }
        console.log('Submitting signup with role:', userRole); // Debug log
        await signUp(email, password, displayName.trim(), userRole);
      } else {
        await signIn(email, password);
      }
    } catch (error: any) {
      console.error('Auth error:', error);
      let errorMessage = 'An error occurred. Please try again.';
      
      if (error.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email. Please sign up first.';
      } else if (error.code === 'auth/wrong-password') {
        errorMessage = 'Incorrect password. Please try again.';
      } else if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'An account with this email already exists. Please sign in instead.';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'Password is too weak. Please use at least 6 characters.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address. Please check and try again.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>AI Study Companion</h1>
        <p className="login-subtitle">
          {isSignUp ? `Create your ${userRole} account` : 'Sign in to continue'}
        </p>

        <form onSubmit={handleSubmit} className="login-form">
          {isSignUp && (
            <>
              <div className="form-group">
                <label htmlFor="userRole">I am a:</label>
                <div className="role-selection">
                  <button
                    type="button"
                    className={`role-button ${userRole === 'student' ? 'active' : ''}`}
                    onClick={() => setUserRole('student')}
                    disabled={isSubmitting}
                  >
                    🎓 Student
                  </button>
                  <button
                    type="button"
                    className={`role-button ${userRole === 'tutor' ? 'active' : ''}`}
                    onClick={() => setUserRole('tutor')}
                    disabled={isSubmitting}
                  >
                    👨‍🏫 Tutor
                  </button>
                </div>
              </div>
            <div className="form-group">
                <label htmlFor="displayName">Name *</label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Enter your full name"
                  required
                disabled={isSubmitting}
              />
            </div>
            </>
          )}

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
              disabled={isSubmitting}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              disabled={isSubmitting}
              minLength={6}
            />
          </div>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="submit-button"
            disabled={isSubmitting || !email || !password || (isSignUp && !displayName.trim())}
          >
            {isSubmitting ? 'Processing...' : (isSignUp ? 'Sign Up' : 'Sign In')}
          </button>

          <div className="auth-toggle">
            <p>
              {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError(null);
                  setDisplayName(''); // Reset name when toggling
                  // Don't reset role - keep user's selection
                }}
                className="toggle-link"
                disabled={isSubmitting}
              >
                {isSignUp ? 'Sign In' : 'Sign Up'}
              </button>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Login;
