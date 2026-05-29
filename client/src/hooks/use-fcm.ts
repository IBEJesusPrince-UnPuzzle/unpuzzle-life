import { useEffect, useState } from 'react';
import { requestNotificationPermission, getFcmToken, onPushMessage } from '@/lib/firebase';
import { apiRequest } from '@/lib/queryClient';

export function useFcm() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const registerToken = async () => {
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
    setPermission(Notification.permission);

    if (Notification.permission === 'granted') {
      registerToken();
    }

    const interval = setInterval(() => {
      const currentPermission = Notification.permission;
      if (currentPermission !== permission) {
        setPermission(currentPermission);
        if (currentPermission === 'granted') {
          registerToken();
        }
      }
    }, 5000);

    const unsubscribe = onPushMessage((payload) => {
      // In-app notification handling if needed
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [permission]);

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
