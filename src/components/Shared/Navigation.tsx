import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useUserRole } from '../../hooks/useUserRole';
import { useAuth } from '../../contexts/AuthContext';
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
    return <nav className="navigation"></nav>;
  }

  // Show different navigation based on role
  if (role === 'tutor') {
    return (
      <nav className="navigation">
        <Link 
          to="/tutor" 
          className={location.pathname === '/tutor' ? 'active' : ''}
        >
          Tutor Dashboard
        </Link>
        <div className="navigation-menu-container">
          <button 
            className="navigation-menu-button"
            onClick={() => setShowMenu(!showMenu)}
            aria-label="Menu"
          >
            ⋯
          </button>
          {showMenu && (
            <div className="navigation-menu-dropdown">
              <button className="navigation-menu-item" onClick={handleLogout}>
                Logout
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
      <Link 
        to="/dashboard" 
        className={location.pathname === '/dashboard' || location.pathname === '/' ? 'active' : ''}
      >
        Dashboard
      </Link>
      <Link 
        to="/practice" 
        className={location.pathname === '/practice' ? 'active' : ''}
      >
        Practice
      </Link>
      <Link 
        to="/chat" 
        className={location.pathname === '/chat' ? 'active' : ''}
      >
        Chat
      </Link>
      <Link 
        to="/tree" 
        className={location.pathname === '/tree' ? 'active' : ''}
      >
        Tree
      </Link>
      <div className="navigation-menu-container">
        <button 
          className="navigation-menu-button"
          onClick={() => setShowMenu(!showMenu)}
          aria-label="Menu"
        >
          ⋯
        </button>
        {showMenu && (
          <div className="navigation-menu-dropdown">
            <button className="navigation-menu-item" onClick={handleLogout}>
              Logout
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}

export default Navigation;

