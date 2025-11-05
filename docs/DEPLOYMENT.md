# Deployment Guide

This guide explains how to deploy the AI Study Companion application to Firebase Hosting.

## Prerequisites

1. **Firebase CLI installed**: `npm install -g firebase-tools`
2. **Firebase project initialized**: Already done (`ai-study-companion-5434e`)
3. **Environment variables configured**: See `.env.example` and `functions/.env`

## Pre-Deployment Checklist

### 1. Environment Variables

**Frontend (`.env`):**
- ✅ `VITE_FIREBASE_API_KEY`
- ✅ `VITE_FIREBASE_AUTH_DOMAIN`
- ✅ `VITE_FIREBASE_PROJECT_ID`
- ✅ `VITE_FIREBASE_STORAGE_BUCKET`
- ✅ `VITE_FIREBASE_MESSAGING_SENDER_ID`
- ✅ `VITE_FIREBASE_APP_ID`
- ✅ `VITE_FIREBASE_VAPID_KEY`
- ✅ `VITE_USE_EMULATOR=false` (should be `false` for production)

**Backend (`functions/.env`):**
- ✅ `OPENAI_API_KEY` - Required for AI features

**Firebase Functions Config (Production):**
```bash
firebase functions:config:set openai.api_key="your-openai-api-key-here"
```

### 2. Build Frontend

```bash
npm run build
```

This creates a `dist/` directory with the production build.

### 3. Build Functions

```bash
cd functions
npm run build
```

This compiles TypeScript to JavaScript in `functions/lib/`.

### 4. Firestore Rules & Indexes

Rules are already deployed. If you need to update:
```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

### 5. Firestore Indexes

Check `firestore.indexes.json` and create any missing indexes if queries fail.

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

**Deploy Hosting only:**
```bash
firebase deploy --only hosting
```

**Deploy Functions only:**
```bash
firebase deploy --only functions
```

**Deploy Functions individually:**
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

## Post-Deployment

### 1. Verify Deployment

- **Hosting URL**: Check Firebase Console > Hosting
- **Functions**: Check Firebase Console > Functions (verify all functions are deployed)
- **Firestore Rules**: Check Firebase Console > Firestore Database > Rules

### 2. Test Features

1. **Authentication**: Sign in anonymously
2. **Dashboard**: Verify student data loads
3. **Practice**: Create test session → verify questions generate
4. **Chat**: Send a message → verify AI response
5. **Progress**: Check progress tracking

### 3. Monitor Functions

```bash
firebase functions:log
```

Or check Firebase Console > Functions > Logs

### 4. Set Up Scheduled Functions

`checkStudentHealthScheduled` runs daily at 10 AM EST. Verify it's scheduled:
- Firebase Console > Functions > checkStudentHealthScheduled

## Troubleshooting

### Functions Not Working

1. Check function logs: `firebase functions:log`
2. Verify environment variables are set:
   ```bash
   firebase functions:config:get
   ```
3. Check OpenAI API key is valid
4. Verify Firestore rules allow function access

### Hosting Not Loading

1. Check `firebase.json` hosting configuration
2. Verify `dist/` directory exists after build
3. Check browser console for errors
4. Verify environment variables are included in build

### Notifications Not Working

1. Verify VAPID key is set in `.env`
2. Check browser notification permissions
3. Verify service worker is registered (`firebase-messaging-sw.js`)
4. Check FCM token is saved to student document

## Environment-Specific Deployments

### Development

Use Firebase Emulators:
```bash
firebase emulators:start
```

Set `VITE_USE_EMULATOR=true` in `.env`

### Staging

Create a separate Firebase project for staging:
```bash
firebase use --add
# Select staging project
firebase deploy
```

### Production

```bash
firebase use default
firebase deploy
```

## Rollback

If deployment fails:

```bash
# Rollback hosting
firebase hosting:rollback

# Rollback functions (requires specific version)
firebase functions:config:unset openai.api_key
firebase deploy --only functions
```

## CI/CD Setup (Optional)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Firebase

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm install
      - run: npm run build
      - run: cd functions && npm install && npm run build
      - uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: '${{ secrets.GITHUB_TOKEN }}'
          firebaseServiceAccount: '${{ secrets.FIREBASE_SERVICE_ACCOUNT }}'
          channelId: live
          projectId: ai-study-companion-5434e
```

## Security Checklist

- ✅ Environment variables not committed to Git
- ✅ Firestore rules restrict access
- ✅ Functions require authentication
- ✅ API keys stored securely
- ✅ CORS configured correctly (if needed)

## Cost Monitoring

Monitor Firebase usage:
- Firebase Console > Usage and billing
- Set up billing alerts
- Review function invocation counts
- Monitor Firestore reads/writes

## Support

For issues:
1. Check Firebase Console for error messages
2. Review function logs
3. Check browser console for client errors
4. Verify all environment variables are set correctly

