import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { useUserRole } from './hooks/useUserRole';
import Navigation from './components/Shared/Navigation';
import Dashboard from './components/Dashboard/Dashboard';
import Practice from './components/Practice/Practice';
import PracticeShared from './components/Practice/PracticeShared';
import CreateSession from './components/Session/CreateSession';
import SessionDetail from './components/Session/SessionDetail';
import Chat from './components/Chat/Chat';
import TutorDashboard from './components/Tutor/TutorDashboard';
import Login from './components/Login/Login';
import LearningTree from './components/LearningTree/LearningTree';
import './App.css';

function App() {
  const { currentUser, loading: authLoading } = useAuth();
  const { role, loading: roleLoading } = useUserRole();

  if (authLoading || roleLoading) {
    return <div>Loading...</div>;
  }

  if (!currentUser) {
    return <Login />;
  }

  // Redirect based on role
  const defaultRoute = role === 'tutor' ? '/tutor' : '/dashboard';

  return (
    <BrowserRouter>
      <Navigation />
      <Routes>
        <Route path="/" element={<Navigate to={defaultRoute} replace />} />
        {role === 'tutor' ? (
          <>
            {/* Tutors can only access tutor dashboard and session details */}
            <Route path="/tutor" element={<TutorDashboard />} />
            <Route path="/session/:sessionId" element={<SessionDetail />} />
            <Route path="*" element={<Navigate to="/tutor" replace />} />
          </>
        ) : (
          <>
            {/* Students can access all pages except tutor dashboard */}
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/practice" element={<PracticeShared />} />
        <Route path="/practice-checkpoint" element={<Practice />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/tree" element={<LearningTree />} />
        <Route path="/create-session" element={<CreateSession />} />
        <Route path="/session/:sessionId" element={<SessionDetail />} />
            <Route path="/tutor" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </>
        )}
      </Routes>
    </BrowserRouter>
  );
}

export default App;
