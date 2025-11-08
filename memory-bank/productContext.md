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
   - Can generate practice questions when requested (always new, multiple choice)
   - **Chat questions:** Visual feedback only (sparkles), NO points/badges/levels
   - Shows cross-sell suggestions after 3 questions answered
   - Conversation persists across page refreshes

4. **Goal Completion:**
   - System detects goal completion
   - Shows cross-sell suggestions based on actual session history
   - Maintains multi-subject progress view
   - Encourages continued engagement

5. **At-Risk Detection:**
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
- Request practice questions ("I want to practice", "give me examples")
- Practice questions appear inline (multiple choice, 4 options)
- Answer validation with visual feedback (sparkles if correct)
- Cross-sell suggestions after 3 questions
- **No Gamification:** Chat questions don't count toward points/levels/badges
- Conversation persists across refreshes

### Progress View
- Visual progress bars for each subject
- Completion status and next steps
- Cross-sell suggestions when goals complete (based on session history)
- Ability to start new subjects
- Statistics: questions answered, accuracy, points earned, sessions completed

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
- **Secondary:** Practice question generation when requested
- **Not For:** General tutoring (should book session instead)

### Practice Questions in Chat
- **Format:** Always multiple choice with 4 options (A, B, C, D)
- **Source:** Always generated fresh, never from practice_items
- **Topic:** Based on student's actual session topics
- **Feedback:** Visual sparkles if correct, explanation if incorrect
- **Gamification:** NO points, NO levels, NO badges, NO streaks
- **Trigger:** Intent detection ("practice", "solve", "example", "question")

### Cross-Sell in Chat
- **Trigger:** After answering 3 practice questions in conversation
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
