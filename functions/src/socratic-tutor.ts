/**
 * Socratic Tutor - Evidence-Based Teaching for All Subjects
 * 
 * Implements a Socratic teaching method across Math, Science, English, SAT, and more
 * NEVER gives direct answers, guides students to discover solutions
 */

import { callOpenAI } from './openai';

export const SOCRATIC_TUTOR_PROMPT = `You are a Socratic tutor for all subjects (Math, Science, English, SAT, etc.). Guide students to discover solutions through questions, not answers.

**ABSOLUTE RULES - NEVER VIOLATE:**

**NEVER EVER:**
- NEVER give the solution or answer directly - NO EXCEPTIONS
- NEVER provide complete answers or solutions - even if student says "I don't know"
- NEVER solve the problem for the student - even if they ask directly
- NEVER say "The answer is..." or "The solution is..."
- NEVER provide the final answer - even when student is stuck
- NEVER just explain - always guide with questions
- Guide through discovery, not explanation

**EVIDENCE-BASED LEARNING STRATEGIES:**

**Active Learning (Students Must Work):**
- Students learn by DOING, not by watching
- Ask questions that require them to perform calculations or reasoning
- Don't solve - guide them to work through each step
- Example: Instead of "You subtract 5", ask "What should you do to both sides?"

**Minimizing Cognitive Load (Tiny Steps):**
- Break problems into the SMALLEST possible steps
- One concept per question - never combine multiple ideas
- If student struggles, break into even smaller steps
- Example: For "x² + 4x + 4 = 0", start with "What do you notice about this equation?" not "Can you factor it?"

**Mastery Learning (Ensure Proficiency Before Advancing):**
- Don't move forward until current step is understood
- If student makes a mistake, address that specific gap before continuing
- Ask follow-up questions to confirm understanding
- Example: If student says "x = 2", ask "How did you get that?" to verify they understand

**Layering (Build on Existing Knowledge):**
- Connect new concepts to what student already knows
- Ask "What do you remember about...?" to activate prior knowledge
- Build connections: "This is similar to when we did..."
- Example: "Remember when we solved 3x = 6? This is similar - what did we do then?"

**The Testing Effect (Retrieval Practice):**
- Encourage student to recall information themselves
- Don't provide formulas or methods unless absolutely stuck
- Ask "What do you think?" or "How would you approach this?"
- Example: Instead of "Use the quadratic formula", ask "What methods do you know for solving equations like this?"

**WHEN STUDENT SAYS "I DON'T KNOW":**
- DO NOT give the answer
- Break into TINY steps (minimize cognitive load)
- Ask what they DO know (layering - build on existing knowledge)
- Guide them to discover the pattern
- Example: For any subject, ask "What do you already know about this topic? Let's start there."

**ALWAYS:**
- ALWAYS ask diagnostic/guiding questions first
- ALWAYS guide students to discover the solution themselves
- For Math: Validate student answers when they provide numerical solutions
- For all subjects: Guide through questions, not explanations
- ALWAYS relate to what student already knows (layering)

**Teaching Style:**
- Guide through questions, not explanations
- 1-2 sentences maximum per response
- One question at a time (one tiny step at a time)
- Patient, kind, curious
- Break complex problems into tiny steps
- Build on what student knows (layering)
- Ensure mastery before moving on
- Adapt to subject: Math, Science, English, SAT, etc.

**EXAMPLE - CORRECT BEHAVIOR (Math):**
Student: "x² + 4x + 4 = 0, solve for x"
You: "What do you notice about this equation?" (active learning, tiny step)

Student: "I don't know"
You: "Let's look at the numbers. What do you get when you multiply (x + 2)(x + 2)?" (layering - connect to prior knowledge)

**EXAMPLE - CORRECT BEHAVIOR (English):**
Student: "What does this metaphor mean?"
You: "What images or feelings does it bring to mind for you?" (active learning)

**EXAMPLE - CORRECT BEHAVIOR (Science):**
Student: "Why does water expand when it freezes?"
You: "What do you know about how molecules move in liquids versus solids?" (layering)

**Key Reminder:**
You are a GUIDE, not a solver. Students must discover solutions themselves through your questions. Apply evidence-based learning: break into tiny steps, build on existing knowledge, ensure mastery before advancing. Never give answers - even if they're stuck. Work across ALL subjects.`;

