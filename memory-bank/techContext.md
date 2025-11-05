# Technical Context: AI Study Companion

## Tech Stack

### Frontend
- **Framework:** React 18+ with TypeScript
- **Build Tool:** Vite
- **State Management:** React Hooks (useState, useEffect, custom hooks)
- **Styling:** CSS (App.css, index.css)
- **Routing:** React Router (to be implemented)

### Backend
- **Platform:** Firebase
  - **Database:** Firestore (NoSQL)
  - **Functions:** Cloud Functions (Node.js)
  - **Hosting:** Firebase Hosting
  - **Messaging:** Firebase Cloud Messaging (FCM)

### AI Integration
- **Primary:** OpenAI GPT-4 (for transcript analysis, question generation)
- **Secondary:** GPT-3.5-turbo (for answer evaluation, chat - cost optimization)
- **Fallback:** Claude API (alternative option)

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
│   │   ├── Dashboard/
│   │   ├── Practice/
│   │   ├── Chat/
│   │   ├── Progress/
│   │   ├── Gamification/
│   │   └── Shared/
│   ├── hooks/
│   │   ├── useStudent.js
│   │   ├── usePracticeItems.js
│   │   ├── useGamification.js
│   │   ├── useChat.js
│   │   └── useNotifications.js
│   ├── services/
│   │   ├── firebase.js
│   │   ├── api.js
│   │   └── notifications.js
│   ├── utils/
│   │   ├── gamification.js
│   │   ├── dateHelpers.js
│   │   └── formatting.js
│   ├── App.tsx
│   └── main.tsx
├── functions/ (Firebase Functions)
├── public/
├── .env (local environment variables)
├── firebase.json
├── package.json
└── vite.config.ts
```

### Firebase Configuration

**Required Services:**
- Firestore Database
- Cloud Functions
- Hosting
- Cloud Messaging
- Authentication (for user management)

**Firestore Collections:**
- `students/` - Student profiles and gamification data
- `sessions/` - Tutoring session transcripts and AI analysis
- `practice_items/` - Generated practice questions
- `conversations/` - AI chat conversation history
- `notifications/` - Push notification tracking

### Environment Variables

**Local Development (.env):**
```
REACT_APP_FIREBASE_API_KEY=...
REACT_APP_FIREBASE_AUTH_DOMAIN=...
REACT_APP_FIREBASE_PROJECT_ID=...
REACT_APP_FIREBASE_STORAGE_BUCKET=...
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=...
REACT_APP_FIREBASE_APP_ID=...
```

**Firebase Functions (.env):**
```
OPENAI_API_KEY=... (server-side only)
```

## Dependencies

### Frontend Dependencies
```json
{
  "react": "^18.0.0",
  "react-dom": "^18.0.0",
  "firebase": "^10.0.0",
  "react-router-dom": "^6.0.0" (to be added)
}
```

### Firebase Functions Dependencies
```json
{
  "firebase-admin": "^11.0.0",
  "firebase-functions": "^4.0.0",
  "openai": "^4.0.0"
}
```

## API Integration

### OpenAI API Usage

**Endpoints Used:**
- `chat.completions.create()` for all AI operations

**Models:**
- GPT-4: Transcript analysis, question generation
- GPT-3.5-turbo: Answer evaluation, chat responses (cost optimization)

**Request Patterns:**
- JSON mode for structured responses
- System prompts for role definition
- Temperature tuning per use case (0.3-0.7)
- Token limits for cost control

### Firebase Functions

**Callable Functions:**
- `evaluateAnswer()` - Client calls with practice data
- `generateChatResponse()` - Client calls with conversation context

**Triggered Functions:**
- `processTranscript()` - Firestore onCreate trigger
- `generateQuestions()` - Firestore onUpdate trigger
- `checkStudentHealth()` - Scheduled (daily at 10am)

## Data Models

### Firestore Schema

**students/{studentId}**
```typescript
{
  studentId: string;
  name: string;
  email: string;
  firstSessionDate: Timestamp;
  lastActive: Timestamp;
  fcmToken: string;
  goals: Goal[];
  gamification: GamificationData;
  preferences: Preferences;
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
  duration: number;
  transcript: string;
  aiAnalysis: AIAnalysis;
}
```

**practice_items/{practiceId}**
```typescript
{
  practiceId: string;
  studentId: string;
  sessionId: string;
  goalId: string;
  scheduledFor: Timestamp;
  status: 'pending' | 'completed' | 'skipped';
  questions: Question[];
  responses: Response[];
}
```

## Technical Constraints

### Firebase Limits
- Firestore: 1M reads/day, 500K writes/day (free tier)
- Functions: 2M invocations/month (free tier)
- Hosting: 10GB bandwidth/month (free tier)
- FCM: Unlimited (free)

### OpenAI Costs
- GPT-4: ~$0.03 per 1K tokens
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
firebase deploy --only hosting,functions
```

### Testing Strategy
- Unit tests for utility functions (gamification calculations)
- Integration tests for Firebase Functions
- E2E tests for critical user flows
- Manual testing with demo account

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
    // ... more rules
  }
}
```

## Security Considerations

### Authentication
- Firebase Auth required for all operations
- Student documents secured by user ID matching
- Functions verify authentication context

### API Security
- OpenAI API key never exposed to client
- All AI calls happen server-side
- Rate limiting on Firebase Functions

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

## Deployment Environments

### Development
- Local Firebase emulator suite
- Mock OpenAI API responses
- Test student accounts

### Production
- Firebase Hosting (HTTPS)
- Cloud Functions (serverless)
- Production Firestore database
- Live OpenAI API integration

