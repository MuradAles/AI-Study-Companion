import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../../contexts/AuthContext';
import Navigation from '../Shared/Navigation';
import DifficultyModal from './DifficultyModal';
import CheckpointQuestion from './CheckpointQuestion';
import './LearningPath.css';

interface Checkpoint {
  id: string;
  order: number;
  unlocked: boolean;
  completed: boolean;
  difficulty?: 'easy' | 'medium' | 'hard';
  nodeType: 'combat' | 'mystery' | 'rest' | 'shop';
  position: {
    x: number;
    y: number;
  };
  connections: string[]; // IDs of connected checkpoints
  topics?: string[]; // Topics from sessions
  sessionId?: string; // Primary session ID (for backward compatibility)
  sessionIds?: string[]; // All session IDs in this checkpoint group
  correctAnswers?: number; // Current correct answer count (need 3)
  branchPaths?: {
    easy?: { nextCheckpointId: string; position: { x: number; y: number } };
    medium?: { nextCheckpointId: string; position: { x: number; y: number } };
    hard?: { nextCheckpointId: string; position: { x: number; y: number } };
  };
}

interface LearningPath {
  pathId: string;
  subject: string;
  currentCheckpointId: string;
  checkpoints: Checkpoint[];
  progress: number; // 0-100
}

