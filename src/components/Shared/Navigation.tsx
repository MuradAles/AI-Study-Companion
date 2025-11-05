import { Link, useLocation } from 'react-router-dom';
import './Navigation.css';

function Navigation() {
  const location = useLocation();

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
        to="/learning-path" 
        className={location.pathname === '/learning-path' ? 'active' : ''}
      >
        Learning Path
      </Link>
      <Link 
        to="/chat" 
        className={location.pathname === '/chat' ? 'active' : ''}
      >
        Chat
      </Link>
      <Link 
        to="/progress" 
        className={location.pathname === '/progress' ? 'active' : ''}
      >
        Progress
      </Link>
    </nav>
  );
}

export default Navigation;

