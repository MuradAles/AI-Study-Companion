import { ReactNode, useState } from 'react';
import './TreeNode.css';

interface TreeNodeProps {
  node: {
    type: 'start' | 'subject' | 'tutor' | 'session' | 'checkpoint';
    label: string;
    progress?: number;
    completed?: boolean;
    unlocked?: boolean;
    date?: any;
    stats?: {
      totalSessions?: number;
      totalCheckpoints?: number;
      completedCheckpoints?: number;
    };
  };
  children?: ReactNode;
  onClick?: () => void;
  level?: number;
}

function TreeNode({ node, children, onClick, level = 0 }: TreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(level < 2); // Auto-expand first 2 levels

  const hasChildren = !!children;
  const canExpand = hasChildren && (node.type === 'tutor' || node.type === 'session' || node.type === 'subject');

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (canExpand) {
      setIsExpanded(!isExpanded);
    }
  };

  const handleClick = () => {
    if (onClick) {
      onClick();
    }
  };

  // Get icon based on type
  const getIcon = () => {
    switch (node.type) {
      case 'start':
        return '🏁';
      case 'subject':
        return '📚';
      case 'tutor':
        return '👨‍🏫';
      case 'session':
        return '📝';
      case 'checkpoint':
        if (node.completed) return '✅';
        if (node.unlocked) return '⏳';
        return '🔒';
      default:
        return '•';
    }
  };

  // Get status color
  const getStatusColor = () => {
    if (node.type === 'checkpoint') {
      if (node.completed) return '#4caf50';
      if (node.unlocked) return '#667eea';
      return '#999';
    }
    return '#333';
  };

  return (
    <div className={`tree-node tree-node-${node.type} level-${level}`}>
      <div 
        className="tree-node-header"
        onClick={canExpand ? handleToggle : handleClick}
        style={{
          cursor: canExpand ? 'pointer' : onClick ? 'pointer' : 'default',
          color: getStatusColor(),
        }}
      >
        {canExpand && (
          <span className="expand-icon">
            {isExpanded ? '▼' : '▶'}
          </span>
        )}
        
        <span className="node-icon">{getIcon()}</span>
        
        <span className="node-label">{node.label}</span>
        
        {node.progress !== undefined && (
          <span className="node-progress">
            {Math.round(node.progress)}%
          </span>
        )}
        
        {node.stats && (
          <span className="node-stats">
            ({node.stats.completedCheckpoints || 0}/{node.stats.totalCheckpoints || 0} checkpoints)
          </span>
        )}
        
        {node.date && (
          <span className="node-date">
            {new Date(node.date.toDate?.() || node.date).toLocaleDateString()}
          </span>
        )}
      </div>
      
      {hasChildren && isExpanded && (
        <div className="tree-node-children">
          {children}
        </div>
      )}
    </div>
  );
}

export default TreeNode;

