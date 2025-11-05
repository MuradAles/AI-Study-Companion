# 🚀 Deployment Checklist

Use this checklist to ensure a smooth deployment of the AI Study Companion.

## Pre-Deployment Checklist

### ✅ Code Quality
- [x] All TypeScript compiles without errors
- [x] No linter errors
- [x] All imports resolved
- [x] No console errors in development

### ✅ Configuration Files
- [x] `firebase.json` configured
- [x] `firestore.rules` written and tested
- [x] `.firebaserc` has correct project ID
- [x] `.env.example` created
- [x] `functions/.env.example` created

### ⏳ Environment Variables (REQUIRED)

**Frontend (`.env`):**
- [ ] `VITE_FIREBASE_API_KEY` - From Firebase Console
- [ ] `VITE_FIREBASE_AUTH_DOMAIN` - Your project.firebaseapp.com
- [ ] `VITE_FIREBASE_PROJECT_ID` - Your project ID
- [ ] `VITE_FIREBASE_STORAGE_BUCKET` - Your project.appspot.com
- [ ] `VITE_FIREBASE_MESSAGING_SENDER_ID` - From Firebase Console
- [ ] `VITE_FIREBASE_APP_ID` - From Firebase Console
- [ ] `VITE_FIREBASE_VAPID_KEY` - Generate from Cloud Messaging
- [ ] `VITE_USE_EMULATOR=false` - Set to false for production

**Backend (`functions/.env`):**
- [ ] `OPENAI_API_KEY` - Required for AI features

**Firebase Functions Config (Production):**
```bash
firebase functions:config:set openai.api_key="your-key-here"
```

### ✅ Firebase Services Enabled
- [x] Firestore Database created
- [x] Anonymous Authentication enabled
- [x] Cloud Messaging configured
- [x] Functions runtime set (Node.js 18)

### ✅ Security Rules
- [x] Firestore rules deployed
- [x] Rules tested and verified
- [x] User-scoped access enforced

## Build Process

### 1. Build Frontend
```bash
npm run build
```

**Expected Output:**
- `dist/` directory created
- Static assets bundled
- No build errors

### 2. Build Functions
```bash
cd functions
npm run build
cd ..
```

**Expected Output:**
- `functions/lib/` directory created
- JavaScript files compiled from TypeScript
- No compilation errors

### 3. Verify Builds
```bash
# Check frontend build
ls dist/index.html

# Check functions build
ls functions/lib/index.js
```

## Deployment Steps

### Option 1: Deploy Everything
```bash
firebase deploy
```

This deploys:
- Hosting (React app)
- Functions
- Firestore rules
- Firestore indexes

### Option 2: Deploy Separately

**Hosting only:**
```bash
firebase deploy --only hosting
```

**Functions only:**
```bash
firebase deploy --only functions
```

**Specific functions:**
```bash
firebase deploy --only functions:processTranscript
firebase deploy --only functions:generateQuestions
firebase deploy --only functions:evaluateAnswer
firebase deploy --only functions:generateChatResponseFunction
firebase deploy --only functions:checkStudentHealthScheduled
firebase deploy --only functions:checkStudentHealthManual
firebase deploy --only functions:checkSingleStudentHealth
firebase deploy --only functions:onGoalCompletion
```

## Post-Deployment Verification

### 1. Check Deployment Status
```bash
firebase hosting:channel:list
firebase functions:list
```

### 2. Verify Hosting URL
- Visit your Firebase Hosting URL
- Check Firebase Console > Hosting
- Verify app loads correctly

### 3. Test Features

**Authentication:**
- [ ] Anonymous sign-in works
- [ ] Student document created automatically

**Session Processing:**
- [ ] Create test session
- [ ] Verify `processTranscript` triggers
- [ ] Check transcript analysis appears

**Practice Questions:**
- [ ] Verify `generateQuestions` triggers
- [ ] Check questions appear in `/practice`
- [ ] Test answer submission
- [ ] Verify feedback appears

**Chat:**
- [ ] Send message in `/chat`
- [ ] Verify AI response generates
- [ ] Check conversation history saves

**Progress:**
- [ ] View `/progress` page
- [ ] Verify statistics display
- [ ] Check subject progress bars

**Notifications:**
- [ ] Permission requested on Dashboard
- [ ] FCM token saved to student document
- [ ] Test notification delivery

### 4. Monitor Functions

**Check Logs:**
```bash
firebase functions:log
```

**Or Firebase Console:**
- Functions > Logs
- Check for errors
- Verify function invocations

### 5. Verify Scheduled Functions

**Check `checkStudentHealthScheduled`:**
- Firebase Console > Functions
- Verify it's scheduled for 10 AM EST daily
- Check execution history

## Troubleshooting

### Build Fails
- Check Node.js version (need 18+)
- Verify all dependencies installed
- Check TypeScript configuration
- Review error messages

### Deployment Fails
- Verify Firebase CLI is logged in: `firebase login`
- Check project ID matches: `firebase use`
- Verify billing enabled (for Functions)
- Check function quotas

### Functions Not Working
- Verify OpenAI API key is set
- Check function logs for errors
- Verify Firestore rules allow function access
- Check function runtime (Node.js 18)

### App Not Loading
- Verify environment variables are set
- Check browser console for errors
- Verify Firebase config values
- Check CORS settings (if needed)

### Notifications Not Working
- Verify VAPID key is set
- Check browser notification permissions
- Verify FCM token is saved
- Check service worker registration

## Rollback Plan

If deployment has issues:

```bash
# Rollback hosting
firebase hosting:rollback

# Rollback functions (requires version)
firebase functions:config:unset openai.api_key
firebase deploy --only functions
```

## Success Criteria

✅ All features work in production  
✅ Functions trigger correctly  
✅ Notifications deliver  
✅ No console errors  
✅ Performance is acceptable  
✅ Security rules enforced  

## Next Steps After Deployment

1. Monitor function logs for 24 hours
2. Track user engagement metrics
3. Review Firebase Console usage
4. Optimize based on real usage
5. Plan next iteration

---

**Ready to deploy?** Follow the steps above and you'll be live in minutes! 🚀

