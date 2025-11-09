# System Patterns: AI Study Companion

## Architecture Overview

```
Tutoring Session (External)
    ↓
Firebase Functions (processTranscript, generateQuestions, evaluateAnswer, checkStudentHealth)
    ↓
Firestore Database (students, sessions, questions, conversations, notifications)
    ↓
React Web Application (Dashboard, Practice, Chat, Progress, Gamification)
```

## Key Design Patterns

### 1. Event-Driven Architecture

**Firestore Triggers → Functions → Data Updates**

- Session document created → `processTranscript()` triggered
- Session document updated with `aiAnalysis` → `generateQuestions()` triggered (creates shared questions)
- Scheduled daily → `checkStudentHealth()` runs
- User action → `evaluateAnswer()` callable function (for shared questions)
- User chat message → `generateChatResponseFunction()` callable
- Goal status change → `onGoalCompletion()` triggered

**Benefits:**
- Automatic processing without manual intervention
- Real-time updates propagate through system
- Decoupled components allow independent scaling

### 2. Real-Time Data Synchronization

**Firestore Listeners → React State Updates**

Components use Firestore's `onSnapshot` listeners for real-time updates:
- `useStudent()` hook listens to student document changes
- `usePracticeItems()` hook listens to questions collection queries
- Chat component listens to conversation document updates
- Gamification updates reflect immediately in UI

**Pattern:**
```typescript
useEffect(() => {
  const unsubscribe = onSnapshot(doc(db, 'students', studentId), (doc) => {
    setStudent({ id: doc.id, ...doc.data() });
  });
  return unsubscribe;
}, [studentId]);
```

### 3. AI-First Processing Pipeline

**Transcript → Analysis → Questions → Practice**

1. Raw transcript uploaded to Firestore
2. Function analyzes with OpenAI API
3. Extracted data structured in `aiAnalysis` object
4. Questions generated based on analysis → Added to shared `questions` collection
5. Practice items scheduled for next day (from shared pool)
6. Student interacts with questions
7. Answers evaluated with AI feedback
8. Gamification updated

**Separation of Concerns:**
- Analysis happens server-side (Firebase Functions)
- Questions stored in Firestore for client access
- Evaluation happens on-demand via callable function
- Shared question pool allows all students to benefit

### 4. Booking & Tutor System Architecture

**Booking Flow:**

1. **Student Books Meeting:**
   - Student selects date, time, subject (required), and topic (optional) via `BookMeetingModal`
   - Creates document in `booking_requests` collection with status 'pending'
   - Real-time listener updates student dashboard immediately

2. **Tutor Views Pending Bookings:**
   - `TutorDashboard` queries all pending bookings using Firestore `onSnapshot`
   - Displays student name, subject, topic, date & time
   - Shows "Accept & Create Appointment" button

3. **Tutor Accepts Booking:**
   - Updates booking status to 'accepted'
   - Sets `tutorId` and `tutorName` on booking document
   - Real-time listeners update both student and tutor dashboards instantly

4. **Tutor Generates Fake Session:**
   - Calls `generateTutoringTranscript` Firebase Cloud Function
   - OpenAI generates realistic, subject-specific conversation transcript
   - Creates session document with both `conversation` (array) and `transcript` (string)
   - Firebase Cloud Functions automatically analyze transcript and generate practice questions

**Role-Based Access Control:**
- Login flow includes role selection (Student or Tutor)
- `AuthContext` creates either `students` or `tutors` document based on role
- `useUserRole` hook checks both collections to determine user role
- `App.tsx` routes students to `/dashboard` and tutors to `/tutor`
- Navigation component shows different links based on role
- Session detail page allows tutors to view any session

**Real-Time Updates:**
- Both dashboards use `onSnapshot` listeners for instant updates
- No page reload required when bookings are accepted or created
- Student sees booking status change immediately
- Tutor sees new pending bookings appear instantly

**Data Collections:**
- `booking_requests` - All booking requests (pending/accepted)
- `students` - Student profiles with gamification data
- `tutors` - Simple tutor profiles (name, uid)
- `sessions` - Tutoring sessions with transcripts and AI analysis

### 5. Chat System Architecture

**Conversation Flow:**

1. **Student sends message** → `generateChatResponseFunction()` called
2. **Context loading:**
   - Loads student's goals, recent sessions (last 5), practice history
   - Optionally filters by subject if detected in first message
3. **Intent detection:**
   - Checks for practice keywords ("practice", "solve", "example", "question")
   - If practice intent → generates new question
4. **Response generation:**
   - Uses OpenAI with session context
   - References specific moments from sessions
   - Provides clarification-focused answers
5. **Practice question (if requested):**
   - Always generates NEW question (never from practice_items)
   - Multiple choice format (4 options A-D)
   - Based on session topics
