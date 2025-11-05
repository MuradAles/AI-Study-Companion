import './DifficultyModal.css';

interface DifficultyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectDifficulty: (difficulty: 'easy' | 'medium' | 'hard') => void;
  checkpointOrder: number;
}

function DifficultyModal({ isOpen, onClose, onSelectDifficulty, checkpointOrder }: DifficultyModalProps) {
  if (!isOpen) return null;

  const handleDifficultySelect = (difficulty: 'easy' | 'medium' | 'hard') => {
    onSelectDifficulty(difficulty);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Choose Your Path</h2>
          <p>Select difficulty for Checkpoint {checkpointOrder}</p>
        </div>

        <div className="difficulty-options">
          <button
            className="difficulty-option easy"
            onClick={() => handleDifficultySelect('easy')}
          >
            <div className="difficulty-icon">🌱</div>
            <div className="difficulty-title">Easy</div>
            <div className="difficulty-description">
              Start here to build confidence
            </div>
            <div className="difficulty-reward">+10 points</div>
          </button>

          <button
            className="difficulty-option medium"
            onClick={() => handleDifficultySelect('medium')}
          >
            <div className="difficulty-icon">⚡</div>
            <div className="difficulty-title">Medium</div>
            <div className="difficulty-description">
              Balanced challenge
            </div>
            <div className="difficulty-reward">+25 points</div>
          </button>

          <button
            className="difficulty-option hard"
            onClick={() => handleDifficultySelect('hard')}
          >
            <div className="difficulty-icon">🔥</div>
            <div className="difficulty-title">Hard</div>
            <div className="difficulty-description">
              Test your mastery
            </div>
            <div className="difficulty-reward">+50 points</div>
          </button>
        </div>

        <button className="modal-close" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export default DifficultyModal;

