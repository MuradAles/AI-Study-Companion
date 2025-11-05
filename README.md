# AI Study Companion

An AI-powered study companion that helps students stay engaged between tutoring sessions, prevent churn, and drive cross-subject enrollment.

## 🎯 Overview

The AI Study Companion analyzes tutoring session transcripts, generates personalized practice questions, tracks progress across multiple subjects, and uses gamification to maintain student engagement. Built with React, Firebase, and OpenAI.

## 👨‍🎓 How Students Use the Application

### Getting Started

1. **Sign In**: Students are automatically signed in anonymously when they first visit
2. **Create a Session**: Students can create a tutoring session by:
   - Clicking "Create Your First Session" on the dashboard
   - Entering the subject, tutor name, and session transcript
   - The AI automatically analyzes the transcript and generates practice questions
3. **Practice Questions**: The next day, students can:
   - Answer practice questions in the Practice section
   - Receive immediate AI feedback
   - Earn points, level up, and unlock badges
4. **Chat with AI**: Students can ask questions anytime:
   - Use the Chat interface to get help
   - AI references past sessions for context-aware responses
5. **Track Progress**: View progress across all subjects:
   - See statistics, streaks, and badges
   - Track completion of goals
   - See cross-sell suggestions when goals complete

For detailed instructions, see [USER_GUIDE.md](docs/USER_GUIDE.md).

## ✨ Features

### Core Features

- **📝 Session Analysis** - AI analyzes session transcripts to extract topics, struggles, and strengths
- **❓ Practice Questions** - Auto-generated questions based on session content with AI-powered feedback
- **💬 AI Chat Companion** - 24/7 conversational interface that references past sessions
- **📊 Progress Tracking** - Multi-subject dashboard with visual progress bars and statistics
- **🎮 Gamification** - Points, levels, streaks, badges, and daily goals
- **🔔 Smart Notifications** - Retention automation and cross-sell suggestions
- **📱 Progressive Web App** - Works offline, installable on mobile devices

### Automated Features

- **Retention Automation** - Detects at-risk students (<3 sessions in first week) and sends booking nudges
- **Cross-Sell Suggestions** - Automatically suggests related subjects when goals are completed
- **Daily Health Checks** - Scheduled function runs daily to monitor student engagement

## 🛠️ Tech Stack

- **Frontend:** React 19 + TypeScript + Vite
- **Backend:** Firebase (Firestore, Functions, Hosting, Cloud Messaging)
- **AI:** OpenAI GPT-4 / GPT-3.5-turbo
- **Authentication:** Firebase Anonymous Auth (development) / Email (production)
- **Deployment:** Firebase Hosting

## 📁 Project Structure