function LearningPath() {
  const { currentUser } = useAuth();
  const [searchParams] = useSearchParams();
  
  const [selectedSubject, setSelectedSubject] = useState<string>(searchParams.get('subject') || '');
  const [availableSubjects, setAvailableSubjects] = useState<string[]>([]);
  const [learningPath, setLearningPath] = useState<LearningPath | null>(null);
  const [heroPosition, setHeroPosition] = useState<{ x: number; y: number } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [heroAnimating, setHeroAnimating] = useState(false);
  const [previousCheckpointId, setPreviousCheckpointId] = useState<string | null>(null);
  const [showDifficultyModal, setShowDifficultyModal] = useState(false);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<Checkpoint | null>(null);
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState(false);
  const [showSuccessCelebration, setShowSuccessCelebration] = useState(false);
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [selectedDifficulty, setSelectedDifficulty] = useState<'easy' | 'medium' | 'hard' | null>(null);

  const userId = currentUser?.uid || '';

  // Fetch available subjects from sessions
  useEffect(() => {
    if (!userId) return;

    const fetchSubjects = async () => {
      try {
        const sessionsQuery = query(
          collection(db, 'sessions'),
          where('studentId', '==', userId)
        );
        const snapshot = await getDocs(sessionsQuery);
        
        // Get unique subjects from sessions that have been processed
        const subjectsSet = new Set<string>();
        snapshot.docs.forEach(doc => {
          const session = doc.data();
          if (session.subject && session.aiAnalysis) {
            subjectsSet.add(session.subject);
          }
        });
        
        const subjects = Array.from(subjectsSet).sort();
        setAvailableSubjects(subjects);
        
        // Set first subject as default if none selected
        if (subjects.length > 0 && !selectedSubject) {
          setSelectedSubject(subjects[0]);
        }
      } catch (error) {
        console.error('Error fetching subjects:', error);
      }
    };

    fetchSubjects();
  }, [userId, selectedSubject]);

  // Build learning path from sessions (not from separate learning_paths collection)
  const fetchSessionsAndBuildPath = async () => {
    if (!userId || !selectedSubject) {
      setLearningPath(null);
      setHeroPosition(null);
      setLoading(false);
      setTransitioning(false);
      return;
    }

    try {
      // Only show transitioning if we already have a path (smooth transition)
      if (learningPath) {
        setTransitioning(true);
      } else {
      setLoading(true);
      }
      
      // Query sessions for this subject
      const sessionsQuery = query(
        collection(db, 'sessions'),
        where('studentId', '==', userId),
        where('subject', '==', selectedSubject)
      );
      
      const sessionsSnapshot = await getDocs(sessionsQuery);
      const sessions = sessionsSnapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data(),
        }))
        .filter((session: any) => session.aiAnalysis) // Only processed sessions
        .sort((a: any, b: any) => {
          // Sort by date, oldest first
          const dateA = a.date?.toMillis?.() || 0;
          const dateB = b.date?.toMillis?.() || 0;
          return dateA - dateB;
        });

      if (sessions.length === 0) {
        setLearningPath(null);
        setHeroPosition(null);
        setLoading(false);
        return;
      }

      // Always create exactly 10 checkpoints + 1 success checkpoint
      // ALL checkpoints use ALL sessions - questions come from all sessions for each checkpoint
      const targetCheckpoints = 10;
      const allSessionIds = sessions.map((s: any) => s.id);
      const allTopics = sessions.flatMap((session: any) => 
        session.aiAnalysis?.topicsCovered || []
      );

      // Query ALL practice items (not just pending) to check checkpoint completion
      // This ensures we count all correct answers even if practice items are completed
      const practiceItemsQuery = query(
        collection(db, 'practice_items'),
        where('studentId', '==', userId)
      );
      const practiceSnapshot = await getDocs(practiceItemsQuery);
      const practiceItems = practiceSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));

      // Build checkpoints - ALL checkpoints use ALL sessions
      // Each checkpoint tracks its own progress independently
      let previousCompleted = true;
      const checkpoints: Checkpoint[] = [];
      
      for (let index = 0; index < targetCheckpoints; index++) {
        // Find practice items for this specific checkpoint
        // Practice items are tagged with checkpointId when created
        // For backward compatibility, also check if sessionId matches and no checkpointId exists
        const checkpointPracticeItems = practiceItems.filter((item: any) => {
          const hasCheckpointId = item.checkpointId === `cp-${index}`;
          // For backward compatibility: if no checkpointId, only count for checkpoint 0
          const isLegacyCheckpoint0 = !item.checkpointId && index === 0;
          const hasValidSession = allSessionIds.includes(item.sessionId);
          const hasQuestions = (item as any).questions && (item as any).responses;
          
          return (hasCheckpointId || isLegacyCheckpoint0) && hasValidSession && hasQuestions;
        });
        
        // Count correct answers for this checkpoint (need 3 correct)
        // Count ALL correct answers across ALL practice items for this checkpoint
        let correctCount = 0;
        const countedQuestionIds = new Set<string>(); // Track unique question IDs to avoid double-counting
        
        if (checkpointPracticeItems.length > 0) {
          for (const practiceItem of checkpointPracticeItems) {
            const questions = (practiceItem as any).questions || [];
            const responses = (practiceItem as any).responses || [];
            
            // Count only correct answers (incorrect answers don't count, questions are regenerated)
            // Count each question only once (by questionId) across all practice items
            for (const question of questions) {
              const questionId = question.questionId || question.id;
              
              // Skip if we've already counted this question
              if (countedQuestionIds.has(questionId)) {
                continue;
              }
              
              // Find correct response for this question
              const response = responses.find((r: any) => 
                (r.questionId === questionId || r.questionId === question.questionId) && r.isCorrect
              );
              
              if (response?.isCorrect) {
                correctCount++;
                countedQuestionIds.add(questionId);
              }
            }
          }
        }
        
        // Checkpoint is completed if 3 correct answers achieved
        const isCompleted = correctCount >= 3;
        
        
        // Checkpoint is unlocked if it's the first one (0), or previous is completed
        const isUnlocked = index === 0 || previousCompleted;
        previousCompleted = isCompleted;
        
        // Horizontal layout: evenly spaced from left to right
        // Calculate position: start at 80px, space evenly across 1200px width
        const totalWidth = 1200;
        const spacing = totalWidth / (targetCheckpoints + 1); // +1 for success checkpoint
        const x = 80 + (index * spacing);
        const y = 200; // Fixed Y position for horizontal line
        
        checkpoints.push({
          id: `cp-${index}`,
          order: index,
          unlocked: isUnlocked,
          completed: isCompleted,
          nodeType: 'combat' as const,
          position: {
            x: x,
            y: y,
          },
          connections: index < targetCheckpoints - 1 ? [`cp-${index + 1}`] : ['cp-success'],
          topics: allTopics, // All topics from all sessions
          sessionIds: allSessionIds, // ALL session IDs for ALL checkpoints
          sessionId: allSessionIds[0], // Primary session ID for backward compatibility
          correctAnswers: correctCount, // Track current correct answer count
        });
      }
      
      // Add final success checkpoint (position 10)
      const allCheckpointsCompleted = checkpoints.every(cp => cp.completed);
      const successCheckpoint: Checkpoint = {
        id: 'cp-success',
        order: 10,
        unlocked: allCheckpointsCompleted,
        completed: allCheckpointsCompleted,
        nodeType: 'rest' as const,
        position: {
          x: 80 + (targetCheckpoints * (1200 / (targetCheckpoints + 1))),
          y: 200,
        },
        connections: [],
        topics: allTopics, // All topics from all sessions
        sessionIds: allSessionIds, // All session IDs (for consistency)
      };
      
      checkpoints.push(successCheckpoint);

      // Find current checkpoint (first incomplete one, or success if all complete)
      const currentCheckpoint = checkpoints.find(cp => !cp.completed && cp.id !== 'cp-success') || 
                                (checkpoints.find(cp => cp.id === 'cp-success') || checkpoints[checkpoints.length - 1]);
      
      const pathId = `path-${selectedSubject.toLowerCase().replace(/\s+/g, '-')}-${userId}`;
      
      const builtPath: LearningPath = {
        pathId,
        subject: selectedSubject,
        currentCheckpointId: currentCheckpoint.id,
        checkpoints,
        progress: (checkpoints.filter(cp => cp.completed).length / checkpoints.length) * 100,
      };

      setLearningPath(builtPath);
      
      if (currentCheckpoint) {
        // Smoothly animate hero movement when checkpoint or subject changes
        const previousPosition = heroPosition;
        const newPosition = currentCheckpoint.position;
        
        // If position changed (different checkpoint or subject), animate
        if (previousPosition && (
          previousPosition.x !== newPosition.x || 
          previousPosition.y !== newPosition.y ||
          previousCheckpointId !== currentCheckpoint.id
        )) {
          setHeroAnimating(true);
          // Animate to new position smoothly
          setTimeout(() => {
            setHeroAnimating(false);
          }, 800);
        }
        
        setHeroPosition(newPosition);
        setPreviousCheckpointId(currentCheckpoint.id);
      }
      
      // Removed completedCheckpointId handling to prevent infinite reloading
      // Success celebration is now handled in handleQuestionComplete
      
      setLoading(false);
      setTransitioning(false);
    } catch (error) {
      console.error('Error building learning path from sessions:', error);
      setLearningPath(null);
      setHeroPosition(null);
      setLoading(false);
      setTransitioning(false);
    }
  };

  // Build learning path from sessions (not from separate learning_paths collection)
  useEffect(() => {
    fetchSessionsAndBuildPath();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, selectedSubject]); // fetchSessionsAndBuildPath is recreated each render, which is fine

  const handleCheckpointClick = (checkpoint: Checkpoint) => {
    // Clear any previous error messages
    setErrorMessage(null);
    
    // Don't allow clicking on success checkpoint
    if (checkpoint.id === 'cp-success') {
      return;
    }
    
    if (!checkpoint.unlocked) {
      setErrorMessage('Complete previous checkpoints to unlock this one!');
      setTimeout(() => setErrorMessage(null), 5000);
      return;
    }

    // Allow clicking completed checkpoints to review answers
    if (checkpoint.completed) {
      setErrorMessage('📚 Viewing completed checkpoint - You can practice again or review your progress!');
      setTimeout(() => setErrorMessage(null), 4000);
      // Continue to allow practice on completed checkpoints
    }

    // All checkpoints use all sessions, so this check is no longer needed
    // But keep it as a safety check just in case
    if (!checkpoint.sessionIds || checkpoint.sessionIds.length === 0) {
      setErrorMessage('No sessions available. Please complete tutoring sessions first.');
      setTimeout(() => setErrorMessage(null), 5000);
      return;
    }

    setSelectedCheckpoint(checkpoint);
    setShowDifficultyModal(true);
  };

  const handleDifficultySelect = async (difficulty: 'easy' | 'medium' | 'hard') => {
    if (!selectedCheckpoint || !learningPath) return;

    setSelectedDifficulty(difficulty);
    setShowDifficultyModal(false);
    setShowQuestionModal(true);
  };

  const handleQuestionComplete = async (correctAnswers: number) => {
    if (!selectedCheckpoint || correctAnswers < 3) return;

    // Close question modal
    setShowQuestionModal(false);
    setSelectedDifficulty(null);
    setSelectedCheckpoint(null);

    // Show success celebration
    setShowSuccessCelebration(true);

    // After celebration, refresh the learning path to show updated completion
    setTimeout(() => {
      setShowSuccessCelebration(false);
      // Refresh the learning path by rebuilding it (don't clear it first)
      fetchSessionsAndBuildPath();
    }, 3000);
  };

  const handleQuestionClose = () => {
    setShowQuestionModal(false);
    setSelectedDifficulty(null);
    setSelectedCheckpoint(null);
  };

  const getNodeIcon = (nodeType: string) => {
    switch (nodeType) {
      case 'combat':
        return '⚔️';
      case 'mystery':
        return '❓';
      case 'rest':
        return '🏠';
      case 'shop':
        return '💰';
      default:
        return '📍';
    }
  };

  const getNodeColor = (checkpoint: Checkpoint) => {
    if (!checkpoint.unlocked) return '#ccc';
    if (checkpoint.completed) return '#4caf50';
    if (checkpoint.id === learningPath?.currentCheckpointId) return '#667eea';
    
    // Color by node type
    switch (checkpoint.nodeType) {
      case 'combat':
        return '#ff6b6b';
      case 'mystery':
        return '#4ecdc4';
      case 'rest':
        return '#95e1d3';
      case 'shop':
        return '#fce38a';
      default:
        return '#ffc107';
    }
  };

  return (
    <div className="learning-path">
      <header className="learning-path-header">
        <h1>AI Study Companion</h1>
      <Navigation />
      </header>
      
      {/* Error Message Banner */}
      {errorMessage && (
        <div className="error-banner">
          <span className="error-icon">⚠️</span>
          <span className="error-text">{errorMessage}</span>
          <button className="error-close" onClick={() => setErrorMessage(null)}>×</button>
        </div>
      )}
      
      {/* Top Info Bar - Only relevant info */}
      <div className="path-info-bar">
        <div className="info-section">
          <span className="info-label">Subject:</span>
          <span className="info-value">{selectedSubject}</span>
        </div>
        <div className="info-section">
          <span className="info-label">Progress:</span>
          <span className="info-value">
            {learningPath?.checkpoints.filter(cp => cp.completed).length || 0}/
            {learningPath?.checkpoints.length || 0}
          </span>
        </div>
      </div>

      {/* Subject Selector */}
      {availableSubjects.length > 0 && (
        <div className="subject-selector">
          {availableSubjects.map((subject) => (
            <button
              key={subject}
              className={`subject-button ${selectedSubject === subject ? 'active' : ''}`}
              onClick={() => setSelectedSubject(subject)}
            >
              {subject}
            </button>
          ))}
          <button
            className="subject-button"
            onClick={() => {
              setLoading(true);
              fetchSessionsAndBuildPath();
            }}
            disabled={loading || transitioning}
            title="Refresh learning path from latest sessions"
          >
            🔄 Refresh
          </button>
        </div>
      )}

      {/* Map Container */}
      {loading && !learningPath ? (
        <div className="map-loading">Loading learning path...</div>
      ) : !selectedSubject ? (
        <div className="map-loading">
          <p>Please select a subject to view your learning path.</p>
        </div>
      ) : availableSubjects.length === 0 ? (
        <div className="map-loading">
          <p>No learning paths available yet.</p>
          <p>Complete tutor sessions to create learning paths automatically!</p>
        </div>
      ) : !learningPath ? (
        <div className="map-loading">
          <p>No learning path available for "{selectedSubject}".</p>
          <p>Complete tutor sessions to create learning paths automatically!</p>
        </div>
      ) : (
        <div className={`map-container ${transitioning ? 'transitioning' : ''}`}>
          <svg className={`map-svg ${transitioning ? 'transitioning' : ''}`} viewBox="0 0 1200 400" preserveAspectRatio="xMidYMid meet">
            {/* Draw paths between checkpoints */}
            {learningPath?.checkpoints.flatMap((checkpoint) =>
              checkpoint.connections.map((connectionId) => {
                const connectedCheckpoint = learningPath.checkpoints.find(cp => cp.id === connectionId);
                if (!connectedCheckpoint) return null;
                
                return (
                  <line
                    key={`${checkpoint.id}-${connectionId}`}
                    x1={checkpoint.position.x}
                    y1={checkpoint.position.y}
                    x2={connectedCheckpoint.position.x}
                    y2={connectedCheckpoint.position.y}
                    stroke={checkpoint.completed ? "#4caf50" : "#e0e0e0"}
                    strokeWidth="3"
                    strokeDasharray={!checkpoint.unlocked || !checkpoint.completed ? "5,5" : "0"}
                  />
                );
              })
            )}

            {/* Draw branching paths if they exist */}
            {learningPath?.checkpoints.flatMap((checkpoint) => {
              if (!checkpoint.branchPaths) return [];
              
              return Object.entries(checkpoint.branchPaths).map(([difficulty, branchPath]) => {
                const nextCheckpoint = learningPath.checkpoints.find(cp => cp.id === branchPath.nextCheckpointId);
                if (!nextCheckpoint) return null;
                
                const color = difficulty === 'easy' ? '#4caf50' : difficulty === 'medium' ? '#ffc107' : '#f44336';
                
                return (
                  <line
                    key={`branch-${checkpoint.id}-${difficulty}`}
                    x1={checkpoint.position.x}
                    y1={checkpoint.position.y}
                    x2={branchPath.position.x}
                    y2={branchPath.position.y}
                    stroke={color}
                    strokeWidth="2"
                    strokeDasharray="3,3"
                    opacity={checkpoint.completed ? 0.5 : 0.3}
                  />
                );
              });
            })}

          {/* Render path lines connecting checkpoints */}
          {learningPath?.checkpoints.map((checkpoint, index) => {
            if (checkpoint.id === 'cp-success') return null;
            const nextCheckpoint = learningPath.checkpoints[index + 1];
            if (!nextCheckpoint) return null;
            
            return (
              <line
                key={`line-${checkpoint.id}`}
                x1={checkpoint.position.x}
                y1={checkpoint.position.y}
                x2={nextCheckpoint.position.x}
                y2={nextCheckpoint.position.y}
                stroke={checkpoint.completed ? '#4caf50' : '#ddd'}
                strokeWidth="3"
                strokeDasharray={checkpoint.completed ? '0' : '5,5'}
                opacity={checkpoint.completed ? 1 : 0.5}
              />
            );
          })}

          {/* Render checkpoints */}
          {learningPath?.checkpoints.map((checkpoint) => (
            <g key={checkpoint.id}>
              <circle
                cx={checkpoint.position.x}
                cy={checkpoint.position.y}
                r={22}
                fill={getNodeColor(checkpoint)}
                stroke={checkpoint.id === learningPath.currentCheckpointId ? '#667eea' : '#fff'}
                strokeWidth={checkpoint.id === learningPath.currentCheckpointId ? '5' : '3'}
                className={`checkpoint-node ${checkpoint.unlocked ? 'unlocked' : 'locked'} ${checkpoint.completed ? 'completed' : ''} ${checkpoint.id === learningPath.currentCheckpointId ? 'current' : ''}`}
                onClick={() => handleCheckpointClick(checkpoint)}
                style={{ cursor: checkpoint.unlocked ? 'pointer' : 'not-allowed' }}
              />
              <text
                x={checkpoint.position.x}
                y={checkpoint.position.y + 5}
                textAnchor="middle"
                fontSize="20"
                fill="#fff"
                pointerEvents="none"
              >
                {checkpoint.id === 'cp-success' ? '🎉' : getNodeIcon(checkpoint.nodeType)}
              </text>
              
              {/* Checkpoint number label */}
              <text
                x={checkpoint.position.x}
                y={checkpoint.position.y + 50}
                textAnchor="middle"
                fontSize="16"
                fill={checkpoint.unlocked ? (checkpoint.completed ? '#4caf50' : '#667eea') : '#999'}
                fontWeight="bold"
                pointerEvents="none"
              >
                {checkpoint.id === 'cp-success' ? 'SUCCESS' : checkpoint.order}
              </text>
              
              {/* Correct answers count for completed checkpoints */}
              {checkpoint.completed && checkpoint.correctAnswers !== undefined && (
                <text
                  x={checkpoint.position.x}
                  y={checkpoint.position.y - 35}
                  textAnchor="middle"
                  fontSize="12"
                  fill="#4caf50"
                  fontWeight="bold"
                  pointerEvents="none"
                >
                  ✓ {checkpoint.correctAnswers}/3
                </text>
              )}
            </g>
          ))}

          {/* Hero character - render once outside loop */}
          {learningPath && heroPosition && (
            <g 
              className={`hero-character ${heroAnimating ? 'animating' : ''}`}
              transform={`translate(${heroPosition.x}, ${heroPosition.y - 35})`}
            >
                  <circle
                cx={0}
                cy={0}
                    r="12"
                    fill="#667eea"
                    stroke="#fff"
                    strokeWidth="2"
                    className="hero-circle"
                  />
                  <text
                x={0}
                y={3}
                    textAnchor="middle"
                    fontSize="16"
                    fill="#fff"
                    className="hero-emoji"
                  >
                    🦸
                  </text>
                </g>
              )}
        </svg>
        </div>
      )}

      {/* Checkpoint Question Modal */}
      {showQuestionModal && selectedCheckpoint && selectedDifficulty && (
        <CheckpointQuestion
          checkpointId={selectedCheckpoint.id}
          sessionIds={selectedCheckpoint.sessionIds || [selectedCheckpoint.sessionId || ''].filter(Boolean)}
          difficulty={selectedDifficulty}
          subject={selectedSubject}
          onComplete={handleQuestionComplete}
          onClose={handleQuestionClose}
        />
      )}

      {/* Success Celebration Modal */}
      {showSuccessCelebration && (
        <div className="success-celebration-overlay">
          <div className="success-celebration">
            <div className="celebration-icon">🎉</div>
            <h2>Checkpoint Complete!</h2>
            <p>Great job! You've mastered this checkpoint.</p>
            <div className="celebration-particles">
              {[...Array(20)].map((_, i) => (
                <div key={i} className="particle" style={{
                  animationDelay: `${i * 0.1}s`,
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                }} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Difficulty Selection Modal */}
      <DifficultyModal
        isOpen={showDifficultyModal}
        onClose={() => setShowDifficultyModal(false)}
        onSelectDifficulty={handleDifficultySelect}
        checkpointOrder={selectedCheckpoint?.order || 0}
      />
    </div>
  );
}

export default LearningPath;

