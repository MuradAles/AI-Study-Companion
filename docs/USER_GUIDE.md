# AI Study Companion - User Guide

## 🎯 How Students Use the Application

### Getting Started

1. **Sign In**: The app automatically signs you in anonymously when you first visit
2. **Dashboard**: You'll see your dashboard with:
   - Your current level, points, and streak
   - Daily goals progress
   - Active subject goals
   - Practice questions (if available)

### The Student Journey

#### Step 1: Complete a Tutoring Session (Outside the App)

**Important**: Currently, tutoring sessions are created outside this application. The app is designed to work with transcripts from your tutoring platform.

**How it works:**
- You complete a tutoring session with your tutor (via Zoom, phone, or in-person)
- The session transcript is uploaded to the system
- The AI automatically processes the transcript

**For Testing/Demo**: You can manually create a session using the test helper (see below)

#### Step 2: AI Processes Your Session

**Automatic (Behind the Scenes):**
- AI analyzes the transcript for topics covered
- Identifies areas where you struggled
- Highlights your strengths
- Extracts key learning moments

#### Step 3: Practice Questions Are Generated

**Automatic (Next Day):**
- AI creates personalized practice questions based on your session
- Questions are scheduled for the day after your session
- You'll see a notification: "New Practice Available!"

#### Step 4: Answer Practice Questions

1. **Go to Practice Page**: Click "Start Practice" on the dashboard or navigate to `/practice`
2. **Answer Questions**: Type your answer to each question
3. **Get Feedback**: AI evaluates your answer and provides:
   - Immediate feedback
   - Points awarded (full points for correct, half for partially correct)
   - Encouragement and tips
4. **Track Progress**: 
   - Earn points and level up
   - Maintain daily streaks
   - Unlock badges

#### Step 5: Chat with AI Companion

1. **Go to Chat Page**: Navigate to `/chat`
2. **Ask Questions**: 
   - Ask about topics from your sessions
   - Get help with homework
   - Request explanations
3. **Get Context-Aware Answers**: The AI remembers:
   - Your past sessions
   - Your goals
   - Your struggles and strengths

#### Step 6: Track Your Progress

1. **Go to Progress Page**: Navigate to `/progress`
2. **View Statistics**:
   - Questions answered
   - Accuracy rate
   - Level and points
   - Day streak
   - Badges earned
3. **See Subject Progress**:
   - Progress bars for each subject
   - Sessions completed vs. target
   - Recent sessions

### Features Explained

#### 🎮 Gamification

- **Points**: Earn points for correct answers
- **Levels**: Level up as you earn more points (8 levels total)
- **Streaks**: Maintain daily streaks by answering questions each day
- **Badges**: Unlock badges for milestones:
  - ✨ First Answer
  - 🔥 On Fire (3-day streak)
  - 💪 Dedicated (7-day streak)
  - 🏆 Unstoppable (30-day streak)
  - 💯 Perfect Day (complete daily goal with all correct)

#### 📊 Daily Goals

- **Target**: Answer 3 questions per day
- **Progress**: Track your daily progress
- **Bonus**: Complete daily goal to earn bonus points

#### 🔔 Notifications

You'll receive notifications for:
- **New Practice Questions**: When questions are ready
- **Booking Nudges**: If you're at risk of churning (<3 sessions in first week)
- **Cross-Sell Suggestions**: When you complete a subject goal

#### 🎯 Subject Goals

- **Track Progress**: See how many sessions you've completed for each subject
- **Status**: Goals show as "in_progress", "completed", or "pending"
- **Multi-Subject**: Work on multiple subjects simultaneously

### Creating Test Sessions (For Demo/Testing)

If you want to test the app without a real tutoring session, you can create a test session:

**Option 1: Using Browser Console**

1. Open browser console (F12)
2. Run this code:

```javascript
// Get your user ID
const userId = firebase.auth().currentUser?.uid;

// Import the test helper (if available)
// Or create a session manually:
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db } from './services/firebase';

const sessionData = {
  studentId: userId,
  goalId: 'goal-mathematics',
  subject: 'Mathematics',
  tutorName: 'Dr. Smith',
  transcript: `Tutor: "Today we're working on quadratic equations. Can you tell me what a quadratic equation is?"
Student: "I think it's an equation with x squared?"
Tutor: "Exactly! A quadratic equation has the form ax² + bx + c = 0. Let's solve x² - 5x + 6 = 0."
Student: "I need to factor it... (x - 2)(x - 3) = 0?"
Tutor: "Perfect! So what are the solutions?"
Student: "x = 2 or x = 3!"
Tutor: "Excellent work! You've got it!"`,
  date: Timestamp.now(),
  status: 'completed',
};

await addDoc(collection(db, 'sessions'), sessionData);
console.log('✅ Session created! Practice questions will be generated automatically.');
```

**Option 2: Using Test Helper Function**

If the test helper is available in your build:

```javascript
import { createTestSession } from './utils/testDataHelper';

const userId = firebase.auth().currentUser?.uid;
await createTestSession(
  userId,
  'Mathematics',
  'Tutor: "Let\'s work on quadratic equations..."\nStudent: "I think it\'s an equation with x squared?"\nTutor: "Exactly!..."'
);
```

### What Happens After Creating a Session?

1. **Immediate (within seconds)**:
   - Transcript is analyzed by AI
   - Analysis saved to session document

2. **After Analysis (within minutes)**:
   - Practice questions are generated
   - Questions scheduled for tomorrow
   - Available in `/practice` page

3. **Next Day**:
   - Practice questions become available
   - You'll see notification on dashboard
   - Can start answering questions

### Common Questions

**Q: How do I create a new subject/goal?**  
A: Currently, goals are created automatically when you complete a session in a new subject. For testing, create a session with a new subject name.

**Q: Why don't I see any practice questions?**  
A: Practice questions are generated the day after a session. Create a session first, then wait or check back tomorrow.

**Q: How do I start a tutoring session?**  
A: This app assumes you're using a separate tutoring platform. Sessions are created outside this app and transcripts are uploaded automatically.

**Q: Can I use this without a tutor?**  
A: Yes! You can use the AI Chat feature to ask questions and get help. However, practice questions require a session transcript.

### Troubleshooting

**No Practice Questions Showing:**
- Check that you've created a session
- Wait for questions to be generated (can take a few minutes)
- Check that questions are scheduled for today or earlier

**Chat Not Responding:**
- Check browser console for errors
- Verify OpenAI API is configured
- Check Firebase Functions logs

**Notifications Not Working:**
- Allow browser notifications
- Check notification permissions in browser settings
- Verify FCM token is saved (check browser console)

---

## 🚧 Missing Features (Future Enhancements)

The following features would improve the student experience but are not yet implemented:

1. **Session Creation UI**: Interface for students to manually create/upload sessions
2. **Goal Management**: UI to create, edit, and delete subject goals
3. **Session History**: View all past sessions with transcripts
4. **Tutor Integration**: Direct integration with tutoring platform
5. **Onboarding Flow**: Step-by-step guide for new students
6. **Session Recording**: Record sessions directly in the app
7. **Homework Help**: Upload homework questions for AI help
8. **Study Plans**: AI-generated study schedules




