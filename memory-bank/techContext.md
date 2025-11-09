# Technical Context: AI Study Companion

## Tech Stack

### Frontend
- **Framework:** React 19 with TypeScript
- **Build Tool:** Vite
- **State Management:** React Hooks (useState, useEffect, custom hooks)
- **Styling:** CSS (App.css, index.css, component-specific CSS files)
- **Routing:** React Router v7
- **UI Libraries:** None (custom components)

### Backend
- **Platform:** Firebase
  - **Database:** Firestore (NoSQL)
  - **Functions:** Cloud Functions (Node.js 18)
  - **Hosting:** Firebase Hosting
  - **Messaging:** Firebase Cloud Messaging (FCM)
  - **Authentication:** Firebase Auth (Anonymous for dev)

### AI Integration
- **Primary:** OpenAI GPT-4o (for transcript analysis, question generation, chat)
- **Secondary:** GPT-3.5-turbo (for cost optimization where appropriate)
- **API:** OpenAI API v1 (via `openai` npm package)

### Development Tools
- **Package Manager:** npm
- **Linting:** ESLint
- **Type Checking:** TypeScript
- **Version Control:** Git

## Development Setup

### Prerequisites
```bash
Node.js 18+
npm
Firebase CLI
Git
```

### Project Structure
```
ai-study-companion/
├── src/
│   ├── components/
│   │   ├── Dashboard/          # Main dashboard with gamification
│   │   ├── Practice/           # Practice question interface (shared questions)
│   │   ├── Chat/              # AI chat companion
│   │   │   ├── Chat.tsx       # Main chat component
│   │   │   ├── ChatList.tsx   # Conversation list
│   │   │   └── PracticeQuestionCard.tsx # Inline practice questions
│   │   ├── LearningTree/      # Learning tree visualization
│   │   │   ├── LearningTree.tsx # Main tree component with D3.js
│   │   │   └── LearningTree.css # Tree-specific styles
│   │   ├── Progress/          # Progress tracking dashboard
│   │   ├── Session/           # Session creation and detail views
│   │   ├── Login/             # Authentication
│   │   └── Shared/           # Navigation, etc.
│   ├── contexts/
│   │   └── AuthContext.tsx    # Authentication state management
│   ├── hooks/
│   │   ├── usePracticeItems.ts # Hook for shared questions
│   │   ├── useInitializeStudent.ts
│   │   └── useNotifications.ts
│   ├── services/
│   │   └── firebase.ts        # Firebase initialization
│   ├── utils/
│   │   └── testDataHelper.ts  # Test data utilities
│   ├── App.tsx                # Main app with routing
│   └── main.tsx               # Entry point
├── functions/                 # Firebase Functions
│   └── src/
│       ├── index.ts           # Functions entry point
│       ├── openai.ts          # OpenAI client setup
│       ├── openai-handlers.ts # AI processing functions
│       ├── chat.ts            # Chat-specific functions
│       ├── gamification.ts   # Points, levels, badges logic
│       ├── retention.ts      # At-risk student detection
│       └── crosssell.ts      # Cross-sell suggestions
├── public/
│   ├── manifest.json          # PWA manifest
│   └── firebase-messaging-sw.js # Service worker
├── memory-bank/              # Project documentation
├── firebase.json             # Firebase configuration
├── firestore.rules          # Database security rules
└── firestore.indexes.json   # Database indexes
```

### Firebase Configuration

**Required Services:**
- Firestore Database
- Cloud Functions
- Hosting
- Cloud Messaging
- Authentication (Anonymous Auth enabled)

**Firestore Collections:**
- `students/` - Student profiles and gamification data
- `sessions/` - Tutoring session transcripts and AI analysis
- `questions/` - Shared practice questions pool (visible to all students, generated from sessions)
- `practice_items/` - Per-student scheduled practice questions (checkpoint system)
- `user_responses/` - Student answers to shared questions (from `questions` collection)
- `conversations/` - AI chat conversation history (one per student or multiple)
- `notifications/` - Push notification tracking

### Environment Variables

**Local Development (.env in root):**
```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_VAPID_KEY=...
VITE_USE_EMULATOR=false
```

**Firebase Functions (functions/.env):**
```env
OPENAI_API_KEY=... (server-side only)
```

## Dependencies

