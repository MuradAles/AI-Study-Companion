// OpenAI API Response Handlers
// Handles parsing and processing of OpenAI API responses

import { callOpenAI, callOpenAIJSON } from './openai';
import { create, all } from 'mathjs';

// Create a mathjs instance with all functions
const math = create(all);

export interface TranscriptAnalysis {
  topicsCovered: string[];
  studentStruggles: string[];
  studentStrengths: string[];
  keyMoments: Array<{
    timestamp: string;
    type: 'confusion' | 'breakthrough' | 'question' | 'explanation';
    note: string;
  }>;
  confidenceLevel: number; // 1-10 scale
  suggestedTopics: string[];
  processedAt?: string; // ISO timestamp when processed
}

export interface PracticeQuestion {
  questionId: string;
  text: string;
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard';
  hint: string;
  correctAnswer: string;
  pointsValue: number;
  passage?: string; // Optional passage text for reading comprehension questions
}

export interface AnswerEvaluation {
  isCorrect: boolean;
  feedback: string;
  partialCredit?: number; // 0-1 scale
}

/**
 * Analyze a tutoring session transcript
 */
export async function analyzeTranscript(transcript: string): Promise<TranscriptAnalysis> {
  const systemPrompt = `You are an expert tutor analyzer. Analyze tutoring session transcripts and extract:
1. Topics covered
2. Student struggles and confusion points
3. Student strengths and breakthroughs
4. Key moments with timestamps
5. Overall confidence level (1-10)
6. Suggested follow-up topics

Return JSON format with these exact fields:
{
  "topicsCovered": string[],
  "studentStruggles": string[],
  "studentStrengths": string[],
  "keyMoments": [{"timestamp": string, "type": "confusion"|"breakthrough"|"question"|"explanation", "note": string}],
  "confidenceLevel": number,
  "suggestedTopics": string[]
}`;

  const response = await callOpenAIJSON<TranscriptAnalysis>(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Analyze this tutoring session:\n\n${transcript}` },
    ],
    {
      model: 'gpt-4o',
      temperature: 0.3,
    }
  );

  return response;
}

/**
 * Generate practice questions based on transcript analysis
 */
export async function generatePracticeQuestions(analysis: TranscriptAnalysis, sessionContext: {
  tutorName: string;
  subject: string;
  sessionDate: string;
}): Promise<PracticeQuestion[]> {
  const isReadingSubject = sessionContext.subject.toLowerCase().includes('reading') || 
                           sessionContext.subject.toLowerCase().includes('sat reading');
  
  const systemPrompt = `You are an expert tutor creating practice questions. Based on session analysis, generate 3 personalized practice questions:
- Target student's weak areas
- Build on their strengths
- Appropriate difficulty level
- Include helpful hints referencing the session
- **CRITICAL**: Use DIFFERENT random numbers in each question. Never repeat the same numbers.
- **CRITICAL**: For math questions, use VARIED scenarios (different objects, measurements, real-world contexts)
- Questions should test conceptual understanding, not memorization
${isReadingSubject ? '- For reading comprehension questions, you MUST include a passage field with the full passage text (200-400 words)' : ''}

Return JSON object with this exact format:
{
  "questions": [
    {
      "questionId": string,
      "text": string,
      "topic": string,
      "difficulty": "easy"|"medium"|"hard",
      "hint": string,
      "correctAnswer": string,
      "pointsValue": number${isReadingSubject ? ',\n      "passage": string' : ''}
    }
  ]
}`;

  const contextPrompt = `Session with ${sessionContext.tutorName} on ${sessionContext.sessionDate}:
Subject: ${sessionContext.subject}
${isReadingSubject ? '\nIMPORTANT: This is a reading comprehension subject. Generate questions that require reading a passage. Include a "passage" field with a complete passage (200-400 words) relevant to the topics discussed in the session.\n' : ''}

Analysis:
${JSON.stringify(analysis, null, 2)}

Generate 3 practice questions:`;

  const response = await callOpenAIJSON<{ questions: PracticeQuestion[] } | PracticeQuestion[]>(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: contextPrompt },
    ],
    {
      model: 'gpt-4o',
      temperature: 0.7,
    }
  );

  // Handle both array and object formats
  const questions = Array.isArray(response) ? response : ('questions' in response ? response.questions : []);
  
  // Add questionIds if not present
  return questions.map((q, idx) => ({
    ...q,
    questionId: q.questionId || `q_${Date.now()}_${idx}`,
  }));
}

/**
 * Generate a single practice question (for regeneration)
 */
export async function generateSingleQuestion(
  analysis: TranscriptAnalysis,
  sessionContext: {
    tutorName: string;
    subject: string;
    sessionDate: string;
  },
  difficulty: 'easy' | 'medium' | 'hard'
): Promise<PracticeQuestion> {
  const isReadingSubject = sessionContext.subject.toLowerCase().includes('reading') || 
                           sessionContext.subject.toLowerCase().includes('sat reading');
  
  const systemPrompt = `You are an expert tutor creating a practice question. Generate 1 personalized practice question:
- Target student's weak areas
- Build on their strengths
- Difficulty level: ${difficulty}
- Include helpful hints referencing the session
- **IMPORTANT**: Use RANDOM and UNIQUE numbers. Never reuse numbers from previous questions.
- **IMPORTANT**: Create a completely NEW scenario, don't repeat patterns
- For math questions, use real-world contexts that vary (different objects, measurements, scenarios)
${isReadingSubject ? '- For reading comprehension questions, you MUST include a passage field with the full passage text (200-400 words)' : ''}

Return JSON object with this exact format:
{
  "questionId": string,
  "text": string,
  "topic": string,
  "difficulty": "${difficulty}",
  "hint": string,
  "correctAnswer": string,
  "pointsValue": number${isReadingSubject ? ',\n  "passage": string' : ''}
}`;

  const contextPrompt = `Session with ${sessionContext.tutorName} on ${sessionContext.sessionDate}:
Subject: ${sessionContext.subject}
Difficulty: ${difficulty}
${isReadingSubject ? '\nIMPORTANT: This is a reading comprehension subject. Generate a question that requires reading a passage. Include a "passage" field with a complete passage (200-400 words) relevant to the topics discussed in the session.\n' : ''}

Analysis:
${JSON.stringify(analysis, null, 2)}

Generate 1 practice question:`;

  const response = await callOpenAIJSON<PracticeQuestion | { question: PracticeQuestion }>(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: contextPrompt },
    ],
    {
      model: 'gpt-4o',
      temperature: 0.7,
    }
  );

  // Handle both object and direct question formats
  const question = 'question' in response ? response.question : response;
  
  return {
    ...question,
    questionId: question.questionId || `q_${Date.now()}_regenerated`,
    difficulty: difficulty,
  };
}

/**
 * Evaluate a mathematical expression using mathjs
 * Handles expressions like "5√3", "5*sqrt(3)", "8.66", etc.
 */
function evaluateMathExpression(expr: string): number | null {
  try {
    // Clean the expression
    let cleaned = expr.trim();
    
    // Replace common mathematical symbols
    cleaned = cleaned
      .replace(/√/g, 'sqrt') // Replace √ with sqrt
      .replace(/\^/g, '**') // Replace ^ with **
      .replace(/×/g, '*') // Replace × with *
      .replace(/÷/g, '/'); // Replace ÷ with /
    
    // Remove units and text (e.g., "5 kg" -> "5", "mass = 5" -> "5")
    cleaned = cleaned.replace(/[a-zA-Z=:]+/g, '').trim();
    
    // Try to evaluate the expression
    const result = math.evaluate(cleaned);
    
    // Ensure it's a number
    if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
      return result;
    }
    
    return null;
  } catch (error) {
    // If evaluation fails, return null
    return null;
  }
}

/**
 * Extract x and y values from an answer string
 * Handles formats like:
 * - "x=3.6, y=1.6"
 * - "x=3.6 and y=1.6"
 * - "(3.6, 1.6)"
 * - "x = 18/5, y = 8/5"
 */
function extractSystemOfEquationsValues(answer: string): { x: number | null; y: number | null } {
  const result = { x: null as number | null, y: null as number | null };
  
  // Try to match x=value and y=value patterns
  const xMatch = answer.match(/x\s*[=:]\s*([\d./]+|[\d.]+)/i);
  const yMatch = answer.match(/y\s*[=:]\s*([\d./]+|[\d.]+)/i);
  
  if (xMatch) {
    const xValue = evaluateMathExpression(xMatch[1]) ?? parseFloat(xMatch[1]);
    if (!isNaN(xValue) && isFinite(xValue)) {
      result.x = xValue;
    }
  }
  
  if (yMatch) {
    const yValue = evaluateMathExpression(yMatch[1]) ?? parseFloat(yMatch[1]);
    if (!isNaN(yValue) && isFinite(yValue)) {
      result.y = yValue;
    }
  }
  
  // Try to match (x, y) format
  if (result.x === null || result.y === null) {
    const tupleMatch = answer.match(/\(?\s*([\d./]+|[\d.]+)\s*[,;]\s*([\d./]+|[\d.]+)\s*\)?/);
    if (tupleMatch) {
      const xValue = evaluateMathExpression(tupleMatch[1]) ?? parseFloat(tupleMatch[1]);
      const yValue = evaluateMathExpression(tupleMatch[2]) ?? parseFloat(tupleMatch[2]);
      if (!isNaN(xValue) && isFinite(xValue) && !isNaN(yValue) && isFinite(yValue)) {
        if (result.x === null) result.x = xValue;
        if (result.y === null) result.y = yValue;
      }
    }
  }
  
  return result;
}

/**
 * Check if two answers are mathematically equivalent
 * Handles cases like "5√3" vs "8.66", "5kg" vs "5000g", etc.
 * Also handles systems of equations like "x=3.6, y=1.6" vs "x=18/5, y=8/5"
 */
function areMathematicallyEquivalent(correctAnswer: string, studentAnswer: string, tolerance: number = 0.1): boolean {
  // First, check if this is a system of equations (has x and y)
  const correctSystem = extractSystemOfEquationsValues(correctAnswer);
  const studentSystem = extractSystemOfEquationsValues(studentAnswer);
  
  // If both have x and y values, compare them separately
  if (correctSystem.x !== null && correctSystem.y !== null && 
      studentSystem.x !== null && studentSystem.y !== null) {
    const xMatch = Math.abs(correctSystem.x - studentSystem.x) < tolerance;
    const yMatch = Math.abs(correctSystem.y - studentSystem.y) < tolerance;
    return xMatch && yMatch;
  }
  
  // If only one has system values, try single value comparison
  if ((correctSystem.x !== null || correctSystem.y !== null) && 
      (studentSystem.x !== null || studentSystem.y !== null)) {
    // Compare x if both have it
    if (correctSystem.x !== null && studentSystem.x !== null) {
      const xMatch = Math.abs(correctSystem.x - studentSystem.x) < tolerance;
      if (!xMatch) return false;
    }
    // Compare y if both have it
    if (correctSystem.y !== null && studentSystem.y !== null) {
      const yMatch = Math.abs(correctSystem.y - studentSystem.y) < tolerance;
      if (!yMatch) return false;
    }
    // If we got here and at least one matched, return true
    if ((correctSystem.x !== null && studentSystem.x !== null) || 
        (correctSystem.y !== null && studentSystem.y !== null)) {
      return true;
    }
  }
  
  // Fallback to single value comparison
  // First, try to extract numeric values
  const correctNum = parseFloat(correctAnswer.trim());
  const studentNum = parseFloat(studentAnswer.trim());
  
  // If both are simple numbers, compare directly
  if (!isNaN(correctNum) && !isNaN(studentNum)) {
    return Math.abs(correctNum - studentNum) < tolerance;
  }
  
  // Try to evaluate as mathematical expressions
  const correctValue = evaluateMathExpression(correctAnswer);
  const studentValue = evaluateMathExpression(studentAnswer);
  
  if (correctValue !== null && studentValue !== null) {
    return Math.abs(correctValue - studentValue) < tolerance;
  }
  
  // If one is a number and the other is an expression, try to evaluate
  if (!isNaN(correctNum) && studentValue !== null) {
    return Math.abs(correctNum - studentValue) < tolerance;
  }
  
  if (!isNaN(studentNum) && correctValue !== null) {
    return Math.abs(studentNum - correctValue) < tolerance;
  }
  
  // Try to handle units (mass, length, etc.)
  // For mass: kg, g, mg, etc.
  const massUnits: { [key: string]: number } = {
    'kg': 1000,
    'g': 1,
    'mg': 0.001,
    'lb': 453.592,
    'oz': 28.3495,
  };
  
  // Extract numeric value and unit from both answers
  // Handles formats like "5 kg", "5kg", "mass = 5 kg", etc.
  const extractValueAndUnit = (str: string): { value: number | null; unit: string | null } => {
    // Try to match number followed by unit (with or without space)
    const match = str.match(/([\d.]+)\s*([a-zA-Z]+)/);
    if (match) {
      const value = parseFloat(match[1]);
      const unit = match[2].toLowerCase();
      if (!isNaN(value)) {
        return { value, unit };
      }
    }
    
    // Try to extract just the number (may have unit before or after)
    const numMatch = str.match(/([a-zA-Z]+\s*)?([\d.]+)(\s*[a-zA-Z]+)?/);
    if (numMatch && numMatch[2]) {
      const value = parseFloat(numMatch[2]);
      const unit = (numMatch[1] || numMatch[3] || '').trim().toLowerCase();
      if (!isNaN(value)) {
        return { value, unit: unit || null };
      }
    }
    
    // Fallback: try to extract just the number
    const fallbackMatch = str.match(/[\d.]+/);
    if (fallbackMatch) {
      return { value: parseFloat(fallbackMatch[0]), unit: null };
    }
    
    return { value: null, unit: null };
  };
  
  const correct = extractValueAndUnit(correctAnswer);
  const student = extractValueAndUnit(studentAnswer);
  
  if (correct.value !== null && student.value !== null) {
    // Convert to base unit (grams) if both have mass units
    let correctBase = correct.value;
    let studentBase = student.value;
    
    if (correct.unit && massUnits[correct.unit]) {
      correctBase = correct.value * massUnits[correct.unit];
    }
    if (student.unit && massUnits[student.unit]) {
      studentBase = student.value * massUnits[student.unit];
    }
    
    // If units were converted, compare in base units
    if (correct.unit && massUnits[correct.unit] || student.unit && massUnits[student.unit]) {
      return Math.abs(correctBase - studentBase) < tolerance;
    }
    
    // Otherwise, compare directly
    return Math.abs(correct.value - student.value) < tolerance;
  }
  
  return false;
}

/**
 * Evaluate a student's answer
 */
export async function evaluateAnswer(
  question: PracticeQuestion,
  studentAnswer: string
): Promise<AnswerEvaluation> {
  const systemPrompt = `You are an encouraging tutor evaluating student answers. Be supportive but accurate. 

IMPORTANT FOR MATHEMATICAL ANSWERS:
- Accept equivalent forms (e.g., 8.66 ≈ 5√3, 5*sqrt(3), 5√3, etc.)
- Accept decimal approximations of exact values (e.g., 8.66 for 5√3 ≈ 8.66)
- Accept answers in different formats (fractions, decimals, expressions)
- Consider answers correct if they are mathematically equivalent, even if formatted differently
- For numerical answers, allow small rounding differences (within 0.1)

CRITICAL FOR SYSTEMS OF EQUATIONS:
- Accept answers in ANY format: "x=3.6, y=1.6", "x=3.6 and y=1.6", "(3.6, 1.6)", "x=18/5, y=8/5", etc.
- Accept decimal equivalents (e.g., x=3.6 is equivalent to x=18/5)
- Compare x and y values separately - both must match (within 0.1 tolerance)
- If student provides "x=3.6 and y=1.6" and correct answer is "x=18/5, y=8/5", mark as CORRECT
- Order doesn't matter: "x=3.6, y=1.6" is same as "y=1.6, x=3.6"

Return a JSON object with these exact fields:
{
  "isCorrect": boolean,
  "feedback": string (1-2 sentences),
  "partialCredit": number (0-1, optional, only if partially correct)
}

IMPORTANT: Return ONLY valid JSON. Do not include any markdown formatting or explanatory text.`;

  const questionContext = question.passage 
    ? `Passage:\n${question.passage}\n\nQuestion: ${question.text}\nCorrect Answer: ${question.correctAnswer}\nStudent Answer: ${studentAnswer}\n\nEvaluate if the student's answer is mathematically equivalent to the correct answer, even if formatted differently. For systems of equations, compare x and y values separately - accept any format ("x=3.6, y=1.6", "x=3.6 and y=1.6", "(3.6, 1.6)", etc.).`
    : `Question: ${question.text}\nCorrect Answer: ${question.correctAnswer}\nStudent Answer: ${studentAnswer}\n\nEvaluate if the student's answer is mathematically equivalent to the correct answer, even if formatted differently. For mathematical expressions, accept equivalent forms (e.g., 8.66 ≈ 5√3, decimals for exact values, etc.). For systems of equations, compare x and y values separately and accept any format ("x=3.6, y=1.6", "x=3.6 and y=1.6", "(3.6, 1.6)", etc.).`;

  try {
    const response = await callOpenAIJSON<AnswerEvaluation>(
      [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: questionContext,
        },
      ],
      {
        model: 'gpt-4o',
        temperature: 0.5,
      }
    );

    // Ensure required fields exist
    if (typeof response.isCorrect !== 'boolean' || !response.feedback) {
      throw new Error('Invalid response format from OpenAI');
    }

    // Additional validation for mathematical answers using mathjs
    // This is especially important for problems involving mass, geometry, systems of equations, etc.
    // Check BEFORE AI evaluation to ensure mathematical correctness
    if (question.correctAnswer && studentAnswer) {
      const isMathEquivalent = areMathematicallyEquivalent(
        question.correctAnswer,
        studentAnswer,
        0.1 // Allow 0.1 tolerance for rounding
      );
      
      // If math.js says it's equivalent, override AI decision and mark as correct
      if (isMathEquivalent && !response.isCorrect) {
        // The AI might have missed an equivalent answer
        // Use mathjs to validate and override the AI's decision
        return {
          isCorrect: true,
          feedback: 'Correct! Your answer is mathematically equivalent. Great job!',
          partialCredit: response.partialCredit,
        };
      } else if (isMathEquivalent && response.isCorrect) {
        // Both agree it's correct, but enhance feedback if needed
        return {
          isCorrect: true,
          feedback: response.feedback || 'Correct! Your answer is mathematically equivalent.',
          partialCredit: response.partialCredit,
        };
      } else if (!isMathEquivalent && response.isCorrect) {
        // Double-check: if math says it's not equivalent but AI says it is, trust math
        // This is rare but can happen with edge cases
        return {
          isCorrect: false,
          feedback: `Not quite. The correct answer is: ${question.correctAnswer}. Keep practicing!`,
        };
      }
    }

    return {
      isCorrect: response.isCorrect,
      feedback: response.feedback,
      partialCredit: response.partialCredit,
    };
  } catch (error) {
    
    // Fallback: use mathematical validation with mathjs
    try {
      const isMathEquivalent = areMathematicallyEquivalent(
        question.correctAnswer,
        studentAnswer,
        0.1
      );
      
      if (isMathEquivalent) {
        return {
          isCorrect: true,
          feedback: 'Correct! Your answer is mathematically equivalent.',
        };
      }
      } catch (mathError) {
        // Error handled silently
    }
    
    // Final fallback: exact string match (case-insensitive)
    const correctLower = question.correctAnswer.toLowerCase().trim();
    const studentLower = studentAnswer.toLowerCase().trim();
    const isCorrect = studentLower === correctLower;
    
    return {
      isCorrect,
      feedback: isCorrect 
        ? 'Correct! Great job!' 
        : `Not quite. The correct answer is: ${question.correctAnswer}. Keep practicing!`,
    };
  }
}

