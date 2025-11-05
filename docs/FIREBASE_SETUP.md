# Firebase Hosting & Cloud Messaging Setup Guide

## Firebase Hosting

Hosting is configured in `firebase.json`:
- **Public directory:** `dist` (Vite build output)
- **SPA routing:** All routes redirect to `/index.html`
- **Emulator port:** 5000

### Deployment Steps

1. Build the React app:
```bash
npm run build
```

2. Deploy to Firebase Hosting:
```bash
firebase deploy --only hosting
```

Or deploy hosting and functions together:
```bash
firebase deploy --only hosting,functions
```

## Firebase Cloud Messaging (FCM)

### Setup Requirements

1. **Get VAPID Key:**
   - Go to Firebase Console → Project Settings → Cloud Messaging
   - Generate a new key pair or use existing Web Push certificates
   - Add to `.env` as `VITE_FIREBASE_VAPID_KEY`

2. **Service Worker:**
   - Located at `public/firebase-messaging-sw.js`
   - Handles background notifications
   - Must be accessible at `/firebase-messaging-sw.js`

3. **Icons:**
   - Create `public/icon-192x192.png` (192x192px)
   - Create `public/icon-512x512.png` (512x512px)
   - Create `public/badge-72x72.png` (72x72px, optional)

### Implementation

The FCM setup is already integrated in `src/services/firebase.ts`:

- `requestNotificationPermission()` - Request permission and get FCM token
- `onForegroundMessage()` - Handle foreground notifications

### Usage Example

```typescript
import { requestNotificationPermission, onForegroundMessage } from './services/firebase';

// Request permission and get token
const token = await requestNotificationPermission();
if (token) {
  // Save token to Firestore for server-side notifications
  await db.collection('students').doc(userId).update({
    fcmToken: token,
    'preferences.notificationsEnabled': true
  });
}

// Listen for foreground messages
onForegroundMessage((payload) => {
  // Show in-app notification
  console.log('Foreground message:', payload);
});
```

### Testing Notifications

1. **Local Testing:**
   - Use Firebase emulator suite
   - Test with different browsers (Chrome, Firefox, Safari)

2. **Production Testing:**
   - Ensure HTTPS is enabled (required for notifications)
   - Test on actual devices
   - Verify notification delivery

## PWA Support

The app includes PWA manifest for installability:
- `public/manifest.json` - PWA configuration
- Linked in `index.html`
- Includes theme color and icons

## Next Steps

1. Create notification icons (192x192, 512x512, 72x72)
2. Configure actual Firebase project ID
3. Get VAPID key from Firebase Console
4. Test notification flow end-to-end

