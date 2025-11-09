import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { collection, query, where, onSnapshot, orderBy, Timestamp, doc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../services/firebase';
import { useAuth } from '../../contexts/AuthContext';
import Navigation from '../Shared/Navigation';
import './Practice.css';

interface PracticeQuestion {
  questionId: string;
  text: string;
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard';
  hint: string;
  correctAnswer: string;
  pointsValue: number;
  passage?: string; // Optional passage text for reading comprehension questions
}

interface PracticeItem {
  id: string;
  studentId: string;
  sessionId: string;
  goalId: string;
  scheduledFor: Timestamp;
  status: 'pending' | 'completed' | 'skipped';
  questions: PracticeQuestion[];
  responses: Array<{
    questionId: string;
    studentAnswer: string;
    submittedAt: Timestamp;
    isCorrect: boolean;
    aiFeedback: string;
    pointsAwarded: number;
  }>;
}

function Practice() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const checkpointId = searchParams.get('checkpointId');
  const sessionIdsParam = searchParams.get('sessionIds'); // Get sessionIds from URL (comma-separated)
  const sessionId = searchParams.get('sessionId'); // Fallback for single sessionId
  const pathId = searchParams.get('pathId');
  const difficulty = searchParams.get('difficulty') as 'easy' | 'medium' | 'hard' | null;
  const subject = searchParams.get('subject');
  
  // Parse sessionIds array
  const sessionIds = sessionIdsParam ? sessionIdsParam.split(',').filter(Boolean) : (sessionId ? [sessionId] : []);
  
  const [practiceItems, setPracticeItems] = useState<PracticeItem[]>([]);
  const [currentItem, setCurrentItem] = useState<PracticeItem | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [feedback, setFeedback] = useState<{
    isCorrect: boolean;
    message: string;
    pointsAwarded: number;
    dailyGoalComplete?: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDailyGoalCelebration, setShowDailyGoalCelebration] = useState(false);
  const [questionsCompleted, setQuestionsCompleted] = useState(0);
  const [questionsRequired, setQuestionsRequired] = useState(3); // 3 correct answers per checkpoint

  // Question selection view
  const [viewMode, setViewMode] = useState<'list' | 'solve'>(!checkpointId ? 'list' : 'solve'); // Start with list view unless from checkpoint
  const [selectedDifficulty, setSelectedDifficulty] = useState<'easy' | 'medium' | 'hard' | 'all'>('all');
  const [selectedTopic, setSelectedTopic] = useState<string>('all');
  const [showAnswered, setShowAnswered] = useState<boolean>(false);

  // Get current user ID from auth
  const { currentUser } = useAuth();
  const userId = currentUser?.uid || '';

  // Flatten all questions for list view with status marking
  const allQuestionsIncludingAnswered = practiceItems.flatMap(item => 
    item.questions.map(q => ({
      ...q,
      practiceItemId: item.id,
      sessionId: item.sessionId,
      status: (item.responses || []).find((r: any) => r.questionId === q.questionId) ? 'answered' : 'pending'
    }))
  );

  // Filter by answered/unanswered status
  const allQuestions = showAnswered 
    ? allQuestionsIncludingAnswered 
    : allQuestionsIncludingAnswered.filter(q => q.status === 'pending');

  // Get unique topics from unanswered questions
  const uniqueTopics = Array.from(new Set(allQuestions.map(q => q.topic)));

  // Filter questions based on selection
  const filteredQuestions = allQuestions.filter(q => {
    if (selectedDifficulty !== 'all' && q.difficulty !== selectedDifficulty) return false;
    if (selectedTopic !== 'all' && q.topic !== selectedTopic) return false;
    return true;
  });

  useEffect(() => {
    let practiceQuery = query(
      collection(db, 'practice_items'),
      where('studentId', '==', userId),
      where('status', '==', 'pending'),
      orderBy('scheduledFor', 'desc')
    );

    // If difficulty filter is provided, we'll filter client-side
    // (Firestore doesn't support filtering by nested array fields easily)
    const unsubscribe = onSnapshot(practiceQuery, (snapshot) => {
      let items = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as PracticeItem[];

      // Filter by difficulty and sessionIds if provided
      if (difficulty && checkpointId && sessionIds.length > 0) {
        items = items.filter(item => {
          // Filter by sessionIds (questions from this checkpoint's sessions)
          if (!sessionIds.includes(item.sessionId)) return false;
          
          // Filter questions by difficulty and limit to 3 questions per checkpoint
          const filteredQuestions = item.questions
            .filter((q: PracticeQuestion) => q.difficulty === difficulty)
            .slice(0, 3); // Limit to 3 questions per checkpoint
          
          if (filteredQuestions.length === 0) return false;
          
          // Update item to only include filtered questions
          item.questions = filteredQuestions;
          return true;
        });
      } else {
        // Organize questions by topic and difficulty when not in checkpoint mode
        items = items.map(item => {
          // Sort questions by topic first, then by difficulty (easy -> medium -> hard)
          const sortedQuestions = [...item.questions].sort((a, b) => {
            // First sort by topic
            const topicCompare = a.topic.localeCompare(b.topic);
            if (topicCompare !== 0) return topicCompare;
            
            // Then sort by difficulty
            const difficultyOrder = { easy: 1, medium: 2, hard: 3 };
            return difficultyOrder[a.difficulty] - difficultyOrder[b.difficulty];
          });
          
          return {
            ...item,
            questions: sortedQuestions
          };
        });
      }

      setPracticeItems(items);
      
      // If we have a current item, update it with the latest data
      if (currentItem) {
        const updatedItem = items.find(item => item.id === currentItem.id);
        if (updatedItem) {
          setCurrentItem(updatedItem);
          // Check if current question was answered, move to next unanswered
          const answeredQuestionIds = (updatedItem.responses || []).map((r: any) => r.questionId);
          const currentQId = updatedItem.questions[currentQuestionIndex]?.questionId;
          if (currentQId && answeredQuestionIds.includes(currentQId)) {
            // Current question was answered, find next unanswered
            const nextUnansweredIndex = updatedItem.questions.findIndex(
              (q: PracticeQuestion) => !answeredQuestionIds.includes(q.questionId)
            );
            if (nextUnansweredIndex >= 0) {
              setCurrentQuestionIndex(nextUnansweredIndex);
            }
          }
          
          // Track correct answers for checkpoint completion
          const correctAnswers = updatedItem.responses.filter(
            (r: any) => r.isCorrect && updatedItem.questions.some(q => q.questionId === r.questionId)
          ).length;
          setQuestionsCompleted(correctAnswers);
        }
      } else if (items.length > 0) {
        // Find the first unanswered question
        let foundUnanswered = false;
        for (const item of items) {
          const answeredQuestionIds = (item.responses || []).map((r: any) => r.questionId);
          const unansweredIndex = item.questions.findIndex(
            (q: PracticeQuestion) => !answeredQuestionIds.includes(q.questionId)
          );
          
          if (unansweredIndex >= 0) {
            setCurrentItem(item);
            setCurrentQuestionIndex(unansweredIndex);
            foundUnanswered = true;
            
            // Track correct answers
            if (checkpointId && sessionIds.length > 0) {
              const correctAnswers = item.responses.filter(
                (r: any) => r.isCorrect && item.questions.some((q: PracticeQuestion) => q.questionId === r.questionId)
              ).length;
              setQuestionsCompleted(correctAnswers);
            }
            break;
          }
        }
        
        // If all questions are answered, just show the first item
        if (!foundUnanswered && items.length > 0) {
          setCurrentItem(items[0]);
          setCurrentQuestionIndex(0);
        }
      }
      setLoading(false);
    });

    return unsubscribe;
  }, [userId, currentItem, difficulty, checkpointId, sessionIds]);

  const handleSubmitAnswer = async () => {
    if (!currentItem || !answer.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const evaluateAnswerFunction = httpsCallable(functions, 'evaluateAnswer');
      const result = await evaluateAnswerFunction({
        practiceId: currentItem.id,
        questionId: currentItem.questions[currentQuestionIndex].questionId,
        studentAnswer: answer.trim(),
      });

      const data = result.data as {
        isCorrect: boolean;
        feedback: string;
        pointsAwarded: number;
        leveledUp: boolean;
        newLevel: number;
        newBadges: Array<{ badgeId: string; emoji: string; name: string }>;
        dailyGoalComplete: boolean;
        currentStreak: number;
        regenerated?: boolean;
        newQuestion?: any;
      };

      setFeedback({
        isCorrect: data.isCorrect,
        message: data.feedback,
        pointsAwarded: data.pointsAwarded,
        dailyGoalComplete: data.dailyGoalComplete,
      });

      // If question was regenerated (wrong answer), update the question in the list
      if (data.regenerated && data.newQuestion && currentItem) {
        const updatedQuestions = [...currentItem.questions];
        updatedQuestions[currentQuestionIndex] = data.newQuestion;
        
        setCurrentItem({
          ...currentItem,
          questions: updatedQuestions,
        });
        
        // Clear the answer for the new question
        setAnswer('');
        setFeedback(null);
      }

      // If answer is correct, increment completed count
      if (data.isCorrect && checkpointId && sessionIds.length > 0) {
        setQuestionsCompleted(prev => {
          const newCount = prev + 1;
          
          // Check if checkpoint is complete (3 correct answers)
          if (newCount >= 3) {
            // Checkpoint completed - could show a success message here
          }
          
          return newCount;
        });
        
        // Move to next question if available and not at completion threshold
        if (currentQuestionIndex < currentItem.questions.length - 1 && questionsCompleted < 2) {
          setTimeout(() => {
            setCurrentQuestionIndex(prev => prev + 1);
            setAnswer('');
            setFeedback(null);
          }, 2000);
        }
      }

      // Show daily goal celebration if completed
      if (data.dailyGoalComplete) {
        setShowDailyGoalCelebration(true);
        // Auto-hide celebration after 3 seconds
        setTimeout(() => {
          setShowDailyGoalCelebration(false);
        }, 3000);
      }

      // TODO: Show celebration animations for level up, badges
      if (data.leveledUp) {
        // Level up
      }
      if (data.newBadges.length > 0) {
        // New badges
      }

      setAnswer('');
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

  const handleNextQuestion = () => {
    if (!currentItem) return;

    setShowHint(false);

    // Check if there are unanswered questions in the current item
    const answeredQuestionIds = (currentItem.responses || []).map((r: any) => r.questionId);
    const unansweredQuestions = currentItem.questions.filter(
      (q: PracticeQuestion) => !answeredQuestionIds.includes(q.questionId)
    );
    
    // Find the next unanswered question in the current item
    const nextUnansweredIndex = currentItem.questions.findIndex(
      (q: PracticeQuestion, idx: number) => 
        idx > currentQuestionIndex && !answeredQuestionIds.includes(q.questionId)
    );

    if (nextUnansweredIndex >= 0) {
      // Move to next unanswered question in current item
      setCurrentQuestionIndex(nextUnansweredIndex);
      setFeedback(null);
      setAnswer('');
    } else if (unansweredQuestions.length > 1) {
      // Move to the first unanswered question in current item (if we're not already there)
      const firstUnansweredIndex = currentItem.questions.findIndex(
        (q: PracticeQuestion) => !answeredQuestionIds.includes(q.questionId)
      );
      if (firstUnansweredIndex >= 0 && firstUnansweredIndex !== currentQuestionIndex) {
        setCurrentQuestionIndex(firstUnansweredIndex);
        setFeedback(null);
        setAnswer('');
      } else {
        // All questions in current item are answered, move to next item
        moveToNextItem();
      }
    } else {
      // All questions in current item are answered, move to next item
      moveToNextItem();
    }
  };

  const moveToNextItem = () => {
    // Find the next practice item with unanswered questions
    const remainingItems = practiceItems.filter(item => item.id !== currentItem?.id);
    
    for (const item of remainingItems) {
      const answeredQuestionIds = (item.responses || []).map((r: any) => r.questionId);
      const unansweredIndex = item.questions.findIndex(
        (q: PracticeQuestion) => !answeredQuestionIds.includes(q.questionId)
      );
      
      if (unansweredIndex >= 0) {
        setCurrentItem(item);
        setCurrentQuestionIndex(unansweredIndex);
        setFeedback(null);
        setAnswer('');
        return;
      }
    }
    
    // All questions are answered - mark current item as completed
    if (currentItem) {
      updateDoc(doc(db, 'practice_items', currentItem.id), {
        status: 'completed',
      }).catch((error) => {
        // Error marking practice as completed
      });
    }
    
    // No more unanswered questions
    setCurrentItem(null);
    setCurrentQuestionIndex(0);
    setFeedback(null);
    setAnswer('');
  };

  if (loading) {
    return (
      <div className="practice">
        <header className="practice-header">
          <h1>AI Study Companion</h1>
          <Navigation />
        </header>
        <main className="practice-main">
          <p>Loading practice questions...</p>
        </main>
      </div>
    );
  }

  if (!currentItem || currentItem.questions.length === 0) {
    return (
      <div className="practice">
        <header className="practice-header">
          <h1>AI Study Companion</h1>
          <Navigation />
        </header>
        <main className="practice-main">
          <h2>No Practice Questions Available</h2>
          <p>Complete more tutoring sessions to unlock practice questions!</p>
        </main>
      </div>
    );
  }

  const currentQuestion = currentItem.questions[currentQuestionIndex];
  const totalQuestions = currentItem.questions.length;
  
  // Calculate overall progress across all practice items
  const totalAvailableQuestions = practiceItems.reduce((sum, item) => sum + item.questions.length, 0);
  const currentItemIndex = practiceItems.findIndex(item => item.id === currentItem.id);
  const questionsBeforeCurrent = practiceItems.slice(0, currentItemIndex).reduce((sum, item) => sum + item.questions.length, 0);
  const currentQuestionNumber = questionsBeforeCurrent + currentQuestionIndex + 1;

  // Handle selecting a question from the list
  const handleSelectQuestion = (questionId: string, practiceItemId: string) => {
    const item = practiceItems.find(i => i.id === practiceItemId);
    if (!item) return;
    
    const questionIndex = item.questions.findIndex(q => q.questionId === questionId);
    if (questionIndex === -1) return;
    
    setCurrentItem(item);
    setCurrentQuestionIndex(questionIndex);
    setViewMode('solve');
    setAnswer('');
    setFeedback(null);
    setShowHint(false);
  };

  // If in list view and not from checkpoint, show question list
  if (viewMode === 'list' && !checkpointId) {
    return (
      <div className="practice">
        <header className="practice-header">
          <h1>AI Study Companion</h1>
          <Navigation />
        </header>
        <main className="practice-main">
          <div className="practice-container">
            <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0 }}>Practice Questions</h2>
              <button
                onClick={() => {
                  if (practiceItems.length > 0) {
                    setCurrentItem(practiceItems[0]);
                    setCurrentQuestionIndex(0);
                    setViewMode('solve');
                  }
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#667eea',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                Random Question
              </button>
            </div>

            {/* Filters */}
            <div style={{ marginBottom: '20px', display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <label style={{ fontSize: '14px', fontWeight: '500', marginRight: '10px' }}>Status:</label>
                <select 
                  value={showAnswered ? 'all' : 'pending'}
                  onChange={(e) => setShowAnswered(e.target.value === 'all')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid #e0e0e0',
                    fontSize: '14px'
                  }}
                >
                  <option value="pending">Unanswered Only</option>
                  <option value="all">All Questions</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '14px', fontWeight: '500', marginRight: '10px' }}>Difficulty:</label>
                <select 
                  value={selectedDifficulty}
                  onChange={(e) => setSelectedDifficulty(e.target.value as any)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid #e0e0e0',
                    fontSize: '14px'
                  }}
                >
                  <option value="all">All</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '14px', fontWeight: '500', marginRight: '10px' }}>Topic:</label>
                <select 
                  value={selectedTopic}
                  onChange={(e) => setSelectedTopic(e.target.value)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid #e0e0e0',
                    fontSize: '14px'
                  }}
                >
                  <option value="all">All Topics</option>
                  {uniqueTopics.map(topic => (
                    <option key={topic} value={topic}>{topic}</option>
                  ))}
                </select>
              </div>
              <div style={{ marginLeft: 'auto', fontSize: '14px', color: '#666' }}>
                Showing {filteredQuestions.length} of {allQuestions.length} questions
              </div>
            </div>

            {/* Question List Table */}
            {filteredQuestions.length > 0 ? (
              <div style={{
                backgroundColor: '#fff',
                borderRadius: '8px',
                border: '1px solid #e0e0e0',
                overflow: 'hidden'
              }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse'
                }}>
                  <thead>
                    <tr style={{
                      backgroundColor: '#f8f9fa',
                      borderBottom: '2px solid #e0e0e0'
                    }}>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>Status</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>Question</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>Topic</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>Difficulty</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '14px', fontWeight: '600' }}>Points</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '14px', fontWeight: '600' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredQuestions.map((question, index) => {
                      const difficultyColor = question.difficulty === 'easy' ? '#4caf50' : question.difficulty === 'medium' ? '#ff9800' : '#f44336';
                      
                      return (
                        <tr 
                          key={question.questionId}
                          style={{
                            backgroundColor: index % 2 === 0 ? '#fff' : '#fafafa',
                            borderBottom: '1px solid #e0e0e0'
                          }}
                        >
                          <td style={{ padding: '16px' }}>
                            {question.status === 'answered' ? (
                              <span style={{
                                padding: '4px 10px',
                                backgroundColor: '#4caf5020',
                                color: '#4caf50',
                                borderRadius: '12px',
                                fontSize: '12px',
                                fontWeight: '500'
                              }}>
                                ✓ Answered
                              </span>
                            ) : (
                              <span style={{
                                padding: '4px 10px',
                                backgroundColor: '#ff980020',
                                color: '#ff9800',
                                borderRadius: '12px',
                                fontSize: '12px',
                                fontWeight: '500'
                              }}>
                                Pending
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '16px', fontSize: '14px', maxWidth: '400px' }}>
                            {question.text.length > 80 ? question.text.substring(0, 80) + '...' : question.text}
                          </td>
                          <td style={{ padding: '16px', fontSize: '14px' }}>
                            <span style={{
                              padding: '4px 10px',
                              backgroundColor: '#e8f0fe',
                              color: '#667eea',
                              borderRadius: '12px',
                              fontSize: '12px'
                            }}>
                              {question.topic}
                            </span>
                          </td>
                          <td style={{ padding: '16px', fontSize: '14px' }}>
                            <span style={{
                              padding: '4px 10px',
                              backgroundColor: difficultyColor + '20',
                              color: difficultyColor,
                              borderRadius: '12px',
                              fontSize: '12px',
                              fontWeight: '500',
                              textTransform: 'capitalize'
                            }}>
                              {question.difficulty}
                            </span>
                          </td>
                          <td style={{ padding: '16px', textAlign: 'center', fontSize: '14px', fontWeight: '500' }}>
                            {question.pointsValue}
                          </td>
                          <td style={{ padding: '16px', textAlign: 'center' }}>
                            <button
                              onClick={() => handleSelectQuestion(question.questionId, question.practiceItemId)}
                              style={{
                                padding: '6px 14px',
                                backgroundColor: '#667eea',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '13px',
                                fontWeight: '500'
                              }}
                            >
                              {question.status === 'answered' ? 'Review' : 'Solve'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ textAlign: 'center', color: '#666', padding: '40px' }}>
                No questions match your filters. Try selecting different options.
              </p>
            )}
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
          {/* Back to List button (only show if not from checkpoint) */}
          {!checkpointId && (
            <button
              onClick={() => setViewMode('list')}
              style={{
                marginBottom: '20px',
                padding: '8px 16px',
                backgroundColor: '#f0f0f0',
                color: '#333',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              ← Back to Question List
            </button>
          )}
          
          {checkpointId && (
            <div className="checkpoint-progress-bar">
              <div className="progress-info">
                <span>Checkpoint Progress: {questionsCompleted}/{questionsRequired} correct answers</span>
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${(questionsCompleted / questionsRequired) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          )}
          <div className="practice-header-bar">
            <span className="question-counter">
              Question {currentQuestionNumber} of {totalAvailableQuestions} available
            </span>
          </div>

          {/* Daily Goal Celebration */}
          {showDailyGoalCelebration && (
            <div className="daily-goal-celebration">
              <div className="celebration-content">
                <span className="celebration-icon">🎉</span>
                <h2>Daily Goal Complete!</h2>
                <p>You've answered 3 questions today! Great job! 🎯</p>
                <p className="celebration-subtitle">You can keep practicing if you want!</p>
              </div>
            </div>
          )}

          {feedback ? (
            <div className={`feedback-container ${feedback.isCorrect ? 'correct' : 'incorrect'}`}>
              <div className="feedback-icon">
                {feedback.isCorrect ? '✨' : '💡'}
              </div>
              <h3>{feedback.isCorrect ? 'Awesome work! 🎉' : 'Keep trying!'}</h3>
              <p className="points-earned">+{feedback.pointsAwarded} points</p>
              {feedback.dailyGoalComplete && (
                <div className="daily-goal-badge">
                  🎯 Daily Goal Complete!
                </div>
              )}
              <p className="feedback-message">
                <MathRenderer content={feedback.message} />
              </p>
              <button onClick={handleNextQuestion} className="next-button">
                {(() => {
                  // Check if there are more questions in current item
                  if (currentQuestionIndex < totalQuestions - 1) {
                    return 'Next Question';
                  }
                  // Check if there are more practice items
                  const remainingItems = practiceItems.filter(item => item.id !== currentItem.id);
                  if (remainingItems.length > 0) {
                    return `Continue (${remainingItems.length} more ${remainingItems.length === 1 ? 'set' : 'sets'})`;
                  }
                  return 'All Done!';
                })()}
              </button>
            </div>
          ) : (
            <div className="question-container">
              <div className="question-info">
                <span className="topic-badge">{currentQuestion.topic}</span>
                <span className="difficulty-badge">{currentQuestion.difficulty}</span>
              </div>

              {/* Display passage if available (for reading comprehension) */}
              {currentQuestion.passage && (
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
                    {currentQuestion.passage}
                  </div>
                </div>
              )}

              <div className="question-text">
                <h2><MathRenderer content={currentQuestion.text} /></h2>
              </div>

              <div className="answer-input-container">
                <textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Type your answer here..."
                  className="answer-input"
                  rows={4}
                  disabled={isSubmitting}
                />
              </div>

              <div className="hint-section">
                <button 
                  className="hint-button"
                  onClick={() => setShowHint(!showHint)}
                >
                  💡 {showHint ? 'Hide Hint' : 'Need a hint?'}
                </button>
                {showHint && (
                  <div className="hint-text">
                    <MathRenderer content={currentQuestion.hint} />
                  </div>
                )}
              </div>

              <button
                onClick={handleSubmitAnswer}
                disabled={!answer.trim() || isSubmitting}
                className="submit-button"
              >
                {isSubmitting ? 'Submitting...' : 'Submit Answer'}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default Practice;
