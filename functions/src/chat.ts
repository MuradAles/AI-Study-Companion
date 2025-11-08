/**
 * Chat Companion Functions
 * 
 * Handles chat conversations, practice question generation in chat,
 * and session-based cross-sell suggestions
 */

import * as admin from 'firebase-admin';
import { generateSingleQuestion } from './openai-handlers';
import { TranscriptAnalysis } from './openai-handlers';
import { callOpenAI, callOpenAIJSON } from './openai';

export interface ChatMessage {
  role: 'student' | 'assistant';
  content: string;
  timestamp: admin.firestore.Timestamp;
  practiceQuestion?: {
    questionId: string;
    questionText: string;
    topic: string;
    options: string[]; // 4 options (A, B, C, D)
    correctAnswer: string; // 'A', 'B', 'C', or 'D'
  };
  answer?: {
    studentAnswer: string;
    isCorrect: boolean;
    feedback: string;
  };
  suggestions?: {
    type: 'cross_sell' | 'new_subject';
    subjects: string[];
  };
}

export interface StudentContext {
  goals: Array<{
    goalId: string;
    subject: string;
    status: string;
  }>;
  recentSessions: Array<{
    id: string;
    subject: string;
    date: admin.firestore.Timestamp;
    tutorName?: string;
    transcript?: string;
    aiAnalysis?: TranscriptAnalysis;
  }>;
  practiceHistory: Array<{
    topic: string;
    answered: number;
    correct: number;
  }>;
}

/**
 * Load student context for chat
 * Can optionally filter by subject/topic if specified
 */
export async function loadStudentContext(studentId: string, subjectFilter?: string): Promise<StudentContext> {
  // Get student document
  const studentRef = admin.firestore().collection('students').doc(studentId);
  const studentDoc = await studentRef.get();
  
  if (!studentDoc.exists) {
    throw new Error(`Student ${studentId} not found`);
  }

  const studentData = studentDoc.data()!;
  const goals = studentData.goals || [];

  // Get recent sessions (last 10 for better filtering)
  let sessionsQuery = admin.firestore()
    .collection('sessions')
    .where('studentId', '==', studentId)
    .orderBy('date', 'desc')
    .limit(10);

  const sessionsSnapshot = await sessionsQuery.get();
  let allSessions = sessionsSnapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      subject: data.subject || '',
      date: data.date,
      tutorName: data.tutorName,
      transcript: data.transcript,
      aiAnalysis: data.aiAnalysis,
    };
  });

  // Filter by subject if specified
  if (subjectFilter) {
    const filterLower = subjectFilter.toLowerCase();
    allSessions = allSessions.filter(session => {
      const subject = session.subject.toLowerCase();
      const topics = session.aiAnalysis?.topicsCovered || [];
      const topicsMatch = topics.some((topic: string) => 
        topic.toLowerCase().includes(filterLower) || 
        filterLower.includes(topic.toLowerCase())
      );
      return subject.includes(filterLower) || topicsMatch;
    });
  }

  // Take top 5 matching sessions
  const recentSessions = allSessions.slice(0, 5);


  // Get practice history (topics and performance)
  const practiceQuery = await admin.firestore()
    .collection('practice_items')
    .where('studentId', '==', studentId)
    .get();

  const practiceHistory: Array<{ topic: string; answered: number; correct: number }> = [];
  const topicStats = new Map<string, { answered: number; correct: number }>();

  practiceQuery.docs.forEach(doc => {
    const data = doc.data();
    const responses = data.responses || [];
    
    responses.forEach((response: any) => {
      // Find the question to get its topic
      const questions = data.questions || [];
      const question = questions.find((q: any) => q.questionId === response.questionId);
      if (question && question.topic) {
        const topic = question.topic;
        if (!topicStats.has(topic)) {
          topicStats.set(topic, { answered: 0, correct: 0 });
        }
        const stats = topicStats.get(topic)!;
        stats.answered++;
        if (response.isCorrect) {
          stats.correct++;
        }
      }
    });
  });

  topicStats.forEach((stats, topic) => {
    practiceHistory.push({ topic, ...stats });
  });

  return {
    goals,
    recentSessions,
    practiceHistory,
  };
}

/**
 * Generate a multiple choice question for chat
 * Always generates new question with 4 options (A, B, C, D)
 */
