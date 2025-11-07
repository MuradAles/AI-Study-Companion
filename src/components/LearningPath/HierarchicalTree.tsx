import TreeNode from './TreeNode';

interface Session {
  id: string;
  tutorName?: string;
  date: any;
  aiAnalysis?: {
    topicsCovered?: string[];
  };
}

interface Checkpoint {
  id: string;
  order: number;
  completed: boolean;
  unlocked: boolean;
  topics?: string[];
  sessionId?: string;
  correctAnswers?: number;
  nodeType: 'combat' | 'mystery' | 'rest' | 'shop';
  position: {
    x: number;
    y: number;
  };
  connections: string[];
  sessionIds?: string[];
  difficulty?: 'easy' | 'medium' | 'hard';
}

interface TutorData {
  tutorName: string;
  sessions: {
    [sessionId: string]: {
      sessionId: string;
      date: any;
      topics: string[];
      checkpoints: Checkpoint[];
    };
  };
  totalSessions: number;
  totalCheckpoints: number;
  completedCheckpoints: number;
  progress: number;
}

interface HierarchicalTreeProps {
  subject: string;
  sessions: Session[];
  checkpointsMap: Map<string, Checkpoint[]>; // sessionId -> checkpoints
  onCheckpointClick?: (checkpoint: Checkpoint) => void;
}

function HierarchicalTree({ subject, sessions, checkpointsMap, onCheckpointClick }: HierarchicalTreeProps) {
  // Build hierarchical structure from sessions
  const buildHierarchy = (): { [tutorName: string]: TutorData } => {
    const tutorsMap = new Map<string, Session[]>();
    
    // Group sessions by tutor
    sessions.forEach(session => {
      const tutorName = session.tutorName || 'Unknown Tutor';
      if (!tutorsMap.has(tutorName)) {
        tutorsMap.set(tutorName, []);
      }
      tutorsMap.get(tutorName)!.push(session);
    });
    
    const tutors: { [tutorName: string]: TutorData } = {};
    
    // Build tutor structure
    tutorsMap.forEach((tutorSessions, tutorName) => {
      const tutorSessionsMap: any = {};
      let totalCheckpoints = 0;
      let completedCheckpoints = 0;
      
      tutorSessions.forEach(session => {
        const topics = session.aiAnalysis?.topicsCovered || [];
        const sessionCheckpoints = checkpointsMap.get(session.id) || [];
        
        // Count completed checkpoints
        completedCheckpoints += sessionCheckpoints.filter(cp => cp.completed).length;
        totalCheckpoints += sessionCheckpoints.length;
        
        tutorSessionsMap[session.id] = {
          sessionId: session.id,
          date: session.date,
          topics: topics,
          checkpoints: sessionCheckpoints,
        };
      });
      
      const progress = totalCheckpoints > 0 
        ? (completedCheckpoints / totalCheckpoints) * 100 
        : 0;
      
      tutors[tutorName] = {
        tutorName,
        sessions: tutorSessionsMap,
        totalSessions: tutorSessions.length,
        totalCheckpoints,
        completedCheckpoints,
        progress,
      };
    });
    
    return tutors;
  };

  const tutors = buildHierarchy();

  return (
    <div className="hierarchical-tree">
      <TreeNode
        node={{
          type: 'start',
          label: 'START',
        }}
        level={0}
      >
        <TreeNode
          node={{
            type: 'subject',
            label: subject,
          }}
          level={1}
        >
          {Object.values(tutors).map((tutor, tutorIndex) => (
            <TreeNode
              key={tutor.tutorName}
              node={{
                type: 'tutor',
                label: tutor.tutorName,
                progress: tutor.progress,
                stats: {
                  totalSessions: tutor.totalSessions,
                  totalCheckpoints: tutor.totalCheckpoints,
                  completedCheckpoints: tutor.completedCheckpoints,
                },
              }}
              level={2}
            >
              {Object.values(tutor.sessions).map((session, sessionIndex) => (
                <TreeNode
                  key={session.sessionId}
                  node={{
                    type: 'session',
                    label: `Session ${sessionIndex + 1}`,
                    date: session.date,
                  }}
                  level={3}
                >
                  {session.checkpoints.map((checkpoint, cpIndex) => (
                    <TreeNode
                      key={checkpoint.id}
                      node={{
                        type: 'checkpoint',
                        label: `CP${cpIndex + 1}`,
                        completed: checkpoint.completed,
                        unlocked: checkpoint.unlocked,
                      }}
                      onClick={() => onCheckpointClick?.(checkpoint)}
                      level={4}
                    />
                  ))}
                </TreeNode>
              ))}
            </TreeNode>
          ))}
        </TreeNode>
      </TreeNode>
    </div>
  );
}

export default HierarchicalTree;

