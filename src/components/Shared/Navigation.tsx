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
        to="/chat" 
        className={location.pathname === '/chat' ? 'active' : ''}
      >
        Chat
      </Link>
    </nav>
  );
}

export default Navigation;

