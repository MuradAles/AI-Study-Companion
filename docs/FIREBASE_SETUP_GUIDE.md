# How to Get Firebase Configuration Values

## Step 1: Go to Firebase Console
1. Visit https://console.firebase.google.com/
2. Select your project (or create a new one)

## Step 2: Get Web App Config
1. Click the gear icon ⚙️ next to "Project Overview"
2. Select "Project settings"
3. Scroll down to "Your apps" section
4. If you don't have a web app yet:
   - Click the `</>` icon to add a web app
   - Register your app (you can skip analytics for now)
   - Copy the config values

## Step 3: Copy These Values
You'll see a config object like this:
```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

## Step 4: Update Your .env File
Replace the placeholder values in `.env` with your actual values:

```env
VITE_FIREBASE_API_KEY=AIza... (from apiKey)
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com (from authDomain)
VITE_FIREBASE_PROJECT_ID=your-project (from projectId)
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com (from storageBucket)
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789 (from messagingSenderId)
VITE_FIREBASE_APP_ID=1:123456789:web:abc123 (from appId)
```

## Step 5: Get VAPID Key (for Notifications)
1. Still in Project Settings
2. Go to "Cloud Messaging" tab
3. Scroll to "Web configuration"
4. Under "Web Push certificates", click "Generate key pair"
5. Copy the key and add to `.env`:
   ```env
   VITE_FIREBASE_VAPID_KEY=your-vapid-key-here
   ```

## Step 6: Enable Firestore
1. In Firebase Console, go to "Firestore Database"
2. Click "Create database"
3. Start in test mode (we have security rules already)
4. Choose your location

## Step 7: Restart Dev Server
After updating `.env`:
1. Stop your dev server (Ctrl+C)
2. Run `npm run dev` again

**Important:** Make sure `.env` is in your project root (same level as `package.json`)