/**
 * Generate similar questions based on an example
 */
export async function generateSimilarQuestionsAI(params: {
  subject: string;
  topics: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  exampleQuestion: string;
  count: number;
}): Promise<PracticeQuestion[]> {
  const { subject, topics, difficulty, exampleQuestion, count } = params;

  const prompt = `Generate ${count} practice questions similar to the example below.

Subject: ${subject}
Topics: ${topics.join(', ')}
Difficulty: ${difficulty}

Example Question: "${exampleQuestion}"

Generate ${count} NEW questions that:
1. Cover the same subject and topics
2. Have the same difficulty level
3. Are DIFFERENT from the example but similar in style
4. Are clear and well-formulated

Return ONLY a valid JSON array of ${count} questions with this structure:
[
  {
    "questionId": "unique-id",
    "text": "question text",
    "correctAnswer": "answer",
    "difficulty": "${difficulty}",
    "topic": "${topics[0] || subject}",
    "hint": "helpful hint",
    "explanation": "why this answer is correct"
  }
]

NO additional text, ONLY the JSON array.`;

  const response = await callOpenAI(
    [
      {
        role: 'system',
        content: 'You are an expert educator who creates high-quality practice questions. Return only valid JSON arrays.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    {
      model: 'gpt-4o',
      temperature: 0.8, // Higher for more variety
      maxTokens: 1500,
    }
  );

  // Parse the response
  try {
    // Remove markdown code blocks if present
    let cleanedResponse = response.trim();
    if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    }

    const questions = JSON.parse(cleanedResponse);
    
    if (!Array.isArray(questions)) {
      throw new Error('Response is not an array');
    }

    // Add unique IDs and validate
    return questions.map((q, index) => ({
      questionId: `gen-${Date.now()}-${index}`,
      text: q.text || q.question || '',
      correctAnswer: q.correctAnswer || q.answer || '',
      difficulty: difficulty,
      topic: topics[0] || subject,
      hint: q.hint || '',
      explanation: q.explanation || '',
      pointsValue: difficulty === 'easy' ? 5 : difficulty === 'medium' ? 10 : 15,
    }));
  } catch (parseError) {
    throw new Error('Failed to parse AI response for similar questions');
  }
}

