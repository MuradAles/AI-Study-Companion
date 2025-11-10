import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useUserRole } from '../../hooks/useUserRole';
import { useAuth } from '../../contexts/AuthContext';
import logoImage from '../../assets/AI Companion.png';
import './Navigation.css';

function Navigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const { role, loading } = useUserRole();
  const { logout } = useAuth();
  const [showMenu, setShowMenu] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showMenu && !target.closest('.navigation-menu-container')) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu]);

  if (loading) {
    return <nav className="navigation"><div className="nav-skeleton"></div></nav>;
  }

  // Show different navigation based on role
  if (role === 'tutor') {
    return (
      <nav className="navigation">
        <div className="nav-brand">
          <img src={logoImage} alt="AI Study Companion" className="nav-logo" />
          <span className="nav-title">AI Study Companion</span>
        </div>
        <div className="nav-links">
          <Link 
            to="/tutor" 
            className={`nav-link ${location.pathname === '/tutor' ? 'active' : ''}`}
          >
            <span className="nav-icon">👨‍🏫</span>
            <span className="nav-text">Tutor Dashboard</span>
          </Link>
        </div>
        <div className="navigation-menu-container">
          <button 
            className="navigation-menu-button"
            onClick={() => setShowMenu(!showMenu)}
            aria-label="Menu"
          >
            <span className="menu-icon">{showMenu ? '✕' : '☰'}</span>
          </button>
          {showMenu && (
            <div className="navigation-menu-dropdown">
              <button className="navigation-menu-item" onClick={handleLogout}>
                <span className="menu-item-icon">🚪</span>
                <span>Logout</span>
              </button>
            </div>
          )}
        </div>
      </nav>
    );
  }

  // Default: student navigation
  return (
    <nav className="navigation">
      <div className="nav-brand">
        <img src={logoImage} alt="AI Study Companion" className="nav-logo" />
        <span className="nav-title">AI Study Companion</span>
      </div>
      <div className="nav-links">
        <Link 
          to="/dashboard" 
          className={`nav-link ${location.pathname === '/dashboard' || location.pathname === '/' ? 'active' : ''}`}
        >
          <span className="nav-icon">📊</span>
          <span className="nav-text">Dashboard</span>
          {(location.pathname === '/dashboard' || location.pathname === '/') && (
            <span className="nav-indicator"></span>
          )}
        </Link>
        <Link 
          to="/practice" 
          className={`nav-link ${location.pathname === '/practice' ? 'active' : ''}`}
        >
          <span className="nav-icon">✏️</span>
          <span className="nav-text">Practice</span>
          {location.pathname === '/practice' && (
            <span className="nav-indicator"></span>
          )}
        </Link>
        <Link 
          to="/chat" 
          className={`nav-link ${location.pathname === '/chat' ? 'active' : ''}`}
        >
          <span className="nav-icon">💬</span>
          <span className="nav-text">Chat</span>
          {location.pathname === '/chat' && (
            <span className="nav-indicator"></span>
          )}
        </Link>
        <Link 
          to="/tree" 
          className={`nav-link ${location.pathname === '/tree' ? 'active' : ''}`}
        >
          <span className="nav-icon">🌳</span>
          <span className="nav-text">Tree</span>
          {location.pathname === '/tree' && (
            <span className="nav-indicator"></span>
          )}
        </Link>
      </div>
      <div className="navigation-menu-container">
        <button 
          className="navigation-menu-button"
          onClick={() => setShowMenu(!showMenu)}
          aria-label="Menu"
        >
          <span className="menu-icon">{showMenu ? '✕' : '☰'}</span>
        </button>
        {showMenu && (
          <div className="navigation-menu-dropdown">
            <button className="navigation-menu-item" onClick={handleLogout}>
              <span className="menu-item-icon">🚪</span>
              <span>Logout</span>
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}

export default Navigation;

