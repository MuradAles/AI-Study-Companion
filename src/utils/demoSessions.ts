/**
 * Demo Sessions Generator
 * 
 * Creates realistic tutoring session transcripts for demo purposes.
 * These can be loaded by students to see how the app works.
 */

import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '../services/firebase';

export interface DemoSession {
  subject: string;
  tutorName: string;
  transcript: string;
}

export const DEMO_SESSIONS: DemoSession[] = [
  {
    subject: 'Mathematics',
    tutorName: 'Dr. Sarah Chen',
    transcript: `Tutor: "Good morning! Today we're going to work on quadratic equations. Can you tell me what a quadratic equation is?"
Student: "I think it's an equation with x squared?"
Tutor: "Exactly! A quadratic equation has the form ax² + bx + c = 0, where a, b, and c are constants and a ≠ 0. Let's solve x² - 5x + 6 = 0. What method would you use?"
Student: "I think I need to factor it... (x - 2)(x - 3) = 0?"
Tutor: "Perfect! How did you get that?"
Student: "I looked for two numbers that multiply to 6 and add to -5, so -2 and -3."
Tutor: "Excellent reasoning! Now what are the solutions?"
Student: "x = 2 or x = 3!"
Tutor: "Perfect! You've got it. Now let's try one with the quadratic formula: x² + 4x - 5 = 0."
Student: "So a = 1, b = 4, c = -5. The formula is x = (-b ± √(b² - 4ac)) / 2a, right?"
Tutor: "Yes! Plug in the values."
Student: "x = (-4 ± √(16 + 20)) / 2 = (-4 ± √36) / 2 = (-4 ± 6) / 2. So x = 1 or x = -5!"
Tutor: "Excellent work! You're mastering quadratic equations!"`
  },
  {
    subject: 'SAT Math',
    tutorName: 'Mr. James Rodriguez',
    transcript: `Tutor: "Let's work on some SAT math problems. Here's one: If 3x + 2y = 12 and x - y = 1, what is the value of x?"
Student: "I need to solve this system of equations. Should I use substitution or elimination?"
Tutor: "Good question! Let's try substitution. What can we do with the second equation?"
Student: "From x - y = 1, I can get y = x - 1. Then I can substitute that into the first equation."
Tutor: "Perfect! Do it."
Student: "So 3x + 2(x - 1) = 12. That's 3x + 2x - 2 = 12, so 5x = 14, and x = 14/5 = 2.8."
Tutor: "Great! But let's check our answer. If x = 14/5, what is y?"
Student: "y = x - 1 = 14/5 - 5/5 = 9/5. Let me check: 3(14/5) + 2(9/5) = 42/5 + 18/5 = 60/5 = 12. Perfect!"
Tutor: "Excellent problem-solving! You're thinking through each step carefully. Now let's try a word problem: A train travels 120 miles in 2 hours. At this rate, how long will it take to travel 180 miles?"
Student: "I can set up a proportion: 120 miles / 2 hours = 180 miles / x hours. Cross-multiplying: 120x = 360, so x = 3 hours."
Tutor: "Perfect! You're getting the hang of SAT math problems!"`
  },
  {
    subject: 'SAT Reading',
    tutorName: 'Ms. Emily Watson',
    transcript: `Tutor: "Today we're going to practice SAT reading comprehension. I'll give you a passage and we'll work through the questions together. Here's a passage about climate change..."
Student: "Should I read the questions first, or read the passage first?"
Tutor: "Good question! For SAT reading, I recommend reading the passage first to understand the main ideas, then tackle the questions. Let's start reading."
Student: "Okay, so the passage is talking about how climate change affects ocean temperatures and marine ecosystems..."
Tutor: "Right, what's the main argument?"
Student: "It seems like the author is arguing that rising ocean temperatures are causing coral bleaching and disrupting marine food chains."
Tutor: "Excellent! Now let's look at the first question: 'What is the primary purpose of the passage?'"
Student: "I think it's to explain the effects of climate change on marine ecosystems. The answer choice says 'to describe the impact of rising temperatures on ocean life' - that matches!"
Tutor: "Perfect reasoning! You're identifying the main purpose correctly. What about the inference question: 'Based on the passage, what can be inferred about coral reefs?'"
Student: "The passage says coral reefs are bleaching due to temperature stress. So I think the answer is that they're vulnerable to temperature changes."
Tutor: "Excellent! You're making good inferences based on the text evidence. Keep practicing this approach!"`
  },
  {
    subject: 'Geometry',
    tutorName: 'Prof. Michael Thompson',
    transcript: `Tutor: "Today we're exploring the Pythagorean theorem. Do you remember what it states?"
Student: "I think it's a² + b² = c² for right triangles, where c is the hypotenuse."
Tutor: "Exactly! And it only works for right triangles. Let's apply it: If a right triangle has legs of length 3 and 4, what's the hypotenuse?"
Student: "So a² + b² = c² means 3² + 4² = c², so 9 + 16 = c², so c² = 25, and c = 5."
Tutor: "Perfect! That's a 3-4-5 right triangle. Now let's try a word problem: A ladder 10 feet long leans against a wall. If the base of the ladder is 6 feet from the wall, how high does the ladder reach?"
Student: "So the ladder is the hypotenuse c = 10, and one leg is 6. So 6² + b² = 10², which is 36 + b² = 100, so b² = 64, and b = 8 feet."
Tutor: "Excellent! Now let's talk about special right triangles. Do you know the 30-60-90 triangle?"
Student: "I think the sides are in a ratio, but I'm not sure of the exact ratio."
Tutor: "In a 30-60-90 triangle, the sides are in the ratio 1 : √3 : 2. The side opposite 30° is the shortest, the side opposite 60° is √3 times that, and the hypotenuse is 2 times the shortest side."
Student: "Oh, so if the shortest side is 5, then the other leg is 5√3 and the hypotenuse is 10?"
Tutor: "Perfect! You've got it. These special triangles come up often in geometry problems."`
  },
  {
    subject: 'Algebra',
    tutorName: 'Dr. Lisa Park',
    transcript: `Tutor: "Let's work on solving linear equations. Can you solve 2x + 5 = 13?"
Student: "I need to isolate x. So I subtract 5 from both sides: 2x = 8, then divide by 2, so x = 4."
Tutor: "Perfect! Now let's try one with fractions: (x/3) + 2 = 7."
Student: "I subtract 2 from both sides: x/3 = 5, then multiply both sides by 3, so x = 15."
Tutor: "Excellent! Now let's try a more complex one: 3(x - 2) + 4 = 2x + 1."
Student: "First I distribute the 3: 3x - 6 + 4 = 2x + 1, so 3x - 2 = 2x + 1. Then I subtract 2x from both sides: x - 2 = 1, so x = 3."
Tutor: "Perfect! You're mastering the steps. Always check your answer by substituting back into the original equation."
Student: "Let me check: 3(3 - 2) + 4 = 3(1) + 4 = 3 + 4 = 7, and 2(3) + 1 = 6 + 1 = 7. It works!"
Tutor: "Excellent! You're thinking like a mathematician - always verifying your work!"`
  }
];

