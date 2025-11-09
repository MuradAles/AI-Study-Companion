import React, { useState } from 'react';
import MathRenderer from '../Shared/MathRenderer';

interface PracticeQuestion {
  questionText: string;
  options: string[];
  correctAnswer: string;
  userAnswer?: string;
  isCorrect?: boolean;
  explanation?: string;
}

interface PracticeQuestionCardProps {
  question: PracticeQuestion;
  messageId: string;
  onAnswerSelect?: (answer: string) => void;
  disabled?: boolean;
}

function PracticeQuestionCard({ question, messageId, onAnswerSelect, disabled = false }: PracticeQuestionCardProps) {
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(question.userAnswer || null);
  const [showResult, setShowResult] = useState<boolean>(!!question.userAnswer);

  const handleAnswerSelect = (option: string) => {
    if (showResult || disabled) return; // Already answered or disabled

    setSelectedAnswer(option);
    setShowResult(true);
    
    // Call parent callback if provided
    if (onAnswerSelect) {
      onAnswerSelect(option);
    }
  };

  const isCorrect = selectedAnswer === question.correctAnswer;
  const optionLabels = ['A', 'B', 'C', 'D'];

  return (
    <div className="practice-question-card">
      <h4 className="question-title">📝 Practice Question</h4>
      <div className="question-text">
        <MathRenderer content={question.questionText} />
      </div>
      
      <div className="question-options">
        {question.options.map((option, index) => {
          const label = optionLabels[index];
          const isSelected = selectedAnswer === label;
          const isCorrectOption = label === question.correctAnswer;
          
          let className = 'option-button';
          if (showResult && isSelected) {
            className += isCorrect ? ' option-correct' : ' option-incorrect';
          }
          if (showResult && isCorrectOption && !isCorrect) {
            className += ' option-correct-highlight';
          }
          
          return (
            <button
              key={index}
              className={className}
              onClick={() => handleAnswerSelect(label)}
              disabled={showResult || disabled}
            >
              <span className="option-label">{label}</span>
              <span className="option-text">
                <MathRenderer content={option} />
              </span>
            </button>
          );
        })}
      </div>

      {showResult && (
        <div className={`question-result ${isCorrect ? 'result-correct' : 'result-incorrect'}`}>
          <p className="result-text">
            {isCorrect ? '✅ Correct!' : `❌ Incorrect. The correct answer is ${question.correctAnswer}.`}
          </p>
          {question.explanation && (
            <p className="result-explanation">
              <MathRenderer content={question.explanation} />
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default PracticeQuestionCard;

