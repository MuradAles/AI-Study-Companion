import { Link, useLocation } from 'react-router-dom';
import { useUserRole } from '../../hooks/useUserRole';
import './Navigation.css';

function Navigation() {
  const location = useLocation();
  const { role, loading } = useUserRole();

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
        🌳 Learning Tree
      </Link>
    </nav>
  );
}

export default Navigation;