/**
 * Create a demo session in Firestore
 */
export async function createDemoSession(
  studentId: string,
  demoSession: DemoSession
): Promise<string> {
  const goalId = `goal-${demoSession.subject.toLowerCase().replace(/\s+/g, '-')}`;
  
  const sessionData = {
    studentId,
    goalId,
    subject: demoSession.subject,
    tutorName: demoSession.tutorName,
    transcript: demoSession.transcript,
    date: Timestamp.now(),
    status: 'completed',
  };

  try {
    const docRef = await addDoc(collection(db, 'sessions'), sessionData);
    console.log(`✅ Demo session created for ${demoSession.subject}:`, docRef.id);
    return docRef.id;
  } catch (error) {
    console.error(`❌ Error creating demo session for ${demoSession.subject}:`, error);
    throw error;
  }
}

/**
 * Create all demo sessions for a student
 */
export async function createAllDemoSessions(studentId: string): Promise<string[]> {
  const sessionIds: string[] = [];
  
  try {
    // Create sessions one by one to avoid overwhelming Firestore
    for (const demoSession of DEMO_SESSIONS) {
      const sessionId = await createDemoSession(studentId, demoSession);
      sessionIds.push(sessionId);
      
      // Small delay between creations to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`✅ Created ${sessionIds.length} demo sessions`);
    return sessionIds;
  } catch (error) {
    console.error('❌ Error creating demo sessions:', error);
    throw error;
  }
}