```
ai-study-companion/
├── src/
│   ├── components/
│   │   ├── Dashboard/       # Main dashboard with gamification
│   │   ├── Practice/        # Practice question interface
│   │   ├── Chat/           # AI chat companion
│   │   ├── Progress/       # Progress tracking dashboard
│   │   ├── Login/          # Authentication
│   │   └── Shared/         # Navigation, etc.
│   ├── contexts/
│   │   └── AuthContext.tsx # Authentication state management
│   ├── hooks/
│   │   ├── usePracticeItems.ts
│   │   ├── useInitializeStudent.ts
│   │   └── useNotifications.ts
│   ├── services/
│   │   └── firebase.ts     # Firebase initialization
│   └── utils/
│       └── testDataHelper.ts
├── functions/
│   └── src/
│       ├── index.ts        # Firebase Functions entry point
│       ├── openai.ts       # OpenAI client setup
│       ├── openai-handlers.ts # AI processing functions
│       ├── gamification.ts # Points, levels, badges logic
│       ├── retention.ts    # At-risk student detection
│       └── crosssell.ts    # Cross-sell suggestions
├── public/
│   ├── manifest.json       # PWA manifest
│   └── firebase-messaging-sw.js # Service worker
├── firebase.json           # Firebase configuration
├── firestore.rules         # Database security rules
└── firestore.indexes.json  # Database indexes

```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm
- Firebase account and project
- OpenAI API key

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ai-study-companion
   ```

2. **Install dependencies**
   ```bash
   # Frontend
   npm install
   
   # Backend functions
   cd functions
   npm install
   cd ..
   ```

3. **Configure environment variables**

   Create `.env` in project root:
   ```env
   VITE_FIREBASE_API_KEY=your-api-key
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project-id
   VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
   VITE_FIREBASE_APP_ID=your-app-id
   VITE_FIREBASE_VAPID_KEY=your-vapid-key
   VITE_USE_EMULATOR=false
   ```

   Create `functions/.env`:
   ```env
   OPENAI_API_KEY=your-openai-api-key
   ```

4. **Enable Firebase Services**

   - Enable Anonymous Authentication in Firebase Console
   - Enable Firestore Database
   - Enable Cloud Messaging
   - Generate VAPID key for Cloud Messaging

5. **Deploy Firestore Rules**
   ```bash
   firebase deploy --only firestore:rules
   ```

### Development

**Start development server:**
```bash
npm run dev
```

**Start Firebase emulators (optional):**
```bash
firebase emulators:start
```

**Build for production:**
```bash
npm run build
```

## 📚 Documentation

- [Deployment Guide](docs/DEPLOYMENT.md) - Complete deployment instructions
- [Firebase Setup Guide](docs/FIREBASE_SETUP_GUIDE.md) - Getting Firebase credentials
- [OpenAI Setup](docs/OPENAI_SETUP.md) - Configuring OpenAI API key
- [Task Management](.taskmaster/tasks/tasks.json) - Project tasks and progress

## 🔧 Firebase Functions

All functions are deployed to Firebase Cloud Functions:

- `processTranscript` - Analyzes session transcripts (Trigger: session creation)
- `generateQuestions` - Generates practice questions (Trigger: transcript analysis complete)
- `evaluateAnswer` - Evaluates answers and updates gamification (Callable)
- `generateChatResponseFunction` - AI chat responses (Callable)
- `checkStudentHealthScheduled` - Daily retention check (Scheduled: 10 AM EST)
- `checkStudentHealthManual` - Manual health check (Callable)
- `checkSingleStudentHealth` - Single student check (Callable)
- `onGoalCompletion` - Cross-sell trigger (Trigger: goal status change)

## 🎮 Gamification System

- **Points:** Awarded for correct answers, daily goals, streaks
- **Levels:** Calculated from total points (exponential scaling)
- **Streaks:** Daily consecutive activity tracking
- **Badges:** Awarded for milestones (First Answer, Streaks, Daily Goals)
- **Daily Goals:** Complete 3 questions per day for bonus points

## 🔔 Notifications

- **Booking Nudges:** Sent to at-risk students (<3 sessions in first week)
- **Cross-Sell:** Sent when goals are completed
- **Practice Reminders:** (Future feature)
- **Achievement:** (Future feature)

## 📊 Data Models

### Firestore Collections

- `students/{studentId}` - Student profile, goals, gamification data
- `sessions/{sessionId}` - Tutoring session transcripts and analysis
- `practice_items/{practiceId}` - Generated practice questions
- `conversations/{conversationId}` - AI chat conversations
  - `messages/{messageId}` - Individual chat messages
- `notifications/{notificationId}` - User notifications

## 🧪 Testing

Use the test data helper to create sample sessions:

```typescript
import { createTestSessions } from './utils/testDataHelper';

// In browser console:
const userId = firebase.auth().currentUser?.uid;
createTestSessions(userId);
```

## 🚀 Deployment

See [Deployment Guide](docs/DEPLOYMENT.md) for detailed instructions.

**Quick deploy:**
```bash
npm run build
cd functions && npm run build && cd ..
firebase deploy
```

## 📝 License

Private project - All rights reserved

## 🤝 Contributing

This is a private project. For questions or issues, contact the project maintainer.

## 📞 Support

For setup issues, see:
- [Firebase Setup Guide](docs/FIREBASE_SETUP_GUIDE.md)
- [OpenAI Setup](docs/OPENAI_SETUP.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