export async function generateChatPracticeQuestion(
  studentId: string,
  topic?: string
): Promise<{
  questionId: string;
  questionText: string;
  topic: string;
  options: string[]; // 4 options
  correctAnswer: string; // 'A', 'B', 'C', or 'D'
}> {
  // Load student context to get recent sessions
  const context = await loadStudentContext(studentId);
  
  if (context.recentSessions.length === 0) {
    throw new Error('No sessions found for student');
  }

  // Find most recent session with AI analysis
  const sessionWithAnalysis = context.recentSessions.find(s => s.aiAnalysis);
  if (!sessionWithAnalysis || !sessionWithAnalysis.aiAnalysis) {
    throw new Error('No session analysis found');
  }

  const analysis = sessionWithAnalysis.aiAnalysis;
  const sessionContext = {
    tutorName: sessionWithAnalysis.tutorName || 'Your tutor',
    subject: sessionWithAnalysis.subject || 'Unknown',
    sessionDate: sessionWithAnalysis.date?.toDate().toISOString() || new Date().toISOString(),
  };

  // Determine topic to use
  const targetTopic = topic || analysis.topicsCovered?.[0] || 'general';
  
  // Generate question using OpenAI with multiple choice format
  const systemPrompt = `You are an expert tutor creating a multiple choice practice question for chat.
Generate 1 question with EXACTLY 4 options (A, B, C, D):
- Based on the session topic: ${targetTopic}
- Difficulty: medium
- Use RANDOM and UNIQUE numbers/scenarios
- Create a completely NEW scenario
- Make it engaging and relevant to what the student learned

Return JSON object with this exact format:
{
  "questionId": string,
  "text": string,
  "topic": string,
  "options": [string, string, string, string], // EXACTLY 4 options
  "correctAnswer": "A" | "B" | "C" | "D", // The correct option letter
  "hint": string
}`;

  const contextPrompt = `Session with ${sessionContext.tutorName} on ${sessionContext.sessionDate}:
Subject: ${sessionContext.subject}
Topic: ${targetTopic}

Session Analysis:
${JSON.stringify(analysis, null, 2)}

Generate 1 multiple choice question with 4 options:`;

  // Call OpenAI to generate question
  const response = await callOpenAIJSON<{
    questionId?: string;
    text: string;
    topic: string;
    options: string[];
    correctAnswer: 'A' | 'B' | 'C' | 'D';
    hint: string;
  }>(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: contextPrompt },
    ],
    {
      model: 'gpt-4o',
      temperature: 0.7,
    }
  );

  // Validate response has 4 options
  if (!response.options || response.options.length !== 4) {
    throw new Error('Question must have exactly 4 options');
  }

  if (!['A', 'B', 'C', 'D'].includes(response.correctAnswer)) {
    throw new Error('Correct answer must be A, B, C, or D');
  }

  return {
    questionId: response.questionId || `chat_q_${Date.now()}`,
    questionText: response.text,
    topic: response.topic || targetTopic,
    options: response.options,
    correctAnswer: response.correctAnswer,
  };
}

/**
 * Get session-based cross-sell suggestions
 * Analyzes student's session history to suggest related subjects
 */
export async function getSessionBasedSuggestions(studentId: string): Promise<string[]> {
  const context = await loadStudentContext(studentId);
  
  // Get unique subjects from sessions
  const subjects = new Set<string>();
  context.recentSessions.forEach(session => {
    if (session.subject) {
      subjects.add(session.subject);
    }
  });

  // Simple subject relationship mapping (can be enhanced with AI)
  const subjectRelations: Record<string, string[]> = {
    'Mathematics': ['Physics', 'Statistics', 'Computer Science'],
    'Math': ['Physics', 'Statistics', 'Computer Science'],
    'Science': ['Physics', 'Chemistry', 'Biology'],
    'Physics': ['Mathematics', 'Chemistry', 'Engineering'],
    'Chemistry': ['Biology', 'Physics', 'Medicine'],
    'Biology': ['Chemistry', 'Medicine', 'Environmental Science'],
    'English': ['Literature', 'Writing', 'Communication'],
    'SAT Math': ['College Essays', 'AP Calculus', 'SAT Reading'],
    'SAT Reading': ['College Essays', 'AP English', 'SAT Writing'],
    'College Essays': ['SAT Reading', 'AP English', 'Creative Writing'],
    'AP Calculus': ['AP Physics', 'Statistics', 'Computer Science'],
    'Statistics': ['Mathematics', 'Data Science', 'Economics'],
    'Computer Science': ['Mathematics', 'Statistics', 'Engineering'],
  };

  const suggestions = new Set<string>();
  
  // For each subject the student has studied, suggest related subjects
  subjects.forEach(subject => {
    const related = subjectRelations[subject] || [];
    related.forEach(relatedSubject => {
      // Don't suggest subjects student already has as goals
      const hasGoal = context.goals.some(g => g.subject === relatedSubject);
      if (!hasGoal) {
        suggestions.add(relatedSubject);
      }
    });
  });

  return Array.from(suggestions).slice(0, 3); // Return top 3 suggestions
}

