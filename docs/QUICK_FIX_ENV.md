# Quick Fix: Update Your .env File

## Problem
Your `.env` file still has placeholder values like `your-project-id`. These need to be replaced with your actual Firebase project credentials.

## Solution

### Step 1: Get Your Firebase Config
1. Go to https://console.firebase.google.com/
2. Select your project
3. Click ⚙️ → Project Settings
4. Scroll to "Your apps" → Web app
5. Copy the config values

### Step 2: Update .env File
Open `.env` in your project root and replace these values:

**Find and Replace:**
```env
# BEFORE (placeholder values):
VITE_FIREBASE_API_KEY=your-api-key-here
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
```

**AFTER (your actual values):**
```env
# Example with real values:
VITE_FIREBASE_API_KEY=AIzaSyC1234567890abcdefghijklmnop
VITE_FIREBASE_AUTH_DOMAIN=my-project-12345.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=my-project-12345
VITE_FIREBASE_STORAGE_BUCKET=my-project-12345.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abc123def456
```

### Step 3: Restart Dev Server
After saving `.env`:
1. Stop your dev server (Ctrl+C in terminal)
2. Run `npm run dev` again

### Step 4: Verify
Check browser console - you should see:
- ✅ `Firebase Config:` with your real project ID
- ❌ No warning messages

## Common Issues

**Q: I updated .env but still see the warning?**
- Make sure you saved the file
- Restart the dev server (Vite only reads .env on startup)
- Check that `.env` is in project root (same folder as `package.json`)

**Q: Where do I find these values?**
- Firebase Console → Project Settings → Your apps → Web app config
- See `docs/FIREBASE_SETUP_GUIDE.md` for detailed instructions

**Q: Do I need VAPID key right now?**
- Not required for basic functionality
- Only needed for push notifications
- Can add later