6. **Answer validation:**
   - `validateChatAnswer()` function
   - Visual feedback (sparkles if correct)
   - NO gamification points/badges/levels
7. **Cross-sell suggestions:**
   - After 3 questions answered in conversation
   - Based on actual session history
   - Shows related subjects

**Conversation Persistence:**
- Conversations stored in `conversations/{conversationId}` collection
- Messages array with full history
- Loaded on component mount
- Real-time updates via Firestore listener
- Pattern similar to chat.dpg (Athena-Math repo)

### 6. Gamification State Management

**Centralized in Student Document**

All gamification data stored in `students/{studentId}/gamification`:
- Points, level, streaks calculated server-side
- Badges checked and awarded in `evaluateAnswer()` function
- Daily goals tracked per day with reset logic
- Client updates reflect server state via listeners

**State Calculation:**
- Level calculated from total points (server-side)
- Streak calculated from last activity date (server-side)
- Badges checked against triggers (server-side)
- Client displays calculated values

**Important:** Chat questions do NOT update gamification - only practice page questions do.

### 7. Dual Practice Question Systems

**System 1: Shared Questions Pool (`questions` collection)**
- Questions generated from sessions → Added to `questions` collection
- All students can access shared questions
- Questions include attribution (createdBy, createdByName)
- Statistics tracked (timesAttempted, timesCorrect)
- Used by `PracticeShared` component (`/practice` route)
- LeetCode-style interface with filtering and search
- Questions are permanent and visible to all authenticated users

**System 2: Per-Student Practice Items (`practice_items` collection)**
- Per-student collection with scheduled questions
- Questions generated per session, scheduled for next day
- Used by `Practice` component (`/practice-checkpoint` route)
- Checkpoint-based system (3 correct answers per checkpoint)
- Questions organized by session and topic
- Status tracked: `pending` → `completed` → `skipped`

**Chat Practice Questions:**
- Always generates NEW questions (never from either pool)
- Multiple choice format (4 options A-D)
- Based on student's actual session topics
- Visual feedback only, NO gamification

**Benefits:**
- Shared pool: Students benefit from others' sessions, question diversity increases
- Per-student items: Personalized scheduling, checkpoint progression
- Chat questions: Always fresh, context-aware, no gamification conflicts

### 8. Notification System

**Scheduled Function → Notification Document → FCM → Client**

1. `checkStudentHealth()` runs daily at 10am
2. Identifies at-risk students via queries
3. Creates notification documents in Firestore
4. Sends via Firebase Cloud Messaging
5. Client receives notification (foreground or background)
6. User clicks notification → navigates to action URL

**Types:**
- `booking_nudge`: Early week retention (<3 sessions)
- `cross_sell`: Goal completion suggestions
- `streak_reminder`: Maintain engagement streaks
- `practice_reminder`: Daily practice goals
- `achievement`: Badge/level up notifications

### 9. Cross-Sell Intelligence

**Two Implementation Approaches:**

**Approach 1: Goal Completion Cross-Sell (`crosssell.ts`)**
- Uses hardcoded `CROSS_SELL_MAP` for subject relationships
- Triggered when goal status changes to 'completed'
- Function: `processGoalCompletion()` → `getCrossSellSuggestions()`
- Filters out subjects student already has as goals
- Sends FCM notification and creates notification document
- Updates student document with `crossSellSuggestions` array

**Approach 2: Chat Session-Based Cross-Sell (`chat.ts`)**
- Uses `getSessionBasedSuggestions()` which analyzes actual session history
- Identifies completed subjects from student's sessions
- Maps to related subjects using `subjectRelations` mapping
- Shows in chat after 3 questions answered
- More personalized based on actual learning path

**Subject Relationships:**
```typescript
// Hardcoded mapping (crosssell.ts)
const CROSS_SELL_MAP: Record<string, string[]> = {
  'SAT Math': ['College Essays', 'AP Calculus', 'SAT Reading'],
  // ... more mappings
};

// Session-based mapping (chat.ts)
const subjectRelations: Record<string, string[]> = {
  'Mathematics': ['Physics', 'Statistics', 'Computer Science'],
  // ... more mappings
};
```

**Note:** Goal completion uses hardcoded mapping, chat uses session-based analysis. Both filter out existing goals.

### 10. Session Context Integration

**Chat Responses Reference Actual Sessions**

AI chat companion loads:
- Last 5 sessions (or filtered by subject)
- Current struggles from `aiAnalysis`
- Recent practice results
- Student goals and subjects

**Response Generation:**
- System prompt includes student context
- AI references specific session timestamps
- Can suggest booking tutor if question too complex
- Tracks conversation history in Firestore
- Clarification-focused (not general tutoring)

### 11. Practice Scheduling Logic

**Session → Next Day → Scheduled Time**

- Questions generated after session analysis
- Added to shared `questions` collection
- Practice page queries: `where('subject', '==', subject)` or similar
- Questions appear when available
- Status tracked: `pending` → `completed` → `skipped`

