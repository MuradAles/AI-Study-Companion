# Quick Start Guide

Get the AI Study Companion up and running in minutes!

## 🚀 Quick Setup (5 minutes)

### 1. Install Dependencies

```bash
npm install
cd functions && npm install && cd ..
```

### 2. Configure Environment Variables

**Copy `.env.example` to `.env`** and fill in your Firebase credentials:

```bash
# Get these from Firebase Console > Project Settings > General
VITE_FIREBASE_API_KEY=your-api-key-here
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id

# Get VAPID key from Firebase Console > Project Settings > Cloud Messaging
VITE_FIREBASE_VAPID_KEY=your-vapid-key-here

# Set to false for production
VITE_USE_EMULATOR=false
```

**Create `functions/.env`** for OpenAI:

```bash
OPENAI_API_KEY=sk-your-openai-key-here
```

### 3. Enable Firebase Services

1. **Anonymous Authentication:**
   - Firebase Console > Authentication > Sign-in method
   - Enable "Anonymous"

2. **Firestore Database:**
   - Firebase Console > Firestore Database
   - Create database (start in test mode, then deploy rules)

3. **Cloud Messaging:**
   - Firebase Console > Project Settings > Cloud Messaging
   - Generate VAPID key

### 4. Deploy Firestore Rules

```bash
firebase deploy --only firestore:rules
```

### 5. Start Development Server

```bash
npm run dev
```

Visit `http://localhost:5173` and you should see the login screen!

## 🧪 Testing the Application

### Create Test Data

1. **Sign in anonymously** (auto-signs in on first visit)

2. **Open browser console** and run:

```javascript
// Get your user ID
const userId = firebase.auth().currentUser?.uid;

// Import test helper (or use directly)
import { createTestSessions } from './utils/testDataHelper';
createTestSessions(userId);
```

Or manually create a session:

```javascript
// In browser console
import { doc, collection, addDoc, Timestamp } from 'firebase/firestore';
import { db } from './services/firebase';

const userId = firebase.auth().currentUser?.uid;
const sessionData = {
  studentId: userId,
  goalId: 'goal-mathematics',
  subject: 'Mathematics',
  tutorName: 'Dr. Smith',
  transcript: `Tutor: "Today we're working on quadratic equations..."
Student: "I think it's an equation with x squared?"
Tutor: "Exactly! A quadratic equation has the form ax² + bx + c = 0..."
Student: "Oh! -2 and -3?"
Tutor: "Perfect! So (x - 2)(x - 3) = 0. What are the solutions?"
Student: "x = 2 or x = 3!"
Tutor: "Excellent work!"`,
  date: Timestamp.now(),
  status: 'completed',
};

await addDoc(collection(db, 'sessions'), sessionData);
```

3. **Wait for processing** (functions will automatically):
   - Analyze transcript
   - Generate practice questions
   - Schedule questions for tomorrow

4. **Test Practice Interface:**
   - Navigate to `/practice`
   - Answer questions
   - See AI feedback and points

5. **Test Chat:**
   - Navigate to `/chat`
   - Ask questions about your sessions
   - See AI responses

6. **Check Progress:**
   - Navigate to `/progress`
   - See statistics and subject progress

## 🔍 Troubleshooting

### "Missing or insufficient permissions"
- ✅ Deploy Firestore rules: `firebase deploy --only firestore:rules`
- ✅ Enable Anonymous Authentication in Firebase Console

### "OpenAI API error"
- ✅ Add OpenAI API key to `functions/.env`
- ✅ Restart Firebase emulators if using them

### "Notifications not working"
- ✅ Check browser notification permissions
- ✅ Verify VAPID key is set in `.env`
- ✅ Check FCM token is saved (browser console)

### "Functions not triggering"
- ✅ Check function logs: `firebase functions:log`
- ✅ Verify functions are deployed: `firebase deploy --only functions`
- ✅ Check OpenAI API key is configured

## 📱 Testing Notifications

1. **Request permission** (happens automatically on Dashboard load)
2. **Check FCM token** in browser console:
   ```javascript
   // Token should be saved to student document
   // Check Firestore: students/{userId}/fcmToken
   ```
3. **Test notification** (manual trigger):
   ```javascript
   // In Firebase Console > Functions > checkStudentHealthManual
   // Or trigger via code
   ```

## 🎯 Feature Checklist

- [x] Anonymous authentication works
- [x] Dashboard loads student data
- [x] Session creation triggers analysis
- [x] Practice questions generate automatically
- [x] Answer evaluation works
- [x] Chat interface responds
- [x] Progress tracking displays data
- [x] Notifications can be sent
- [x] Cross-sell suggestions appear on goal completion

## 🚀 Production Deployment

See [Deployment Guide](docs/DEPLOYMENT.md) for detailed instructions.

**Quick deploy:**
```bash
npm run build
cd functions && npm run build && cd ..
firebase deploy
```

## 💡 Tips

- Use Firebase Emulators for local development
- Check Firebase Console for real-time function logs
- Use browser DevTools to debug Firestore queries
- Test with multiple anonymous users to see data isolation

## 📚 Additional Resources

- [Firebase Documentation](https://firebase.google.com/docs)
- [OpenAI API Documentation](https://platform.openai.com/docs)
- [React Router Documentation](https://reactrouter.com/)

Happy coding! 🎉

