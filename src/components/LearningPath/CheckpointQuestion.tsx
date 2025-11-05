import { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, arrayUnion } from 'firebase/firestore';
import { functions, db } from '../../services/firebase';
import { useAuth } from '../../contexts/AuthContext';
import './CheckpointQuestion.css';

interface PracticeQuestion {
  questionId: string;
  text: string;
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard';
  hint: string;
  correctAnswer: string;
  pointsValue: number;
  passage?: string;
}

interface CheckpointQuestionProps {
  checkpointId: string;
  sessionIds: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  subject: string;
  onComplete: (correctAnswers: number) => void;
  onClose: () => void;
}

function CheckpointQuestion({
  checkpointId,
  sessionIds,
  difficulty,
  subject,
  onComplete,
  onClose,
}: CheckpointQuestionProps) {
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    isCorrect: boolean;
    message: string;
  } | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [loading, setLoading] = useState(true);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false);
  const [practiceItemId, setPracticeItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { currentUser } = useAuth();
  const userId = currentUser?.uid || '';

  const currentQuestion = questions[currentQuestionIndex];

  // Generate questions when component mounts
  useEffect(() => {
    const generateQuestions = async () => {
      // Validate sessionIds before making the call
      if (!sessionIds || sessionIds.length === 0) {
        console.error('No session IDs provided for checkpoint');
        setLoading(false);
        setError('This checkpoint has no sessions. Please complete tutoring sessions first.');
        return;
      }

      try {
        setLoading(true);
        const generateCheckpointQuestions = httpsCallable(functions, 'generateCheckpointQuestions');
        const result = await generateCheckpointQuestions({
          sessionIds,
          difficulty,
          subject,
        });

        const data = result.data as {
          questions: PracticeQuestion[];
        };

        setQuestions(data.questions);
        
        // Create a practice item to track answers
        // Tag it with checkpointId so we can track progress per checkpoint
        if (userId && sessionIds.length > 0) {
          const practiceItemRef = await addDoc(collection(db, 'practice_items'), {
            studentId: userId,
            sessionId: sessionIds[0], // Use first session ID
            checkpointId: checkpointId, // Tag with checkpoint ID for tracking
            status: 'pending',
            questions: data.questions,
            responses: [],
            createdAt: new Date(),
          });
          setPracticeItemId(practiceItemRef.id);
        }
        
        setLoading(false);
        setError(null);
      } catch (error) {
        console.error('Error generating questions:', error);
        setLoading(false);
        setError('Failed to generate questions. Please try again.');
      }
    };

    generateQuestions();
  }, [sessionIds, difficulty, subject, onClose, userId]);

  const handleSubmitAnswer = async () => {
    if (!currentQuestion || !answer.trim() || isSubmitting || !practiceItemId) return;

    setIsSubmitting(true);
    setFeedback(null);

    try {
      // Use evaluateAnswer function for proper evaluation
      const evaluateAnswerFunction = httpsCallable(functions, 'evaluateAnswer');
      const result = await evaluateAnswerFunction({
        practiceId: practiceItemId,
        questionId: currentQuestion.questionId,
        studentAnswer: answer.trim(),
      });

      const data = result.data as {
        isCorrect: boolean;
        feedback: string;
        pointsAwarded: number;
        regenerated?: boolean;
        newQuestion?: PracticeQuestion;
      };

      setFeedback({
        isCorrect: data.isCorrect,
        message: data.feedback,
      });

      if (data.isCorrect) {
        const newCorrectCount = correctAnswers + 1;
        setCorrectAnswers(newCorrectCount);

        // Pre-generate questions for next checkpoint when student gets 2 correct answers
        if (newCorrectCount === 2) {
          preGenerateNextCheckpointQuestions();
        }

        // Check if checkpoint is complete (3 correct answers)
        if (newCorrectCount >= 3) {
          setShowSuccess(true);
          setTimeout(() => {
            onComplete(newCorrectCount);
          }, 2000);
          return;
        }

        // Move to next question after 2 seconds
        setTimeout(() => {
          if (currentQuestionIndex < questions.length - 1) {
            setCurrentQuestionIndex(prev => prev + 1);
            setAnswer('');
            setFeedback(null);
            setShowHint(false);
          }
        }, 2000);
      } else {
        // If question was regenerated, update the question list
        if (data.regenerated && data.newQuestion) {
          const newQuestions = [...questions];
          newQuestions[currentQuestionIndex] = data.newQuestion;
          setQuestions(newQuestions);
        }
        
        // Clear answer and show feedback
        setTimeout(() => {
          setAnswer('');
          setFeedback(null);
          setShowHint(false);
        }, 3000);
      }
    } catch (error) {
      console.error('Error submitting answer:', error);
      setFeedback({
        isCorrect: false,
        message: 'Error submitting answer. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Pre-generate questions for the next checkpoint
  const preGenerateNextCheckpointQuestions = async () => {
    try {
      // Extract checkpoint number from checkpointId (e.g., "cp-0" -> 0)
      const currentCheckpointNum = parseInt(checkpointId.split('-')[1]);
      if (isNaN(currentCheckpointNum)) return;

      const nextCheckpointId = `cp-${currentCheckpointNum + 1}`;

      // Check if questions are already pre-generated for next checkpoint
      const existingQuery = query(
        collection(db, 'pre_generated_questions'),
        where('studentId', '==', userId),
        where('checkpointId', '==', nextCheckpointId),
        where('subject', '==', subject)
      );
      
      const existingDocs = await getDocs(existingQuery);
      if (!existingDocs.empty) {
        console.log('Questions already pre-generated for next checkpoint');
        return;
      }

      // Get next checkpoint's session IDs (this would need to be passed as a prop or fetched)
      // For now, we'll just log that we would pre-generate
      console.log(`Pre-generating questions for checkpoint ${nextCheckpointId}...`);
      
      // In a full implementation, you would:
      // 1. Get next checkpoint's sessionIds
      // 2. Call generateCheckpointQuestions for each difficulty
      // 3. Store in pre_generated_questions collection with structure:
      //    {
      //      studentId: string,
      //      checkpointId: string,
      //      subject: string,
      //      difficulty: 'easy' | 'medium' | 'hard',
      //      questions: PracticeQuestion[],
      //      createdAt: Timestamp,
      //      used: boolean
      //    }
    } catch (error) {
      console.error('Error pre-generating questions:', error);
      // Don't block user if pre-generation fails
    }
  };

  if (loading) {
    return (
      <div className="checkpoint-question-overlay">
        <div className="checkpoint-question-modal loading">
          <div className="loading-spinner"></div>
          <p>Generating questions...</p>
        </div>
      </div>
    );
  }

  if (showSuccess) {
    return (
      <div className="checkpoint-question-overlay">
        <div className="checkpoint-question-modal success">
          <div className="success-icon">🎉</div>
          <h2>Checkpoint Complete!</h2>
          <p>You answered 3 questions correctly!</p>
          <p>Moving to next checkpoint...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="checkpoint-question-overlay">
        <div className="checkpoint-question-modal error">
          <div className="error-icon">⚠️</div>
          <h2>Unable to Load Questions</h2>
          <p>{error}</p>
          <button onClick={onClose} className="close-button">Close</button>
        </div>
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="checkpoint-question-overlay">
        <div className="checkpoint-question-modal error">
          <div className="error-icon">⚠️</div>
          <h2>No Questions Available</h2>
          <p>Could not generate questions for this checkpoint. Please try another one.</p>
          <button onClick={onClose} className="close-button">Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="checkpoint-question-overlay">
      <div className="checkpoint-question-modal">
        <div className="question-header">
          <div className="question-progress">
            Question {currentQuestionIndex + 1} of {questions.length}
          </div>
          <div className="correct-counter">
            ✓ {correctAnswers}/3 Correct
          </div>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="question-content">
          <div className="question-difficulty">
            <span className={`difficulty-badge ${difficulty}`}>
              {difficulty.toUpperCase()}
            </span>
          </div>

          {currentQuestion.passage && (
            <div className="question-passage">
              <p>{currentQuestion.passage}</p>
            </div>
          )}

          <div className="question-text">
            <h3>{currentQuestion.text}</h3>
          </div>

          <div className="answer-input">
            <input
              type="text"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !isSubmitting) {
                  handleSubmitAnswer();
                }
              }}
              placeholder="Type your answer here..."
              disabled={isSubmitting}
              autoFocus
            />
          </div>

          {feedback && (
            <div className={`feedback ${feedback.isCorrect ? 'correct' : 'incorrect'}`}>
              {feedback.message}
            </div>
          )}

          <div className="question-actions">
            <button
              className="hint-button"
              onClick={() => setShowHint(!showHint)}
            >
              {showHint ? 'Hide' : 'Show'} Hint
            </button>
            <button
              className="submit-button"
              onClick={handleSubmitAnswer}
              disabled={!answer.trim() || isSubmitting}
            >
              {isSubmitting ? 'Checking...' : 'Submit Answer'}
            </button>
          </div>

          {showHint && (
            <div className="hint-box">
              <p><strong>Hint:</strong> {currentQuestion.hint}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CheckpointQuestion;

