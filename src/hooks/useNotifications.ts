import { useEffect, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { requestNotificationPermission, onForegroundMessage } from '../services/firebase';
import { useAuth } from '../contexts/AuthContext';

/**
 * Hook to handle Firebase Cloud Messaging registration and foreground messages
 */
export function useNotifications() {
  const { currentUser } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>('default');

  // Request permission and save token
  useEffect(() => {
    if (!currentUser) return;

    const registerNotifications = async () => {
      try {
        // Check current permission status
        if ('Notification' in window) {
          setPermission(Notification.permission);

          // Request permission if not granted
          if (Notification.permission === 'default') {
            const token = await requestNotificationPermission();
            if (token) {
              setToken(token);
              setPermission('granted');
              
              // Save token to student document
              const studentRef = doc(db, 'students', currentUser.uid);
              await updateDoc(studentRef, {
                fcmToken: token,
              });
            }
          } else if (Notification.permission === 'granted') {
            // Get existing token
            const token = await requestNotificationPermission();
            if (token) {
              setToken(token);
              
              // Update token in student document
              const studentRef = doc(db, 'students', currentUser.uid);
              await updateDoc(studentRef, {
                fcmToken: token,
              });
            }
          }
        }
      } catch (error) {
        // Error registering notifications
      }
    };

    registerNotifications();
  }, [currentUser]);

  // Listen for foreground messages
  useEffect(() => {
    if (!currentUser) return;

    const unsubscribe = onForegroundMessage((payload) => {
      // Show notification if app is in foreground
      if ('Notification' in window && Notification.permission === 'granted') {
        const notification = payload.notification;
        if (notification) {
          new Notification(notification.title || 'AI Study Companion', {
            body: notification.body,
            icon: '/icon-192x192.png',
            badge: '/icon-192x192.png',
          });
        }
      }
    });

    return unsubscribe;
  }, [currentUser]);

  return { token, permission };
}