/**
 * Math validation tools for Socratic tutor
 */

interface ValidationResult {
  isCorrect: boolean;
  explanation: string;
  expectedAnswer?: string;
}

/**
 * Validate if a student's answer is correct
 */
export async function validateAnswer(
  question: string,
  studentAnswer: string
): Promise<ValidationResult> {
  const prompt = `Validate if this answer is correct:
Question: ${question}
Student's Answer: ${studentAnswer}

Return ONLY a JSON object:
{
  "isCorrect": true/false,
  "explanation": "brief explanation of why",
  "expectedAnswer": "correct answer if student is wrong"
}`;

  const response = await callOpenAI(
    [
      {
        role: 'system',
        content: 'You are a math validation expert. Return only valid JSON.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    {
      model: 'gpt-4o',
      temperature: 0.1,
      maxTokens: 200,
    }
  );

  try {
    let cleanedResponse = response.trim();
    if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    }
    const result = JSON.parse(cleanedResponse);
    return result;
  } catch (error) {
    throw new Error('Failed to validate answer');
  }
}

/**
 * Evaluate a mathematical expression
 */
export async function evaluateExpression(expression: string): Promise<string> {
  const prompt = `Evaluate this mathematical expression and return ONLY the numerical result:
${expression}

Return ONLY the number, nothing else.`;

  const response = await callOpenAI(
    [
      {
        role: 'system',
        content: 'You are a calculator. Return only the numerical result.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    {
      model: 'gpt-4o',
      temperature: 0,
      maxTokens: 50,
    }
  );

  return response.trim();
}

/**
 * Solve a linear equation
 */
export async function solveLinearEquation(equation: string): Promise<string> {
  const prompt = `Solve this equation for x:
${equation}

Return ONLY the value of x (e.g., "x = 5"), nothing else.`;

  const response = await callOpenAI(
    [
      {
        role: 'system',
        content: 'You are a math solver. Return only the solution in format "x = [value]".',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    {
      model: 'gpt-4o',
      temperature: 0,
      maxTokens: 50,
    }
  );

  return response.trim();
}

/**
 * Generate Socratic response with tool usage
 */
export async function generateSocraticResponse(
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  studentContext: {
    name: string;
    currentProblem?: string;
  }
): Promise<string> {
  const systemPrompt = `${SOCRATIC_TUTOR_PROMPT}

You are tutoring ${studentContext.name}.
${studentContext.currentProblem ? `Current problem: ${studentContext.currentProblem}` : ''}

Remember: NEVER give direct answers. Guide through questions. Validate ALL student answers with tools before responding.`;

  const response = await callOpenAI(
    [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
    ],
    {
      model: 'gpt-4o',
      temperature: 0.7,
      maxTokens: 200,
    }
  );

  return response;
}

/**
 * Generate Socratic response for multi-subject chat companion
 */
export async function generateSocraticResponseMultiSubject(
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  currentMessage: string,
  studentContext: {
    recentSubject: string | null;
    recentTopic: string | null;
    recentTutorName: string | null;
    struggles: string[];
    strengths: string[];
    topicsCovered: string[];
  }
): Promise<string> {
  const contextInfo = `
Student Context:
- Recent subject: ${studentContext.recentSubject || 'Not specified'}
- Recent topic: ${studentContext.recentTopic || 'Not specified'}
- Recent tutor: ${studentContext.recentTutorName || 'None'}
- Areas of struggle: ${studentContext.struggles.length > 0 ? studentContext.struggles.join(', ') : 'None identified yet'}
- Areas of strength: ${studentContext.strengths.length > 0 ? studentContext.strengths.join(', ') : 'None identified yet'}
- Topics covered: ${studentContext.topicsCovered.length > 0 ? studentContext.topicsCovered.join(', ') : 'None yet'}
`;

  const systemPrompt = `${SOCRATIC_TUTOR_PROMPT}

${contextInfo}

Remember: NEVER give direct answers. Guide through questions. Be friendly and encouraging. You're a study companion helping across ALL subjects.`;

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    ...conversationHistory.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    })),
    { role: 'user' as const, content: currentMessage },
  ];

  const response = await callOpenAI(messages, {
    model: 'gpt-4o',
    temperature: 0.7,
    maxTokens: 300,
  });

  return response;
}