/**
 * Generate chat response with context
 */
export async function generateChatResponse(
  studentId: string,
  message: string,
  conversationHistory: ChatMessage[]
): Promise<{
  response: string;
  practiceQuestion?: {
    questionId: string;
    questionText: string;
    topic: string;
    options: string[];
    correctAnswer: string;
  };
  suggestions?: {
    type: 'cross_sell' | 'new_subject';
    subjects: string[];
  };
}> {
  // Detect subject/topic from message for first message in conversation
  let subjectFilter: string | undefined;
  if (conversationHistory.length === 0) {
    // This is the first message - try to extract subject
    const subjectKeywords = [
      'geometry', 'algebra', 'calculus', 'trigonometry', 'statistics',
      'physics', 'chemistry', 'biology',
      'SAT', 'ACT', 'reading', 'writing', 'essay',
      'math', 'science', 'english', 'literature'
    ];
    
    const messageLower = message.toLowerCase();
    const foundSubject = subjectKeywords.find(keyword => 
      messageLower.includes(keyword.toLowerCase())
    );
    
    if (foundSubject) {
      subjectFilter = foundSubject;
      console.log(`Detected subject filter: ${subjectFilter}`);
    }
  }

  const context = await loadStudentContext(studentId, subjectFilter);
  
  // Detect intent: does student want to practice/solve something?
  const practiceKeywords = ['practice', 'solve', 'example', 'question', 'problem', 'try', 'test'];
  const wantsPractice = practiceKeywords.some(keyword => 
    message.toLowerCase().includes(keyword)
  );

  // Build detailed context string for AI
  const recentSessionsText = context.recentSessions
    .slice(0, 3)
    .map(s => {
      const date = s.date?.toDate().toLocaleDateString() || 'recently';
      const tutorName = s.tutorName || 'a tutor';
      const topics = s.aiAnalysis?.topicsCovered?.join(', ') || 'various topics';
      const weakAreas = s.aiAnalysis?.studentStruggles?.join(', ') || 'none identified';
      const strengths = s.aiAnalysis?.studentStrengths?.join(', ') || 'none identified';
      
      return `- ${s.subject} session with ${tutorName} on ${date}:
  Topics covered: ${topics}
  Student struggled with: ${weakAreas}
  Student strengths: ${strengths}`;
    })
    .join('\n\n');

  const goalsText = context.goals
    .map(g => `- ${g.subject} (${g.status})`)
    .join('\n');

  const systemPrompt = `You are a knowledgeable tutor helping a student learn.

HOW TO RESPOND:
- Answer their questions directly and clearly
- Explain concepts in simple, understandable terms
- Use examples to illustrate points
- Be conversational and helpful
- Don't repeat "in your recent session" or "you learned this" - just teach!
- Don't say "you're doing great" or "keep it up" unless they accomplish something
- Only mention the tutor's name if it's genuinely relevant to the explanation

You have context about their recent learning:
${recentSessionsText}

${goalsText ? `Learning goals:\n${goalsText}` : ''}

${wantsPractice ? '\nThe student wants to practice. After explaining, generate a practice question.' : ''}

Just be a helpful, clear teacher. Answer their questions directly.`;

  const userPrompt = `Student message: "${message}"

${wantsPractice ? 'Generate a helpful response, then create a practice question based on their session topics.' : 'Provide a helpful clarification or explanation.'}`;

  // Call OpenAI for response
  const aiResponse = await callOpenAI(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    {
      model: 'gpt-4o',
      temperature: 0.7,
    }
  );

  let practiceQuestion;
  if (wantsPractice) {
    try {
      // Extract topic from message if mentioned
      const topicMatch = message.match(/(?:from|about|on)\s+(\w+)/i);
      const topic = topicMatch ? topicMatch[1] : undefined;
      
      practiceQuestion = await generateChatPracticeQuestion(studentId, topic);
    } catch (error) {
      console.error('Error generating practice question:', error);
      // Continue without question if generation fails
    }
  }

  // Check if we should show cross-sell suggestions
  // Show after 3 questions answered in conversation
  const questionsAnswered = conversationHistory.filter(m => m.answer).length;
  let suggestions;
  if (questionsAnswered >= 3) {
    try {
      const suggestedSubjects = await getSessionBasedSuggestions(studentId);
      if (suggestedSubjects.length > 0) {
        suggestions = {
          type: 'new_subject' as const,
          subjects: suggestedSubjects,
        };
      }
    } catch (error) {
      console.error('Error getting suggestions:', error);
    }
  }

  return {
    response: aiResponse,
    practiceQuestion,
    suggestions,
  };
}

