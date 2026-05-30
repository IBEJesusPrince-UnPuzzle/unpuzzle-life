import { useEffect, useState } from 'react';
import { requestNotificationPermission, getFcmToken, onPushMessage } from '@/lib/firebase';
import { apiRequest } from '@/lib/queryClient';

export function useFcm() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const registerToken = async () => {
    // Skip if we already have a token
    if (token) return;

    try {
      const fcmToken = await getFcmToken();
      if (fcmToken) {
        setToken(fcmToken);
        const payload = {
          token: fcmToken,
          platform: 'web',
          userAgent: navigator.userAgent,
        };
        const response = await fetch('/api/fcm/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          console.error('useFcm: Failed to register token:', response.status);
        }
      }
    } catch (e) {
      console.error('useFcm: Error retrieving or registering FCM token:', e);
    }
  };

  useEffect(() => {
    // Initialize once on mount
    if (initialized) return;

    setPermission(Notification.permission);

    // Only register if permission is already granted
    if (Notification.permission === 'granted') {
      registerToken();
    }

    // Set up push message listener
    const unsubscribe = onPushMessage((payload) => {
      // In-app notification handling if needed
    });

    setInitialized(true);

    return () => {
      unsubscribe();
    };
  }, [initialized, token]);

  const requestPermission = async () => {
    setLoading(true);
    try {
      const granted = await requestNotificationPermission();
      setPermission(granted ? 'granted' : 'denied');

      if (granted) {
        await registerToken();
      }
    } catch (e) {
      console.error('useFcm: Error requesting notification permission:', e);
    } finally {
      setLoading(false);
    }
  };

  const unregisterToken = async () => {
    if (!token) return;
    try {
      await fetch('/api/fcm/unregister', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token }),
      });
      setToken(null);
    } catch (e) {
      console.error('useFcm: Error unregistering FCM token:', e);
    }
  };

  return {
    permission,
    token,
    loading,
    requestPermission,
    unregisterToken,
  };
}