## Component Relationships

### React Component Hierarchy

```
App
├── Dashboard (Student)
│   ├── GamificationHeader (level, points, streak)
│   ├── DailyGoals (progress indicator)
│   ├── PracticeAlert (new questions available)
│   ├── ProgressTracker (multi-subject view)
│   ├── SessionsTable (recent sessions)
│   └── TutoringRequests (pending/accepted bookings)
├── TutorDashboard (Tutor)
│   ├── PendingBookings (with Accept button)
│   └── AcceptedBookings (with Generate Fake Session button)
├── BookMeetingModal
│   ├── DatePicker
│   ├── TimePicker
│   ├── SubjectInput (required)
│   └── TopicInput (optional)
├── PracticeInterface (PracticeShared)
│   ├── QuestionCard (question display from shared pool)
│   ├── AnswerInput (text input)
│   ├── FeedbackDisplay (AI feedback)
│   └── CelebrationAnimation (achievements)
├── ChatInterface
│   ├── ChatList (conversation history)
│   ├── MessageList (conversation messages)
│   ├── MessageInput (user input)
│   ├── PracticeQuestionCard (inline questions)
│   └── SessionReference (context links)
└── MultiSubjectProgress
    ├── SubjectCard (per subject)
    ├── CrossSellSuggestions (recommendations)
    └── GoalTimeline (completion status)
```

### Data Flow Patterns

**Student Data:**
```
Firestore students/{id} → useStudent() hook → Component state → UI
```

**Practice Questions (Shared Pool):**
```
Firestore questions (query) → usePracticeItems() hook → Component state → UI
```

**Chat Conversations:**
```
Firestore conversations/{id} → Chat component → Real-time listener → UI
```

**Gamification:**
```
Student document → useGamification() hook → Calculated values → UI
```

## Key Algorithms

### Level Calculation
```typescript
function calculateLevel(points: number): number {
  const levels = [0, 100, 250, 500, 1000, 2000, 4000, 8000];
  return levels.findIndex(threshold => points < threshold) || 8;
}
```

### Streak Calculation
```typescript
function calculateStreak(lastActivityDate: string, today: string): number {
  const daysDiff = (new Date(today) - new Date(lastActivityDate)) / (1000 * 60 * 60 * 24);
  return daysDiff === 1 ? currentStreak + 1 : 1; // Reset if not consecutive
}
```

### Badge Checking
```typescript
function checkForNewBadges(student: Student, action: Action): Badge[] {
  // Check all badge triggers
  // Return array of new badges to award
  // Prevents duplicate awards
}
```

### Chat Intent Detection
```typescript
const practiceKeywords = ['practice', 'solve', 'example', 'question', 'problem', 'try', 'test'];
const wantsPractice = practiceKeywords.some(keyword => 
  message.toLowerCase().includes(keyword)
);
```

## Security Patterns

### Authentication
- Firebase Auth required for all operations
- Student documents secured by `studentId` matching auth `uid`
- Callable functions verify `context.auth.uid`

### Data Access
- Students can only access their own data
- Queries filtered by `studentId`
- Conversations isolated per student
- No cross-student data leakage

### API Keys
- OpenAI API key stored in Firebase Functions environment
- Never exposed to client
- Client only calls Firebase Functions, not OpenAI directly

## Performance Considerations

### Firestore Queries
- Indexed queries for `questions` collection
- Composite indexes for multi-field queries
- Real-time listeners unsubscribe on unmount
- Conversation loading optimized with single document fetch

### AI Processing
- Functions handle AI calls server-side
- Results cached in Firestore to avoid re-processing
- Batch operations where possible
- Chat context loading optimized (last 5 sessions)

### Client Optimization
- React hooks memoize expensive calculations
- Components lazy-loaded where appropriate
- Celebration animations use CSS transforms for performance
- Chat messages rendered efficiently with keys

## Error Handling Patterns

### Function Errors
- Try-catch blocks around AI API calls
- Fallback to cached responses if API fails
- Error logged to Firebase Console
- Notification status set to "failed"

### Client Errors
- Error boundaries catch React errors
- Loading states during async operations
- User-friendly error messages
- Retry mechanisms for failed operations
- Chat handles missing sessions gracefully

## Chat-Specific Patterns

### Conversation Management
- One conversation per student (or multiple if needed)
- Conversation ID can be studentId-based or auto-generated
- Messages array with full history
- Real-time sync via Firestore listener

### Practice Question Generation
- Always generates NEW question
- Uses `generateSingleQuestion` from openai-handlers
- Multiple choice format enforced (4 options)
- Topic extracted from message or uses session topic
- Different numbers/scenarios each time

### Answer Validation
- Simple comparison for multiple choice
- AI-generated feedback for explanation
- Visual sparkles animation if correct
- NO gamification updates
