# Quick Fix: Enable Anonymous Authentication

## Current Error
```
auth/admin-restricted-operation
```

This means Anonymous Authentication is **disabled** in Firebase Console.

## Visual Guide

### Step 1: Open Firebase Console
1. Go to: **https://console.firebase.google.com/**
2. Make sure you're logged in with the correct Google account

### Step 2: Select Your Project
- Click on your project name (should be visible in the top left or project list)

### Step 3: Navigate to Authentication
1. Look at the **left sidebar**
2. Find **"Authentication"** (it has a lock icon 🔒)
3. Click on it

### Step 4: Enable Anonymous Sign-in
1. You should see tabs at the top: "Users", "Sign-in method", etc.
2. Click on **"Sign-in method"** tab
3. Scroll down or look for **"Anonymous"** in the list of providers
4. Click on **"Anonymous"** (it might say "Disabled" next to it)
5. Click the **"Enable"** toggle/button at the top
6. Click **"Save"**

### Step 5: Refresh Your App
- Go back to your app
- Press **Ctrl+Shift+R** (hard refresh) or **Ctrl+F5**
- The error should disappear

## Still Not Working?

If you can't find "Anonymous" in the list:
1. Make sure you're in the correct Firebase project
2. Check that you have the right permissions (you need to be a project owner/editor)
3. Try refreshing the Firebase Console page

## Alternative: Use Email/Password Auth

If you prefer not to use Anonymous Auth, we can switch to email/password authentication instead. Let me know if you want to do that instead.

