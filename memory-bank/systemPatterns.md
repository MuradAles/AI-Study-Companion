# System Patterns: AI Study Companion

## Architecture Overview

```
Tutoring Session (External)
    ↓
Firebase Functions (processTranscript, generateQuestions, evaluateAnswer, checkStudentHealth)
    ↓
Firestore Database (students, sessions, practice_items, conversations, notifications)
    ↓
React Web Application (Dashboard, Practice, Chat, Progress, Gamification)
```

## Key Design Patterns

### 1. Event-Driven Architecture

**Firestore Triggers → Functions → Data Updates**

- Session document created → `processTranscript()` triggered
- Session document updated with `aiAnalysis` → `generateQuestions()` triggered
- Scheduled daily → `checkStudentHealth()` runs
- User action → `evaluateAnswer()` callable function

**Benefits:**
- Automatic processing without manual intervention
- Real-time updates propagate through system
- Decoupled components allow independent scaling

### 2. Real-Time Data Synchronization

**Firestore Listeners → React State Updates**

Components use Firestore's `onSnapshot` listeners for real-time updates:
- `useStudent()` hook listens to student document changes
- `usePracticeItems()` hook listens to practice_items collection queries
- Gamification updates reflect immediately in UI

**Pattern:**
```javascript
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
4. Questions generated based on analysis
5. Practice items scheduled for next day
6. Student interacts with questions
7. Answers evaluated with AI feedback

**Separation of Concerns:**
- Analysis happens server-side (Firebase Functions)
- Questions stored in Firestore for client access
- Evaluation happens on-demand via callable function

### 4. Gamification State Management

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

### 5. Notification System

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

### 6. Cross-Sell Intelligence

**Goal Completion → Subject Mapping → Suggestion**

Mapping logic:
```javascript
const CROSS_SELL_MAP = {
  "SAT Math": ["College Essays", "AP Calculus", "SAT Reading"],
  "Chemistry": ["Physics", "Biology", "AP Chemistry"],
  // ... more mappings
};
```

**Flow:**
1. Goal marked as "complete"
2. Function detects status change
3. Looks up subject in cross-sell map
4. Checks if already notified
5. Creates notification + in-app banner
6. Shows in multi-subject progress view

### 7. Session Context Integration

**Chat Responses Reference Actual Sessions**

AI chat companion loads:
- Last 3 sessions
- Current struggles from `aiAnalysis`
- Recent practice results
- Student goals and subjects

**Response Generation:**
- System prompt includes student context
- AI references specific session timestamps
- Can suggest booking tutor if question too complex
- Tracks conversation history in Firestore

### 8. Practice Scheduling Logic

**Session → Next Day → Scheduled Time**

- Questions generated after session analysis
- `scheduledFor` set to next day at 3pm (15:00)
- Client queries: `where('scheduledFor', '<=', now)`
- Questions appear when scheduled time arrives
- Status tracked: `pending` → `completed` → `skipped`

## Component Relationships

### React Component Hierarchy

```
App
├── Dashboard
│   ├── GamificationHeader (level, points, streak)
│   ├── DailyGoals (progress indicator)
│   ├── PracticeAlert (new questions available)
│   └── ProgressTracker (multi-subject view)
├── PracticeInterface
│   ├── QuestionCard (question display)
│   ├── AnswerInput (text input)
│   ├── FeedbackDisplay (AI feedback)
│   └── CelebrationAnimation (achievements)
├── ChatInterface
│   ├── MessageList (conversation history)
│   ├── MessageInput (user input)
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

**Practice Items:**
```
Firestore practice_items (query) → usePracticeItems() hook → Component state → UI
```

**Gamification:**
```
Student document → useGamification() hook → Calculated values → UI
```

## Key Algorithms

### Level Calculation
```javascript
function calculateLevel(points) {
  const levels = [0, 100, 250, 500, 1000, 2000, 4000, 8000];
  return levels.findIndex(threshold => points < threshold) || 8;
}
```

### Streak Calculation
```javascript
function calculateStreak(lastActivityDate, today) {
  const daysDiff = (today - lastActivityDate) / (1000 * 60 * 60 * 24);
  return daysDiff === 1 ? currentStreak + 1 : 1; // Reset if not consecutive
}
```

### Badge Checking
```javascript
function checkForNewBadges(student, action) {
  // Check all badge triggers
  // Return array of new badges to award
  // Prevents duplicate awards
}
```

## Security Patterns

### Authentication
- Firebase Auth required for all operations
- Student documents secured by `studentId` matching auth `uid`
- Callable functions verify `context.auth.uid`

### Data Access
- Students can only access their own data
- Queries filtered by `studentId`
- No cross-student data leakage

### API Keys
- OpenAI API key stored in Firebase Functions environment
- Never exposed to client
- Client only calls Firebase Functions, not OpenAI directly

## Performance Considerations

### Firestore Queries
- Indexed queries for `practice_items` collection
- Composite indexes for multi-field queries
- Real-time listeners unsubscribe on unmount

### AI Processing
- Functions handle AI calls server-side
- Results cached in Firestore to avoid re-processing
- Batch operations where possible

### Client Optimization
- React hooks memoize expensive calculations
- Components lazy-loaded where appropriate
- Celebration animations use CSS transforms for performance

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

