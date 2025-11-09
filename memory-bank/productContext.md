# Product Context: AI Study Companion

## Why This Product Exists

The AI Study Companion bridges the gap between tutoring sessions, addressing critical retention and engagement problems in the tutoring platform ecosystem.

## Problems We Solve

### 1. Student Churn After Goal Completion
**Problem:** 52% of students leave after achieving their primary goal  
**Solution:** Multi-goal awareness system that proactively suggests new subjects when goals complete, showing students the platform's full value

### 2. Low Engagement Between Sessions
**Problem:** Students forget material between sessions, lose momentum  
**Solution:** AI-generated practice questions scheduled for the day after each session, maintaining engagement and reinforcing learning

### 3. Early Week Drop-off
**Problem:** Students with <3 sessions in first week have poor retention  
**Solution:** Automated detection and notification system that nudges at-risk students to book additional sessions

### 4. Lack of Cross-Subject Awareness
**Problem:** Students don't realize platform can help with multiple subjects  
**Solution:** Visual progress dashboard showing all subjects, with intelligent cross-sell suggestions based on completed goals

### 5. Need for Clarification Between Sessions
**Problem:** Students have questions about session content but no immediate help  
**Solution:** AI chat companion available 24/7 that references their actual sessions for context-aware clarification

## How It Should Work

### User Experience Flow

1. **After Session:**
   - Transcript automatically analyzed by AI
   - Topics, struggles, and strengths extracted
   - Practice questions generated and scheduled for next day
   - Questions added to shared question pool (visible to all students)

2. **Daily Practice:**
   - Student opens app and sees new practice questions
   - Answers questions with immediate AI feedback
   - Earns points, maintains streaks, unlocks badges
   - Visual celebrations for achievements
   - **Important:** Only practice page questions count toward gamification

3. **Between Sessions - Chat Companion:**
   - AI chat companion available 24/7
   - **Primary purpose:** Clarification questions about session content
   - References past sessions for context-aware responses
   - Math equations rendered with KaTeX/LaTeX
   - Step-by-step explanations displayed clearly
   - **Practice questions removed** - Chat is for help/clarification only (use Practice page for questions)
   - Shows cross-sell suggestions after 3 questions answered
   - Conversation persists across page refreshes
   - Subject filtering throughout entire conversation

4. **Learning Tree - Visual Learning Journey:**
   - Interactive radial tree showing learning progress
   - **Structure:** Student → Subject → Tutor → Difficulty
   - Click difficulty node to see questions for that specific tutor/subject/difficulty
   - Generate exactly 3 questions on-demand for any difficulty level
   - Solve questions directly within tree page
   - Progress sidebar shows subject completion with circular progress bars
   - Visual indicators show which questions are completed
   - Tree automatically updates after generating or solving questions
   - Full-screen immersive experience

5. **Goal Completion:**
   - System detects goal completion
   - Shows cross-sell suggestions based on actual session history
   - Maintains multi-subject progress view
   - Encourages continued engagement

6. **At-Risk Detection:**
   - System identifies students with <3 sessions in week 1
   - Sends personalized booking nudges via notifications
   - Tracks engagement metrics

## User Experience Goals

### Engagement
- **Visual:** Celebration animations for achievements, sparkles that multiply with streaks
- **Feedback:** Immediate, encouraging feedback on every practice question
- **Progress:** Clear visual indicators of progress across all subjects
- **Chat:** Natural conversation flow with context-aware responses

### Personalization
- **Practice:** Questions tailored to student's actual session content and struggles
- **Chat:** AI responses reference specific moments from past sessions
- **Suggestions:** Cross-sell recommendations based on completed subjects and session history
- **Questions:** Always fresh, never repeated scenarios

### Motivation
- **Gamification:** Points, levels, badges, and streaks create intrinsic motivation
- **Daily Goals:** Clear 3-question-per-day target with visual progress
- **Achievements:** Unlockable badges for various milestones
- **Chat Feedback:** Visual sparkles for correct answers (even without points)

### Convenience
- **24/7 Availability:** AI chat always available between sessions
- **Automated Scheduling:** Practice questions automatically scheduled after sessions
- **Smart Notifications:** Context-aware nudges at optimal times
- **Conversation Persistence:** Chat history saved and restored automatically

## Key User Interactions

### Dashboard
- See gamification status (level, points, streak)
- View daily goal progress
- Access new practice questions
- Track multi-subject progress
- Navigate to chat, practice, or badges
- See cross-sell suggestions when goals complete

### Practice Interface
- Answer questions one at a time from shared question pool
- Submit answers and receive immediate feedback
- See celebration animations
- Progress through question set
- Reference session context for hints
- **Gamification:** Points, levels, badges, streaks all tracked here

### Chat Interface
- Natural conversation with AI
- **Clarification Focus:** Questions answered with session context
- References to specific moments in past sessions
- Math equations rendered with KaTeX/LaTeX
- Step-by-step explanations displayed clearly
- Cross-sell suggestions after 3 questions
- **Practice questions removed** - Chat is for help/clarification only (use Practice page for questions)
- Conversation persists across refreshes
- Subject filtering throughout entire conversation
- Fixed layout (input stays at bottom, messages scroll correctly)

### Progress View
- Visual progress bars for each subject
- Completion status and next steps
- Cross-sell suggestions when goals complete (based on session history)
- Ability to start new subjects
- Statistics: questions answered, accuracy, points earned, sessions completed

### Learning Tree View
- Radial tree visualization showing learning journey
- Student at center, subjects radiate outward
- Each subject branches to tutors, then difficulty levels
- Click difficulty node to see questions for that tutor/subject/difficulty
- Generate more questions directly from tree (always 3 questions)
- Solve questions within tree page without navigating away
- Progress sidebar shows circular progress bars for each subject
- Visual completion indicators (checkmarks, ratios) on difficulty nodes
- Full-screen immersive experience
- Kid-friendly design with animations and emojis

## Design Principles

1. **Encouraging, Not Pressuring:** Gamification enhances motivation without creating anxiety
2. **Context-Aware:** Everything references actual session content for relevance
3. **Immediate Feedback:** All actions provide instant, clear responses
4. **Visual Delight:** Celebrations and animations make achievements feel rewarding
5. **Privacy-First:** Student data securely stored, clear privacy policies
6. **Session-First:** Chat focuses on clarifying session content, not general tutoring
7. **Always Fresh:** Chat practice questions always generated new with unique scenarios

## Chat System Specifics

### Chat Purpose
- **Primary:** Clarification about session content
- **Purpose:** Help and clarification only
- **Not For:** Practice questions (use Practice page instead)
- **Not For:** General tutoring (should book session instead)

### Chat Features
- **Math Rendering:** KaTeX/LaTeX support for math equations
- **Step-by-Step:** Structured explanations with numbered steps
- **Subject Filtering:** Filters by subject throughout entire conversation (not just first message)
- **Layout:** Fixed input at bottom, messages scroll correctly
- **Practice Questions:** Removed from chat - students should use Practice page

### Cross-Sell in Chat
- **Trigger:** After answering 3 questions in conversation
- **Source:** Based on student's actual session history
- **Logic:** Analyzes completed subjects, suggests related subjects
- **Display:** Inline suggestion cards in chat

## Success Indicators

Users should feel:
- **Supported:** AI companion helps between sessions
- **Motivated:** Gamification makes practice engaging
- **Valued:** Progress across all subjects is recognized
- **Confident:** Practice reinforces session learning
- **Clarified:** Chat answers questions about their actual sessions
- **Connected:** Clear path to book next session when needed
