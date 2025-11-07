import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Dashboard from './components/Dashboard/Dashboard';
import Practice from './components/Practice/Practice';
import PracticeShared from './components/Practice/PracticeShared';
import CreateSession from './components/Session/CreateSession';
import SessionDetail from './components/Session/SessionDetail';
import LearningPath from './components/LearningPath/LearningPath';
import Login from './components/Login/Login';
import './App.css';

function App() {
  const { currentUser, loading } = useAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!currentUser) {
    return <Login />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/practice" element={<PracticeShared />} />
        <Route path="/practice-checkpoint" element={<Practice />} />
        <Route path="/learning-path" element={<LearningPath />} />
        <Route path="/create-session" element={<CreateSession />} />
        <Route path="/session/:sessionId" element={<SessionDetail />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
