# Enable Anonymous Authentication

To use the app with test data, you need to enable Anonymous Authentication in Firebase Console.

## Steps:

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Click on **Authentication** in the left sidebar
4. Click on **Sign-in method** tab
5. Find **Anonymous** in the list
6. Click on it and **Enable** it
7. Click **Save**

## Why Anonymous Auth?

- Quick testing without email/password setup
- Each user gets a unique ID automatically
- No need for sign-up forms during development
- Works perfectly with Firestore security rules

## After Enabling:

1. Restart your dev server (`npm run dev`)
2. The app will automatically sign you in anonymously
3. Test data will be created automatically when you first visit the Dashboard

## Production Considerations:

For production, you'll want to add email/password or other authentication methods. Anonymous auth is just for development/testing.

