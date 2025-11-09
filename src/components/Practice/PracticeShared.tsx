import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, orderBy, Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../services/firebase';
import { useAuth } from '../../contexts/AuthContext';
import Navigation from '../Shared/Navigation';
import './Practice.css';

interface SharedQuestion {
  id: string;
  subject: string;
  topics: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  text: string;
  correctAnswer: string;
  explanation: string;
  hint: string;
  passage?: string; // Optional passage text for reading comprehension questions
  createdBy: string;
  createdByName: string;
  source: string;
  sessionId: string;
  timesAttempted: number;
  timesCorrect: number;
  upvotes: number;
  createdAt: Timestamp | null;
}

interface UserResponse {
  studentId: string;
  questionId: string;
  isCorrect: boolean;
  attemptedAt: Timestamp | null;
}

function PracticeShared() {
  const { currentUser } = useAuth();
  const userId = currentUser?.uid || '';

  const [questions, setQuestions] = useState<SharedQuestion[]>([]);
  const [userResponses, setUserResponses] = useState<UserResponse[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters - LeetCode style
  const [selectedTopic, setSelectedTopic] = useState<string>('all');
  const [selectedDifficulty, setSelectedDifficulty] = useState<'easy' | 'medium' | 'hard' | 'all'>('all');
  const [showMyQuestions, setShowMyQuestions] = useState(false);
  const [showAnswered, setShowAnswered] = useState(true); // Show all by default
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'difficulty' | 'acceptance'>('newest');
  const [topicsExpanded, setTopicsExpanded] = useState(false);

  // View mode
  const [viewMode, setViewMode] = useState<'list' | 'solve'>('list');
  const [selectedQuestion, setSelectedQuestion] = useState<SharedQuestion | null>(null);
  
  // Current question solving
  const [answer, setAnswer] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateMessage, setGenerateMessage] = useState('');
  const [feedback, setFeedback] = useState<{
    isCorrect: boolean;
    message: string;
    pointsAwarded: number;
  } | null>(null);

  // Load questions with real-time updates
  useEffect(() => {
    const questionsQuery = query(
      collection(db, 'questions'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      questionsQuery,
      (snapshot) => {
        const questionsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as SharedQuestion[];
        setQuestions(questionsData);
        setLoading(false);
      },
      (error) => {
        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  // Load user responses with real-time updates
  useEffect(() => {
    if (!userId) {
      return;
    }
    
    const responsesQuery = query(
      collection(db, 'user_responses'),
      where('studentId', '==', userId)
    );

    const unsubscribe = onSnapshot(
      responsesQuery,
      (snapshot) => {
        const responsesData = snapshot.docs.map(doc => {
          return doc.data() as UserResponse;
        });
        
        setUserResponses(responsesData);
      },
      (error) => {
        // Error loading user responses
      }
    );

    return unsubscribe;
  }, [userId]);

  // Calculate acceptance rate for each question
  const questionsWithStats = useMemo(() => {
    return questions.map(q => {
      const acceptanceRate = q.timesAttempted > 0 
        ? Math.round((q.timesCorrect / q.timesAttempted) * 100 * 10) / 10 
        : 0;
      
      // Get ALL responses for this question
      const allUserResponses = userResponses.filter(r => r.questionId === q.id);
      const isAnswered = allUserResponses.length > 0;
      
      // If multiple responses, prioritize: 1) correct answer, 2) most recent
      let userResponse = null;
      if (allUserResponses.length > 0) {
        // First check if any response is correct
        const correctResponse = allUserResponses.find(r => r.isCorrect);
        if (correctResponse) {
          userResponse = correctResponse;
        } else {
          // Otherwise use the most recent (last in array)
          userResponse = allUserResponses[allUserResponses.length - 1];
        }
      }
      
      return {
        ...q,
        acceptanceRate,
        isAnswered,
        userIsCorrect: userResponse?.isCorrect || false,
      };
    });
  }, [questions, userResponses]);

  // Get all unique topics dynamically
  const allTopics = useMemo(() => {
    const topicSet = new Set<string>();
    questions.forEach(q => {
      q.topics.forEach(topic => topicSet.add(topic));
    });
    return Array.from(topicSet).sort();
  }, [questions]);

  // Get topic counts
  const topicCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    questions.forEach(q => {
      q.topics.forEach(topic => {
        counts[topic] = (counts[topic] || 0) + 1;
      });
    });
    return counts;
  }, [questions]);

  // Filter and sort questions
  const filteredQuestions = useMemo(() => {
    let filtered = questionsWithStats;

    // Filter by "My Questions"
    if (showMyQuestions) {
      filtered = filtered.filter(q => q.createdBy === userId);
    }

    // Filter by topic
    if (selectedTopic !== 'all') {
      filtered = filtered.filter(q => q.topics.includes(selectedTopic));
    }

    // Filter by difficulty
    if (selectedDifficulty !== 'all') {
      filtered = filtered.filter(q => q.difficulty === selectedDifficulty);
    }

    // Filter by answered/unanswered
    if (!showAnswered) {
      filtered = filtered.filter(q => !q.isAnswered);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const queryLower = searchQuery.toLowerCase();
      filtered = filtered.filter(q => 
        q.text.toLowerCase().includes(queryLower) ||
        q.subject.toLowerCase().includes(queryLower) ||
        q.topics.some(t => t.toLowerCase().includes(queryLower))
      );
    }

    // Sort
    filtered = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'newest': {
          const aTime = a.createdAt?.toMillis?.() || 0;
          const bTime = b.createdAt?.toMillis?.() || 0;
          return bTime - aTime;
        }
        case 'difficulty': {
          const diffOrder = { easy: 1, medium: 2, hard: 3 };
          return diffOrder[a.difficulty] - diffOrder[b.difficulty];
        }
        case 'acceptance':
          return b.acceptanceRate - a.acceptanceRate;
        default:
          return 0;
      }
    });

    return filtered;
  }, [questionsWithStats, showMyQuestions, selectedTopic, selectedDifficulty, showAnswered, searchQuery, sortBy, userId]);

  // Calculate stats
  const totalQuestions = questions.length;
  // Count only correctly answered questions (not just attempted)
  const correctlyAnsweredQuestionIds = new Set(
    userResponses.filter(r => r.isCorrect).map(r => r.questionId)
  );
  const solvedCount = correctlyAnsweredQuestionIds.size;
  const myQuestionsCount = questions.filter(q => q.createdBy === userId).length;
  
  const correctAnswersCount = userResponses.filter(r => r.isCorrect).length;
  
  // Check for orphaned responses (responses without matching questions)
  const questionIds = new Set(questions.map(q => q.id));
  const orphanedResponses = userResponses.filter(r => !questionIds.has(r.questionId));

  // Handle question selection
  const handleSelectQuestion = (question: SharedQuestion) => {
    setSelectedQuestion(question);
    setViewMode('solve');
    setAnswer('');
    setShowHint(false);
    setFeedback(null);
  };

  const handleBackToList = () => {
    setViewMode('list');
    setSelectedQuestion(null);
    setAnswer('');
    setShowHint(false);
    setFeedback(null);
  };

  const handleSubmit = async () => {
    if (!answer.trim() || !selectedQuestion) return;

    setIsSubmitting(true);
    try {
      const evaluateAnswer = httpsCallable(functions, 'evaluateAnswer');
      const result = await evaluateAnswer({
        questionId: selectedQuestion.id,
        studentAnswer: answer,
      });

      const data = result.data as { isCorrect: boolean; feedback: string; pointsAwarded: number };
      
      setFeedback({
        isCorrect: data.isCorrect,
        message: data.feedback,
        pointsAwarded: data.pointsAwarded,
      });
      } catch (error) {
        setFeedback({
        isCorrect: false,
        message: 'Error submitting answer. Please try again.',
        pointsAwarded: 0,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGenerateMore = async (count: number = 3) => {
    if (!selectedQuestion) return;

    setIsGenerating(true);
    setGenerateMessage('');
    
    try {
      const generateMoreQuestions = httpsCallable(functions, 'generateMoreQuestions');
      const result = await generateMoreQuestions({
        questionId: selectedQuestion.id,
        count,
      });

      const data = result.data as { message: string };
      setGenerateMessage(`✅ ${data.message} They'll appear in the question list!`);
      
      setTimeout(() => setGenerateMessage(''), 5000);
    } catch (error) {
      setGenerateMessage('❌ Failed to generate questions. Please try again.');
      setTimeout(() => setGenerateMessage(''), 3000);
    } finally {
      setIsGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="practice">
        <header className="practice-header">
          <h1>AI Study Companion</h1>
          <Navigation />
        </header>
        <main className="practice-main">
          <p>Loading questions...</p>
        </main>
      </div>
    );
  }

  if (viewMode === 'solve' && selectedQuestion) {
    const questionStats = questionsWithStats.find(q => q.id === selectedQuestion.id);
    const isAnswered = questionStats?.isAnswered || false;
    const userIsCorrect = questionStats?.userIsCorrect || false;

    return (
      <div className="practice">
        <header className="practice-header">
          <h1>AI Study Companion</h1>
          <Navigation />
        </header>
        <main className="practice-main">
          <div className="practice-container question-detail-view">
            <button onClick={handleBackToList} className="back-button">
              ← Back to Questions
            </button>

            <div className="question-detail-card">
              {/* Header with badges and stats */}
              <div className="question-detail-header">
                <div className="question-badges">
                  <span className={`difficulty-badge ${selectedQuestion.difficulty}`}>
                    {selectedQuestion.difficulty.toUpperCase()}
                  </span>
                  <span className="subject-badge">{selectedQuestion.subject}</span>
                  {selectedQuestion.topics.map(topic => (
                    <span key={topic} className="topic-badge">{topic}</span>
                  ))}
                </div>
                <div className="question-stats-inline">
                  <span>📊 {selectedQuestion.timesAttempted} attempts</span>
                  <span>•</span>
                  <span>{questionStats?.acceptanceRate || 0}% acceptance</span>
                  {isAnswered && (
                    <>
                      <span>•</span>
                      <span className={userIsCorrect ? 'status-solved' : 'status-attempted'}>
                        {userIsCorrect ? '✓ Solved' : '○ Attempted'}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Display passage if available (for reading comprehension) */}
              {selectedQuestion.passage && (
                <div className="passage-container" style={{
                  marginBottom: '20px',
                  padding: '15px',
                  backgroundColor: '#f8f9fa',
                  borderRadius: '8px',
                  border: '1px solid #e0e0e0'
                }}>
                  <h3 style={{ marginTop: 0, marginBottom: '10px', fontSize: '18px', color: '#333' }}>
                    📖 Passage
                  </h3>
                  <div style={{
                    lineHeight: '1.6',
                    color: '#555',
                    whiteSpace: 'pre-wrap',
                    fontSize: '15px'
                  }}>
                    {selectedQuestion.passage}
                  </div>
                </div>
              )}

              {/* Question text */}
              <div className="question-detail-text">
                <h2>{selectedQuestion.text}</h2>
              </div>

              {/* Creator info */}
              <div className="creator-info-inline">
                👤 Created by <strong>{selectedQuestion.createdByName}</strong>
              </div>

              {/* If already answered correctly, show the answer */}
              {isAnswered && userIsCorrect && !feedback && (
                <div className="answer-revealed-section">
                  <div className="answer-revealed-header">
                    <h3>✅ Your Answer</h3>
                    <span className="answer-status correct">Correct!</span>
                  </div>
                  <div className="answer-revealed-content">
                    <div className="correct-answer-box">
                      <strong>Correct Answer:</strong>
                      <p>{selectedQuestion.correctAnswer}</p>
                    </div>
                    {selectedQuestion.explanation && (
                      <div className="explanation-box">
                        <strong>Explanation:</strong>
                        <p>{selectedQuestion.explanation}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* If attempted but not correct, encourage to try again */}
              {isAnswered && !userIsCorrect && !feedback && (
                <div className="try-again-banner">
                  <span>○ You've attempted this question. Try again to solve it!</span>
                </div>
              )}

              {/* Show input area if not solved yet or if they want to try again */}
              {(!isAnswered || !userIsCorrect) && !feedback && (
                <div className="answer-section">
                  <label className="answer-label">Your Answer:</label>
                  <textarea
                    className="answer-input-modern"
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder="Type your answer here..."
                    disabled={isSubmitting}
                    rows={6}
                  />

                  <div className="action-buttons">
                    <button 
                      className="hint-button-modern"
                      onClick={() => setShowHint(!showHint)}
                    >
                      💡 {showHint ? 'Hide' : 'Show'} Hint
                    </button>
                    <button
                      className="submit-button-modern"
                      onClick={handleSubmit}
                      disabled={!answer.trim() || isSubmitting}
                    >
                      {isSubmitting ? '⏳ Submitting...' : 'Submit Answer'}
                    </button>
                  </div>

                  {showHint && selectedQuestion.hint && (
                    <div className="hint-box-modern">
                      <strong>💡 Hint:</strong>
                      <p>{selectedQuestion.hint}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Feedback after submission - only show if not already solved */}
              {feedback && (!isAnswered || !userIsCorrect) && (
                <div className={`feedback-section ${feedback.isCorrect ? 'correct' : 'incorrect'}`}>
                  <div className="feedback-header">
                    <h3>{feedback.isCorrect ? '✅ Correct!' : '❌ Not Quite'}</h3>
                    {feedback.pointsAwarded > 0 && (
                      <span className="points-badge">+{feedback.pointsAwarded} points</span>
                    )}
                  </div>
                  <div className="feedback-content">
                    <p>{feedback.message}</p>
                    {selectedQuestion.correctAnswer && (
                      <div className="correct-answer-box">
                        <strong>Correct Answer:</strong>
                        <p>{selectedQuestion.correctAnswer}</p>
                      </div>
                    )}
                    {selectedQuestion.explanation && (
                      <div className="explanation-box">
                        <strong>Explanation:</strong>
                        <p>{selectedQuestion.explanation}</p>
                      </div>
                    )}
                  </div>
                  <button className="back-button-inline" onClick={handleBackToList}>
                    Back to Questions
                  </button>
                </div>
              )}

              {/* Generate more questions */}
              <div className="generate-more-section-bottom">
                <button 
                  className="generate-more-button-modern"
                  onClick={() => handleGenerateMore(3)}
                  disabled={isGenerating}
                >
                  {isGenerating ? '⏳ Generating...' : '🔄 Generate 3 More Like This'}
                </button>
                {generateMessage && (
                  <div className={`generate-message ${generateMessage.startsWith('✅') ? 'success' : 'error'}`}>
                    {generateMessage}
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="practice">
      <header className="practice-header">
        <h1>AI Study Companion</h1>
        <Navigation />
      </header>
      <main className="practice-main">
        <div className="practice-container">
          <h2>Practice Questions</h2>

          {/* LeetCode-style Topic Navigation Bar */}
          <div className="leetcode-topics-bar">
            <div className="topics-row-container">
              <div className="topics-first-row">
                <button
                  className={`topic-button ${selectedTopic === 'all' ? 'active' : ''}`}
                  onClick={() => setSelectedTopic('all')}
                >
                  All Topics
                </button>
                {allTopics.slice(0, 8).map(topic => (
                  <button
                    key={topic}
                    className={`topic-button ${selectedTopic === topic ? 'active' : ''}`}
                    onClick={() => setSelectedTopic(topic)}
                  >
                    {topic} ({topicCounts[topic] || 0})
                  </button>
                ))}
              </div>
              
              {allTopics.length > 8 && (
                <>
                  <div className={`topics-extra-rows ${topicsExpanded ? 'expanded' : ''}`}>
                    {allTopics.slice(8).map(topic => (
                      <button
                        key={topic}
                        className={`topic-button ${selectedTopic === topic ? 'active' : ''}`}
                        onClick={() => setSelectedTopic(topic)}
                      >
                        {topic} ({topicCounts[topic] || 0})
                      </button>
                    ))}
                  </div>
                  <button
                    className="topic-expand-button"
                    onClick={() => setTopicsExpanded(!topicsExpanded)}
                  >
                    {topicsExpanded ? '▼ Show Less' : '▶ Show All'}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Controls Row */}
          <div className="leetcode-controls-row">
            <div className="controls-left">
              <button
                className={`filter-button ${showMyQuestions ? 'active' : ''}`}
                onClick={() => setShowMyQuestions(!showMyQuestions)}
              >
                My Questions {showMyQuestions && `(${myQuestionsCount})`}
              </button>
              <button
                className={`filter-button ${!showAnswered ? 'active' : ''}`}
                onClick={() => setShowAnswered(!showAnswered)}
              >
                Unanswered Only
              </button>
              <div className="search-container">
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search questions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="controls-right">
              <select 
                className="sort-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'newest' | 'difficulty' | 'acceptance')}
              >
                <option value="newest">Newest</option>
                <option value="difficulty">Difficulty</option>
                <option value="acceptance">Acceptance Rate</option>
              </select>
              <select 
                className="difficulty-select"
                value={selectedDifficulty}
                onChange={(e) => setSelectedDifficulty(e.target.value as 'easy' | 'medium' | 'hard' | 'all')}
              >
                <option value="all">All</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="leetcode-stats-bar">
            <span>{solvedCount}/{totalQuestions} Solved</span>
            <button 
              className="shuffle-button" 
              onClick={() => {
                if (filteredQuestions.length > 0) {
                  const randomIndex = Math.floor(Math.random() * filteredQuestions.length);
                  const randomQuestion = filteredQuestions[randomIndex];
                  if (randomQuestion) {
                    handleSelectQuestion(randomQuestion);
                  }
                }
              }}
            >
              🔀 Pick One
            </button>
          </div>

          {/* Questions List - LeetCode Style */}
          {filteredQuestions.length === 0 ? (
            <div className="no-questions">
              <p>No questions match your filters.</p>
              <p>Try adjusting your filters or creating a tutoring session to generate new questions!</p>
            </div>
          ) : (
            <div className="leetcode-questions-list">
              {filteredQuestions.map((question, index) => {
                const difficultyColor = question.difficulty === 'easy' 
                  ? '#4caf50' 
                  : question.difficulty === 'medium' 
                  ? '#ff9800' 
                  : '#f44336';
                
                return (
                  <div
                    key={question.id}
                    className="leetcode-question-row"
                    onClick={() => handleSelectQuestion(question)}
                  >
                    <div className="question-number">{index + 1}.</div>
                    
                    <div className="question-title-cell">
                      {question.isAnswered && (
                        <span className={`status-icon ${question.userIsCorrect ? 'solved' : 'attempted'}`}>
                          {question.userIsCorrect ? '✓' : '○'}
                        </span>
                      )}
                      <span className="question-title">{question.text.length > 80 ? question.text.substring(0, 80) + '...' : question.text}</span>
                    </div>
                    
                    <div className="question-stats-cell">
                      <span className="acceptance-rate">{question.acceptanceRate}%</span>
                      <span className="difficulty-tag" style={{ color: difficultyColor }}>
                        {question.difficulty === 'easy' ? 'Easy' : question.difficulty === 'medium' ? 'Medium' : 'Hard'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default PracticeShared;