### Frontend Dependencies
```json
{
  "react": "^19.1.1",
  "react-dom": "^19.1.1",
  "firebase": "^12.5.0",
  "react-router-dom": "^7.9.5",
  "d3": "^7.8.5",
  "@types/d3": "^7.4.3",
  "katex": "^0.16.11",
  "react-katex": "^3.0.1"
}
```

### Firebase Functions Dependencies
```json
{
  "firebase-admin": "^11.x",
  "firebase-functions": "^4.x",
  "openai": "^4.x"
}
```

## API Integration

### OpenAI API Usage

**Endpoints Used:**
- `chat.completions.create()` for all AI operations

**Models:**
- GPT-4o: Transcript analysis, question generation, chat responses
- GPT-3.5-turbo: (Reserved for cost optimization if needed)

**Request Patterns:**
- JSON mode for structured responses (`callOpenAIJSON`)
- System prompts for role definition
- Temperature tuning per use case (0.3-0.7)
- Token limits for cost control

**Key Functions:**
- `analyzeTranscript()` - Session transcript analysis
- `generatePracticeQuestions()` - Creates shared questions
- `generateSingleQuestion()` - Creates single question (for chat)
- `evaluateAnswer()` - Evaluates student answers
- `generateChatResponse()` - Chat conversation responses

### Firebase Functions

**Callable Functions (Client → Server):**
- `evaluateAnswer()` - Client calls with practice data (shared questions)
- `generateChatResponseFunction()` - Client calls with conversation context
- `validateChatAnswer()` - Client calls to validate chat practice question answers
- `generateMoreQuestions()` - Generate similar questions
- `generateQuestionsForTutor()` - Generate exactly 3 questions for specific tutor/subject/difficulty

**Triggered Functions (Firestore Events):**
- `processTranscript()` - Firestore onCreate trigger (sessions)
- `generateQuestions()` - Firestore onUpdate trigger (sessions with aiAnalysis)
- `onGoalCompletion()` - Firestore onUpdate trigger (students/goals)

**Scheduled Functions:**
- `checkStudentHealth()` - Scheduled (daily at 10 AM EST)

## Data Models

### Firestore Schema

**students/{studentId}**
```typescript
{
  studentId: string;
  name: string;
  email?: string;
  firstSessionDate: Timestamp;
  lastActive: Timestamp;
  fcmToken?: string;
  goals: Array<{
    goalId: string;
    subject: string;
    status: 'active' | 'completed' | 'paused';
  }>;
  gamification: {
    totalPoints: number;
    level: number;
    currentStreak: number;
    longestStreak: number;
    lastActivityDate: string; // ISO date string
    badges: string[];
    dailyGoals: {
      date: string;
      target: number;
      completed: number;
      status: 'in_progress' | 'completed';
    };
  };
  crossSellSuggestions?: string[]; // Suggested subjects
}
```

**sessions/{sessionId}**
```typescript
{
  sessionId: string;
  studentId: string;
  goalId: string;
  tutorName: string;
  subject: string;
  date: Timestamp;
  duration?: number;
  transcript: string;
  aiAnalysis?: {
    topicsCovered: string[];
    studentStruggles: string[];
    studentStrengths: string[];
    keyMoments: Array<{
      timestamp: string;
      type: 'confusion' | 'breakthrough' | 'question' | 'explanation';
      note: string;
    }>;
    confidenceLevel: number;
    suggestedTopics: string[];
    processedAt: string;
  };
  processedAt?: Timestamp;
}
```

**questions/{questionId}** (Shared Question Pool)
```typescript
{
  questionId: string;
  subject: string;
  topics: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  text: string;
  correctAnswer: string;
  explanation: string;
  hint: string;
  passage?: string; // For reading comprehension
  // Attribution
  createdBy: string; // studentId
  createdByName: string;
  source: 'session_analysis' | 'user_generated';
  sessionId?: string;
  basedOnQuestionId?: string;
  // Metadata
  createdAt: Timestamp;
  upvotes: number;
  timesAttempted: number;
  timesCorrect: number;
}
```

