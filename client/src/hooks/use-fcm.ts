import { useEffect, useState } from 'react';
import { requestNotificationPermission, getFcmToken, onPushMessage } from '@/lib/firebase';
import { apiRequest } from '@/lib/queryClient';

export function useFcm() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check current permission
    setPermission(Notification.permission);

    // Listen for permission changes (using interval as fallback since addEventListener isn't universally supported)
    const interval = setInterval(() => {
      setPermission(Notification.permission);
    }, 5000);

    // Listen for incoming push messages when app is in foreground
    const unsubscribe = onPushMessage((payload) => {
      console.log('Push message received in foreground:', payload);
      // You can show an in-app notification here if desired
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, []);

  const requestPermission = async () => {
    setLoading(true);
    try {
      const granted = await requestNotificationPermission();
      setPermission(granted ? 'granted' : 'denied');
      
      if (granted) {
        const fcmToken = await getFcmToken();
        if (fcmToken) {
          setToken(fcmToken);
          // Register token with server
          await fetch('/api/fcm/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token: fcmToken,
              platform: 'web',
              userAgent: navigator.userAgent,
            }),
          });
        }
      }
    } catch (e) {
      console.error('Error requesting notification permission:', e);
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
        body: JSON.stringify({ token }),
      });
      setToken(null);
    } catch (e) {
      console.error('Error unregistering FCM token:', e);
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
