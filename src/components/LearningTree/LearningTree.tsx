import { useState, useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../services/firebase';
import { useAuth } from '../../contexts/AuthContext';
import Navigation from '../Shared/Navigation';
import './LearningTree.css';

interface TreeNode {
  id: string;
  type: 'student' | 'subject' | 'tutor' | 'difficulty';
  name: string;
  parentId?: string;
  children?: TreeNode[];
  level?: number;
  points?: number;
  sessionCount?: number;
  tutorName?: string;
  sessionIds?: string[];
  difficultyLevel?: 'easy' | 'medium' | 'hard';
  completed?: number;
  total?: number;
  questionIds?: string[];
  subject?: string;
}

interface SubjectProgress {
  subject: string;
  completed: number;
  total: number;
  percentage: number;
  isComplete: boolean;
}

interface Question {
  id: string;
  text: string;
  subject: string;
  tutorName: string;
  difficulty: 'easy' | 'medium' | 'hard';
  status: 'pending' | 'completed';
  sessionId?: string;
  practiceItemId?: string;
  hint?: string;
  submittedAnswer?: string;
}

function LearningTree() {
  const { currentUser } = useAuth();
  const svgRef = useRef<SVGSVGElement>(null);
  const [treeData, setTreeData] = useState<TreeNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [showQuestions, setShowQuestions] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [showQuestionDetail, setShowQuestionDetail] = useState(false);
  const [answer, setAnswer] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    isCorrect: boolean;
    message: string;
    pointsAwarded: number;
  } | null>(null);
  const [subjectProgress, setSubjectProgress] = useState<SubjectProgress[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const userId = currentUser?.uid || '';

  // Build tree function - extracted so it can be called manually
  const buildTreeFromFirebase = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

        const studentDoc = await getDocs(query(collection(db, 'students'), where('__name__', '==', userId)));
        const studentData = studentDoc.docs[0]?.data();

        const sessionsQuery = query(collection(db, 'sessions'), where('studentId', '==', userId));
        const sessionsSnapshot = await getDocs(sessionsQuery);
        const sessions = sessionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const root: TreeNode = {
          id: 'student-root',
          type: 'student',
          name: studentData?.name || 'You',
          level: studentData?.gamification?.level || 1,
          points: studentData?.gamification?.totalPoints || 0,
          children: []
        };

        // Build tree structure: Student -> Subject -> Tutor -> Difficulty
        const subjectMap: Map<string, { tutors: Map<string, Set<string>> }> = new Map();
        
        sessions.forEach((session: { subject?: string; tutorName?: string; id: string; [key: string]: any }) => {
          const subject = session.subject || 'Unknown';
          const tutorName = session.tutorName || 'Unknown Tutor';
          
          if (!subjectMap.has(subject)) {
            subjectMap.set(subject, { tutors: new Map() });
          }
          
          const subjectData = subjectMap.get(subject)!;
          
          if (!subjectData.tutors.has(tutorName)) {
            subjectData.tutors.set(tutorName, new Set());
          }
          
          const tutorSessionIds = subjectData.tutors.get(tutorName)!;
          tutorSessionIds.add(session.id);
        });

        // Get all questions for this student
        const questionsQuery = query(collection(db, 'questions'), where('createdBy', '==', userId));
        const questionsSnapshot = await getDocs(questionsQuery);
        const allQuestions = questionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Also get practice_items
        const practiceQuery = query(collection(db, 'practice_items'), where('studentId', '==', userId));
        const practiceSnapshot = await getDocs(practiceQuery);
        const practiceItems = practiceSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Get user_responses to check completion status for questions from 'questions' collection
        const userResponsesQuery = query(collection(db, 'user_responses'), where('studentId', '==', userId));
        const userResponsesSnapshot = await getDocs(userResponsesQuery);
        const userResponses = userResponsesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Create a map of completed question IDs from user_responses (for questions collection)
        const completedQuestionIds = new Set<string>();
        userResponses.forEach((response: { questionId?: string; isCorrect?: boolean; [key: string]: any }) => {
          if (response.questionId && response.isCorrect) {
            completedQuestionIds.add(response.questionId);
          }
        });

        // Create a map of completed question IDs from practice_items.responses
        const completedPracticeQuestionIds = new Map<string, boolean>(); // practiceItemId-questionId -> isCorrect
        practiceItems.forEach((pi: { id: string; responses?: Array<{ questionId?: string; isCorrect?: boolean; [key: string]: any }>; [key: string]: any }) => {
          if (pi.responses) {
            pi.responses.forEach((response: { questionId?: string; isCorrect?: boolean; [key: string]: any }) => {
              if (response.questionId && response.isCorrect) {
                const key = `${pi.id}-${response.questionId}`;
                completedPracticeQuestionIds.set(key, true);
              }
            });
          }
        });

        // Build the tree: Student -> Subject -> Tutor -> Difficulty (NO TOPICS!)
        for (const [subject, subjectData] of subjectMap.entries()) {
          const subjectNode: TreeNode = {
            id: `subject-${subject}`,
            type: 'subject',
            name: subject,
            parentId: 'student-root',
            children: []
          };

          for (const [tutorName, sessionIds] of subjectData.tutors.entries()) {
            const tutorNode: TreeNode = {
              id: `tutor-${subject}-${tutorName}`,
              type: 'tutor',
              name: tutorName,
              parentId: subjectNode.id,
              tutorName,
              sessionIds: Array.from(sessionIds),
              children: []
            };

            // Collect ALL questions for this tutor's sessions in this subject (no topic filtering!)
            const tutorQuestionsMap: Map<string, { id: string; text?: string; subject?: string; difficulty?: string; status?: string; [key: string]: any }> = new Map();
            const sessionIdsArray = Array.from(sessionIds);

            // Add questions from practice_items for this tutor's sessions
            practiceItems.forEach((pi: { id: string; sessionId?: string; questions?: Array<{ questionId?: string; id?: string; text?: string; difficulty?: string; [key: string]: any }>; responses?: Array<{ questionId?: string; isCorrect?: boolean; [key: string]: any }>; [key: string]: any }) => {
              if (sessionIdsArray.includes(pi.sessionId as string) && pi.questions) {
                pi.questions.forEach((q: { questionId?: string; id?: string; text?: string; difficulty?: string; [key: string]: any }) => {
                  const qId = q.questionId || q.id || `${pi.id}-q`;
                  if (!tutorQuestionsMap.has(qId)) {
                    // Check completion status from practice_items.responses
                    const responses = pi.responses || [];
                    const isCompleted = responses.some((r: { questionId?: string; isCorrect?: boolean; [key: string]: any }) => 
                      (r.questionId === q.questionId || r.questionId === q.id) && r.isCorrect === true
                    );
                    tutorQuestionsMap.set(qId, { ...q, id: qId, subject, status: isCompleted ? 'completed' : 'pending' });
                  }
                });
              }
            });

            // Add questions from 'questions' collection that match this subject
            allQuestions.forEach((q: { id?: string; questionId?: string; subject?: string; difficulty?: string; [key: string]: any }) => {
              if (q.subject === subject) {
                const qId = q.id || q.questionId;
                if (qId && !tutorQuestionsMap.has(qId)) {
                  // Check completion status from user_responses
                  const isCompleted = completedQuestionIds.has(qId);
                  tutorQuestionsMap.set(qId, { ...q, id: qId, status: isCompleted ? 'completed' : 'pending' });
                }
              }
            });

            const tutorQuestions = Array.from(tutorQuestionsMap.values());

            // Create difficulty nodes
            const difficulties: Array<'easy' | 'medium' | 'hard'> = ['easy', 'medium', 'hard'];
            difficulties.forEach(difficulty => {
              const diffQuestions = tutorQuestions.filter(q => q.difficulty === difficulty);
              const completedCount = diffQuestions.filter(q => q.status === 'completed').length;

              const diffNode: TreeNode = {
                id: `diff-${tutorNode.id}-${difficulty}`,
                type: 'difficulty',
                name: difficulty,
                parentId: tutorNode.id,
                difficultyLevel: difficulty,
                completed: completedCount,
                total: diffQuestions.length,
                questionIds: diffQuestions.map(q => q.id || q.questionId).filter((id): id is string => !!id)
              };

              if (diffQuestions.length > 0) {
                tutorNode.children!.push(diffNode);
              }
            });

            if (tutorNode.children!.length > 0) {
              subjectNode.children!.push(tutorNode);
            }
          }

          if (subjectNode.children!.length > 0) {
            root.children!.push(subjectNode);
          }
        }

        setTreeData(root);

        // Calculate subject progress for sidebar
        const progressList: SubjectProgress[] = [];
        root.children?.forEach(subjectNode => {
          let subjectCompleted = 0;
          let subjectTotal = 0;
          
          // Aggregate all questions across all tutors in this subject
          subjectNode.children?.forEach(tutorNode => {
            tutorNode.children?.forEach(diffNode => {
              subjectCompleted += diffNode.completed || 0;
              subjectTotal += diffNode.total || 0;
            });
          });

          if (subjectTotal > 0) {
            progressList.push({
              subject: subjectNode.name,
              completed: subjectCompleted,
              total: subjectTotal,
              percentage: Math.round((subjectCompleted / subjectTotal) * 100),
              isComplete: subjectCompleted === subjectTotal
            });
          }
        });

        setSubjectProgress(progressList);
      } catch {
        // Error handled silently
      } finally {
        setLoading(false);
      }
  }, [userId]);

  // Fetch and build tree from existing Firebase data
  useEffect(() => {
    buildTreeFromFirebase();
  }, [buildTreeFromFirebase]);

  // Render D3 tree
  useEffect(() => {
    if (!treeData || !svgRef.current) return;

    // Calculate number of subjects to determine spacing
    const subjectCount = treeData.children?.length || 1;
    const maxSubjects = Math.max(subjectCount, 10); // Plan for at least 10 subjects
    
    // Adaptive sizing based on number of subjects
    const baseWidth = 1600;
    const baseHeight = 1000;
    const width = Math.max(baseWidth, 200 * maxSubjects); // Scale width with subjects
    const height = Math.max(baseHeight, 200 * maxSubjects); // Scale height with subjects
    const radius = Math.min(width, height) / 2 - 30; // Subjects FAR from center/origin

    d3.select(svgRef.current).selectAll('*').remove();

    const root = d3.hierarchy(treeData);

    // Calculate adaptive separation based on number of siblings
    const calculateSeparation = (a: d3.HierarchyNode<TreeNode>, b: d3.HierarchyNode<TreeNode>) => {
      if (a.parent === b.parent) {
        // Count siblings at this level
        const siblings = a.parent?.children?.length || 1;
        // Adaptive spacing: more siblings = more space needed
        const baseSeparation = 200;
        const adaptiveSeparation = baseSeparation * (1 + siblings * 0.1); // Scale with siblings
        return adaptiveSeparation;
      }
      // Level separation scales with depth
      return 500 / a.depth;
    };

    const treeLayout = d3.tree<TreeNode>()
      .size([2 * Math.PI, radius])
      .separation(calculateSeparation);

    treeLayout(root);

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`) // Make responsive
      .attr('preserveAspectRatio', 'xMidYMid meet');

    const g = svg.append('g');

    // Fixed zoom behavior - follows mouse properly
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 5])
      .on('zoom', (event) => {
        // Apply transform directly - D3 handles mouse position automatically
        g.attr('transform', event.transform.toString());
      });

    // Set initial transform to center the tree
    const initialTransform = d3.zoomIdentity
      .translate(width / 2, height / 2)
      .scale(1);

    svg.call(zoom);
    svg.call(zoom.transform, initialTransform);

    // Draw links
    g.selectAll('.link')
      .data(root.links())
      .enter()
      .append('path')
      .attr('class', 'link')
      .attr('d', (d: d3.HierarchyLink<TreeNode>) => {
        const link = d3.linkRadial()
          .angle((node: any) => (node as d3.HierarchyPointNode<TreeNode>).x)
          .radius((node: any) => (node as d3.HierarchyPointNode<TreeNode>).y);
        return link(d as any);
      });

    // Draw nodes
    const nodes = g.selectAll('.node')
      .data(root.descendants())
      .enter()
      .append('g')
      .attr('class', 'node')
      .attr('transform', (d) => {
        const node = d as d3.HierarchyPointNode<TreeNode>;
        const angle = node.x - Math.PI / 2;
        return `translate(${node.y * Math.cos(angle)},${node.y * Math.sin(angle)})`;
      })
      .style('cursor', 'pointer')
      .on('click', async (event, d) => {
        const node = d as d3.HierarchyPointNode<TreeNode>;
        event.stopPropagation();
        if (node.data.type === 'difficulty') {
          // Get parent tutor and subject from tree FIRST
          const tutorNode = treeData?.children?.find(subj => 
            subj.children?.some(tut => 
              tut.children?.some(diff => diff.id === node.data.id)
            )
          )?.children?.find(tut => 
            tut.children?.some(diff => diff.id === node.data.id)
          );
          
          const subjectNode = treeData?.children?.find(subj => 
            subj.children?.some(tut => 
              tut.children?.some(diff => diff.id === node.data.id)
            )
          );

          if (!tutorNode || !subjectNode || !tutorNode.tutorName) {
            setQuestions([]);
            setSelectedNode(node.data);
            setShowQuestions(true);
            return;
          }

          const targetSubject = subjectNode.name;
          const targetTutorName = tutorNode.tutorName;
          const targetSessionIds = tutorNode.sessionIds || [];

          // Fetch actual questions - only for this specific tutor/subject combination
          const questionIds = node.data.questionIds || [];
          const fetchedQuestions: Question[] = [];

          // Get questions from 'questions' collection (deduplicate by text)
          const questionIdsSeen = new Set<string>();
          const questionTextsSeen = new Set<string>();
          
          for (const qId of questionIds) {
            if (questionIdsSeen.has(qId)) continue; // Skip duplicates
            try {
              const qDoc = await getDocs(query(collection(db, 'questions'), where('__name__', '==', qId)));
              if (!qDoc.empty) {
                questionIdsSeen.add(qId);
                const qData = qDoc.docs[0].data();
                const questionText = qData.text?.trim() || '';
                
                // Only include questions that match this subject
                if (qData.subject !== targetSubject) continue;
                
                // Skip if we've seen this exact question text before
                if (questionText && !questionTextsSeen.has(questionText)) {
                  questionTextsSeen.add(questionText);
                  
                  // Check if question is completed from user_responses
                  const userResponsesQuery = query(collection(db, 'user_responses'), 
                    where('studentId', '==', userId),
                    where('questionId', '==', qDoc.docs[0].id)
                  );
                  const userResponsesSnapshot = await getDocs(userResponsesQuery);
                  let isCompleted = false;
                  let submittedAnswer = '';
                  userResponsesSnapshot.docs.forEach(doc => {
                    const response = doc.data();
                    if (response.isCorrect === true) {
                      isCompleted = true;
                      submittedAnswer = response.studentAnswer || '';
                    }
                  });
                  
                  fetchedQuestions.push({
                    id: qDoc.docs[0].id,
                    text: questionText,
                    subject: targetSubject,
                    tutorName: targetTutorName,
                    difficulty: qData.difficulty,
                    status: isCompleted ? 'completed' : 'pending',
                    hint: qData.hint,
                    submittedAnswer: isCompleted ? submittedAnswer : undefined
                  });
                }
              }
            } catch {
              // Error handled silently
            }
          }

          // Get questions from practice_items - filter by tutor's sessionIds AND subject AND tutorName
          const practiceQuery = query(
            collection(db, 'practice_items'), 
            where('studentId', '==', userId),
            where('subject', '==', targetSubject),
            where('tutorName', '==', targetTutorName)
          );
          const practiceSnapshot = await getDocs(practiceQuery);
          practiceSnapshot.docs.forEach(doc => {
            const data = doc.data();
            // Also verify the sessionId matches one of the tutor's sessions
            if (data.sessionId && targetSessionIds.includes(data.sessionId) && data.questions) {
              data.questions.forEach((q: any, idx: number) => {
                if (q.difficulty === node.data.difficultyLevel) {
                  const qId = q.questionId || q.id || `${doc.id}-${idx}`;
                  const questionText = q.text?.trim() || '';
                  
                  // Skip if we've seen this question ID or text before
                  if (!questionIdsSeen.has(qId) && questionText && !questionTextsSeen.has(questionText)) {
                    questionIdsSeen.add(qId);
                    questionTextsSeen.add(questionText);
                    
                    // Check if question is completed from practice_items.responses
                    const responses = data.responses || [];
                    let isCompleted = false;
                    let submittedAnswer = '';
                    responses.forEach((r: { questionId?: string; isCorrect?: boolean; studentAnswer?: string; [key: string]: any }) => {
                      if ((r.questionId === q.questionId || r.questionId === q.id) && r.isCorrect === true) {
                        isCompleted = true;
                        submittedAnswer = r.studentAnswer || '';
                      }
                    });
                    
                    fetchedQuestions.push({
                      id: qId,
                      text: questionText,
                      subject: targetSubject,
                      tutorName: targetTutorName,
                      difficulty: q.difficulty,
                      status: isCompleted ? 'completed' : 'pending',
                      sessionId: data.sessionId,
                      practiceItemId: doc.id,
                      hint: q.hint,
                      submittedAnswer: isCompleted ? submittedAnswer : undefined
                    });
                  }
                }
              });
            }
          });

          setQuestions(fetchedQuestions);
          setSelectedNode(node.data);
          setShowQuestions(true);
        }
      });

    // Add circles (bigger sizes)
    nodes.append('circle')
      .attr('r', (d) => {
        const node = d as d3.HierarchyPointNode<TreeNode>;
        if (node.data.type === 'student') return 50;
        if (node.data.type === 'subject') return 40;
        if (node.data.type === 'tutor') return 30;
        return 20; // difficulty nodes
      })
      .attr('fill', (d) => {
        const node = d as d3.HierarchyPointNode<TreeNode>;
        if (node.data.type === 'student') return '#667eea';
        if (node.data.type === 'subject') return '#3B82F6';
        if (node.data.type === 'tutor') return '#10B981';
        if (node.data.type === 'difficulty') {
          // Show completion status with opacity
          const completionRatio = node.data.total && node.data.total > 0 
            ? (node.data.completed || 0) / node.data.total 
            : 0;
          const baseColor = node.data.difficultyLevel === 'easy' ? '#10B981' :
                           node.data.difficultyLevel === 'medium' ? '#FFA500' : '#F44336';
          // More completed = brighter, less completed = dimmer
          return completionRatio === 1 ? baseColor : 
                 completionRatio > 0.5 ? baseColor : 
                 baseColor + '80'; // Add transparency for low completion
        }
        return '#ddd';
      })
      .attr('stroke', '#F8FAFC')
      .attr('stroke-width', 2);

    // Add labels (adjusted for bigger circles)
    nodes.append('text')
      .attr('dy', (d) => {
        const node = d as d3.HierarchyPointNode<TreeNode>;
        if (node.data.type === 'student') return -60;
        if (node.data.type === 'subject') return -50;
        if (node.data.type === 'tutor') return -40;
        return -30;
      })
      .attr('text-anchor', 'middle')
      .attr('font-size', (d) => {
        const node = d as d3.HierarchyPointNode<TreeNode>;
        if (node.data.type === 'student') return '16px';
        if (node.data.type === 'subject') return '14px';
        if (node.data.type === 'tutor') return '12px';
        return '11px';
      })
      .attr('font-weight', (d) => {
        const node = d as d3.HierarchyPointNode<TreeNode>;
        return node.data.type === 'student' ? 'bold' : 'normal';
      })
      .text((d) => {
        const node = d as d3.HierarchyPointNode<TreeNode>;
        if (node.data.type === 'student') return node.data.name;
        if (node.data.type === 'subject') return node.data.name;
        if (node.data.type === 'tutor') return node.data.name;
        if (node.data.type === 'difficulty') {
          const completed = node.data.completed || 0;
          const total = node.data.total || 0;
          const checkmark = completed === total && total > 0 ? '✅ ' : '';
          return `${checkmark}${completed}/${total}`;
        }
        return '';
      });

  }, [treeData, userId]);

  const handleQuestionClick = (question: Question) => {
    // Show question detail in tree instead of navigating to practice
    setSelectedQuestion(question);
    setShowQuestionDetail(true);
    setShowQuestions(false); // Close questions list
    setAnswer(''); // Reset answer
    setShowHint(false); // Hide hint initially
    setFeedback(null); // Reset feedback
  };

  const handleGenerateQuestions = async () => {
    if (!selectedNode || selectedNode.type !== 'difficulty' || !selectedNode.difficultyLevel || isGenerating) return;

    // Get parent tutor and subject from tree
    const tutorNode = treeData?.children?.find(subj => 
      subj.children?.some(tut => 
        tut.children?.some(diff => diff.id === selectedNode.id)
      )
    )?.children?.find(tut => 
      tut.children?.some(diff => diff.id === selectedNode.id)
    );
    
    const subjectNode = treeData?.children?.find(subj => 
      subj.children?.some(tut => 
        tut.children?.some(diff => diff.id === selectedNode.id)
      )
    );

    if (!tutorNode || !subjectNode || !tutorNode.tutorName) {
      return;
    }

    setIsGenerating(true);

    try {
      const generateQuestionsFunction = httpsCallable(functions, 'generateQuestionsForTutor');
      const result = await generateQuestionsFunction({
        subject: subjectNode.name,
        tutorName: tutorNode.tutorName,
        difficulty: selectedNode.difficultyLevel,
        count: 3,
      });

      const data = result.data as {
        success: boolean;
        count: number;
        message: string;
      };

      if (data.success) {
        // Rebuild tree to show new questions
        setTimeout(() => {
          buildTreeFromFirebase();
          setShowQuestions(false); // Close modal
        }, 1000);
      }
    } catch {
      // Error handled silently
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmitAnswer = async () => {
    if (!selectedQuestion || !answer.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const evaluateAnswerFunction = httpsCallable(functions, 'evaluateAnswer');
      const result = await evaluateAnswerFunction({
        questionId: selectedQuestion.id,
        studentAnswer: answer.trim(),
        ...(selectedQuestion.practiceItemId && { practiceId: selectedQuestion.practiceItemId })
      });

      const data = result.data as {
        isCorrect: boolean;
        feedback: string;
        pointsAwarded: number;
        leveledUp?: boolean;
        newLevel?: number;
        newBadges?: Array<{ badgeId: string; emoji: string; name: string }>;
        dailyGoalComplete?: boolean;
        currentStreak?: number;
      };

      setFeedback({
        isCorrect: data.isCorrect,
        message: data.feedback,
        pointsAwarded: data.pointsAwarded,
      });

      // Update question status if correct
      if (data.isCorrect && selectedQuestion) {
        setSelectedQuestion({
          ...selectedQuestion,
          status: 'completed',
          submittedAnswer: answer.trim() // Store the submitted answer
        });
        // Rebuild tree to update completion status after a short delay
        setTimeout(() => {
          buildTreeFromFirebase();
        }, 1000);
      }
    } catch {
      setFeedback({
        isCorrect: false,
        message: 'Error submitting answer. Please try again.',
        pointsAwarded: 0,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="learning-tree">
        <header className="tree-header">
          <Navigation />
        </header>
        <main className="tree-main">
          <div className="tree-loading">
            <div className="spinner"></div>
            <p>Growing your learning tree...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="learning-tree">
      <header className="tree-header">
        <Navigation />
      </header>
      <main className="tree-main">
        <div className="tree-container">
          <div className="tree-content">
            <div className="tree-svg-container">
              <svg ref={svgRef} className="tree-svg"></svg>
            </div>
            <div className="tree-legend">
              <span><span className="legend-dot student"></span> Student</span>
              <span><span className="legend-dot subject"></span> Subject</span>
              <span><span className="legend-dot tutor"></span> Tutor</span>
              <span><span className="legend-dot easy"></span> Easy</span>
              <span><span className="legend-dot medium"></span> Medium</span>
              <span><span className="legend-dot hard"></span> Hard</span>
            </div>
          </div>

          {/* Progress Sidebar */}
          <div className="progress-sidebar">
            <div className="progress-header">
              <h3>🎯 Your Progress</h3>
              <p>Keep going! 🌟</p>
            </div>
            
            <div className="progress-list">
              {subjectProgress.map((subject, index) => (
                <div 
                  key={index} 
                  className={`progress-item ${subject.isComplete ? 'complete' : ''}`}
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className="progress-circle-container">
                    <svg className="progress-circle" width="80" height="80">
                      {/* Background circle */}
                      <circle
                        cx="40"
                        cy="40"
                        r="35"
                        fill="none"
                        stroke="rgba(59, 130, 246, 0.2)"
                        strokeWidth="6"
                      />
                      {/* Progress circle */}
                      <circle
                        cx="40"
                        cy="40"
                        r="35"
                        fill="none"
                        stroke={subject.isComplete ? '#10B981' : '#3B82F6'}
                        strokeWidth="6"
                        strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 35}`}
                        strokeDashoffset={`${2 * Math.PI * 35 * (1 - subject.percentage / 100)}`}
                        transform="rotate(-90 40 40)"
                        className="progress-ring"
                      />
                      {/* Center text */}
                      <text
                        x="40"
                        y="45"
                        textAnchor="middle"
                        fontSize="16"
                        fontWeight="bold"
                        fill={subject.isComplete ? '#10B981' : '#3B82F6'}
                      >
                        {subject.percentage}%
                      </text>
                    </svg>
                    {subject.isComplete && (
                      <div className="complete-badge">✨</div>
                    )}
                  </div>
                  
                  <div className="progress-info">
                    <div className="progress-topic-name">{subject.subject}</div>
                    <div className="progress-stats">
                      {subject.completed}/{subject.total} questions
                    </div>
                    {subject.isComplete && (
                      <div className="complete-message">
                        🎉 Amazing work!
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Suggestion for new subjects */}
            {subjectProgress.some(s => s.isComplete) && (
              <div className="new-subject-suggestion">
                <div className="suggestion-emoji">🚀</div>
                <div className="suggestion-text">
                  <strong>Ready for more?</strong>
                  <p>Try exploring new subjects!</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Question Detail Modal */}
      {showQuestionDetail && selectedQuestion && (
        <div className="question-detail-modal" onClick={() => setShowQuestionDetail(false)}>
          <div className="question-detail-content" onClick={(e) => e.stopPropagation()}>
            <div className="question-detail-header">
              <h2>Question Details</h2>
              <button className="close-modal-button" onClick={() => setShowQuestionDetail(false)}>×</button>
            </div>
            
            <div className="question-detail-body">
              <div className="question-detail-meta">
                <span className={`difficulty-badge ${selectedQuestion.difficulty}`}>
                  {selectedQuestion.difficulty}
                </span>
                <span className={`question-status ${selectedQuestion.status}`}>
                  {selectedQuestion.status === 'completed' ? '✅ Completed' : '⏳ Pending'}
                </span>
              </div>

              <div className="question-subject-tutor">
                <span>📚 {selectedQuestion.subject}</span>
                <span>👨‍🏫 {selectedQuestion.tutorName}</span>
              </div>
              
              <div className="question-detail-text">
                <h3>Question:</h3>
                <p>{selectedQuestion.text}</p>
              </div>

              {/* Show submitted answer if question is completed */}
              {selectedQuestion.status === 'completed' && selectedQuestion.submittedAnswer && (
                <div className="submitted-answer-section">
                  <h3>Your Answer:</h3>
                  <div className="submitted-answer-text">
                    {selectedQuestion.submittedAnswer}
                  </div>
                </div>
              )}

              {/* Answer input section - only show if not completed or if wrong */}
              {selectedQuestion.status !== 'completed' && !feedback?.isCorrect && (
                <div className="answer-section">
                  <label className="answer-label">Your Answer:</label>
                  <textarea
                    className="answer-input"
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder="Type your answer here..."
                    disabled={isSubmitting}
                    rows={6}
                  />

                  <div className="action-buttons">
                    {selectedQuestion.hint && (
                      <button 
                        className="hint-button"
                        onClick={() => setShowHint(!showHint)}
                      >
                        💡 {showHint ? 'Hide' : 'Show'} Hint
                      </button>
                    )}
                    <button
                      className="submit-button"
                      onClick={handleSubmitAnswer}
                      disabled={!answer.trim() || isSubmitting}
                    >
                      {isSubmitting ? '⏳ Submitting...' : 'Submit Answer'}
                    </button>
                  </div>

                  {showHint && selectedQuestion.hint && (
                    <div className="hint-box">
                      <strong>💡 Hint:</strong>
                      <p>{selectedQuestion.hint}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Feedback after submission */}
              {feedback && (
                <div className={`feedback-box ${feedback.isCorrect ? 'correct' : 'incorrect'}`}>
                  <div className="feedback-header">
                    {feedback.isCorrect ? '✅ Correct!' : '❌ Incorrect'}
                    {feedback.pointsAwarded > 0 && (
                      <span className="points-badge">+{feedback.pointsAwarded} points</span>
                    )}
                  </div>
                  <p className="feedback-message">{feedback.message}</p>
                  {feedback.isCorrect && (
                    <button 
                      className="close-button"
                      onClick={() => {
                        setShowQuestionDetail(false);
                        setFeedback(null);
                        setAnswer('');
                        // Refresh tree to show updated completion status
                        if (treeData) {
                          setTreeData({ ...treeData });
                        }
                      }}
                    >
                      Close
                    </button>
                  )}
                  {!feedback.isCorrect && (
                    <button 
                      className="try-again-button"
                      onClick={() => {
                        setFeedback(null);
                        setAnswer('');
                      }}
                    >
                      Try Again
                    </button>
                  )}
                </div>
              )}

              {/* Show hint if question is completed */}
              {selectedQuestion.status === 'completed' && selectedQuestion.hint && (
                <div className="question-hint">
                  <h3>💡 Hint:</h3>
                  <p>{selectedQuestion.hint}</p>
                </div>
              )}
              
               <div className="question-detail-actions">
                 <button 
                   className="close-button"
                   onClick={() => {
                     setShowQuestionDetail(false);
                     setAnswer('');
                     setShowHint(false);
                     setFeedback(null);
                   }}
                 >
                   Close
                 </button>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* Question List Modal */}
      {showQuestions && selectedNode && (
        <div className="question-modal" onClick={() => setShowQuestions(false)}>
          <div className="question-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="question-modal-header">
              <h2>
                <span className={`difficulty-badge ${selectedNode.difficultyLevel}`}>
                  {selectedNode.difficultyLevel}
                </span>
                Questions ({questions.length})
              </h2>
              <button className="close-modal-button" onClick={() => setShowQuestions(false)}>×</button>
            </div>
            
            {questions.length > 0 ? (
              <>
                <div className="questions-list">
                  {questions.map((question, index) => (
                    <div 
                      key={question.id}
                      className="question-item"
                      onClick={() => handleQuestionClick(question)}
                    >
                      <div className="question-item-header">
                        <span className="question-number">
                          Question {index + 1}
                        </span>
                        <span className={`question-status ${question.status}`}>
                          {question.status === 'completed' ? '✅ Completed' : '⏳ Pending'}
                        </span>
                      </div>
                      <div className="question-text">{question.text}</div>
                      <div className="question-meta">
                        <span>📚 {question.subject}</span>
                        <span>👨‍🏫 {question.tutorName}</span>
                        {question.hint && <span>💡 Hint available</span>}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="generate-questions-section">
                  <button
                    className="generate-questions-button"
                    onClick={handleGenerateQuestions}
                    disabled={isGenerating}
                  >
                    {isGenerating ? '✨ Generating...' : '✨ Generate More Questions'}
                  </button>
                </div>
              </>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">📝</div>
                <p>No questions found for this difficulty level yet.</p>
                <button
                  className="generate-questions-button"
                  onClick={handleGenerateQuestions}
                  disabled={isGenerating}
                >
                  {isGenerating ? '✨ Generating...' : '✨ Generate Questions'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default LearningTree;