**conversations/{conversationId}**
```typescript
{
  conversationId: string;
  studentId: string;
  title: string;
  messages: Array<{
    role: 'student' | 'assistant';
    content: string;
    timestamp: Timestamp;
    practiceQuestion?: {
      questionId: string;
      questionText: string;
      topic: string;
      options: string[]; // 4 options (A, B, C, D)
      correctAnswer: string; // 'A', 'B', 'C', or 'D'
    };
    answer?: {
      studentAnswer: string; // 'A', 'B', 'C', or 'D'
      isCorrect: boolean;
      feedback: string;
    };
    suggestions?: {
      type: 'cross_sell' | 'new_subject';
      subjects: string[];
    };
  }>;
  lastMessageAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**user_responses/{responseId}**
```typescript
{
  studentId: string;
  questionId: string; // Reference to questions collection
  studentAnswer: string;
  isCorrect: boolean;
  feedback: string;
  pointsAwarded: number;
  attemptedAt: Timestamp;
}
```

## Technical Constraints

### Firebase Limits
- Firestore: 1M reads/day, 500K writes/day (free tier)
- Functions: 2M invocations/month (free tier)
- Hosting: 10GB bandwidth/month (free tier)
- FCM: Unlimited (free)

### OpenAI Costs
- GPT-4o: ~$0.03 per 1K tokens (input), ~$0.12 per 1K tokens (output)
- GPT-3.5-turbo: ~$0.001 per 1K tokens
- Target: Optimize to ~$2,500/month for 3,000 students

### Performance Targets
- Transcript processing: <2 minutes
- Answer evaluation: <3 seconds
- Chat response: <2 seconds
- System uptime: >99.5%

## Development Workflow

### Local Development
```bash
# Install dependencies
npm install
cd functions && npm install && cd ..

# Start dev server
npm run dev

# Build for production
npm run build

# Lint code
npm run lint
```

### Firebase Deployment
```bash
# Deploy functions
firebase deploy --only functions

# Deploy hosting
firebase deploy --only hosting

# Deploy both
firebase deploy
```

### Testing Strategy
- Unit tests for utility functions (gamification calculations)
- Integration tests for Firebase Functions
- E2E tests for critical user flows
- Manual testing with demo account
- Test data helper utilities available

## Configuration Files

### firebase.json
```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "functions": {
    "source": "functions",
    "runtime": "nodejs18"
  },
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"]
  }
}
```

### firestore.rules
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /students/{studentId} {
      allow read, write: if request.auth != null && request.auth.uid == studentId;
    }
    match /sessions/{sessionId} {
      allow read: if request.auth != null && resource.data.studentId == request.auth.uid;
    }
    match /conversations/{conversationId} {
      allow read, write: if request.auth != null && resource.data.studentId == request.auth.uid;
    }
    // ... more rules
  }
}
```

## Security Considerations

### Authentication
- Firebase Auth required for all operations
- Student documents secured by user ID matching
- Functions verify authentication context
- Anonymous auth for development, email for production

### API Security
- OpenAI API key never exposed to client
- All AI calls happen server-side
- Rate limiting on Firebase Functions
- Input validation on all callable functions

### Data Privacy
- Student data encrypted at rest
- FCM tokens stored securely
- Conversation history private per student
- GDPR compliance considerations

## Monitoring & Analytics

### Firebase Console
- Function logs and errors
- Firestore usage metrics
- Hosting bandwidth tracking
- FCM delivery statistics

### Custom Analytics
- Practice completion rates
- Chat usage patterns
- Gamification engagement metrics
- Notification click-through rates
- Question pool statistics

## Deployment Environments

### Development
- Local Firebase emulator suite
- Mock OpenAI API responses (if needed)
- Test student accounts
- Development Firebase project

### Production
- Firebase Hosting (HTTPS)
- Cloud Functions (serverless)
- Production Firestore database
- Live OpenAI API integration

## Key Implementation Details

### Chat System
- Conversation persistence via Firestore
- Real-time updates via `onSnapshot`
- Context loading optimized (last 5 sessions)
- Subject filtering throughout entire conversation (not just first message)
- Math rendering with KaTeX/LaTeX (`react-katex` library)
- Step-by-step explanation renderer (`StepByStepRenderer` component)
- Fixed layout with proper flexbox behavior (input stays at bottom)
- Proper scrolling behavior (messages container scrolls, input fixed)
- **Practice questions removed** - Chat is for help/clarification only

### Question Pool
- Shared questions collection
- Attribution tracking
- Usage statistics
- All students benefit from shared pool
- Chat generates separate new questions

### Gamification
- Server-side calculation
- Real-time updates via listeners
- Chat questions excluded from gamification (practice questions removed from chat)
- Only practice page questions count

### Code Quality
- All alerts removed from production code
- All console logs removed from production code
- Errors handled silently with appropriate fallbacks
- Clean, production-ready codebase
