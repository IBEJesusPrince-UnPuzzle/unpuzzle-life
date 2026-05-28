import { useEffect, useState } from 'react';
import { requestNotificationPermission, getFcmToken, onPushMessage } from '@/lib/firebase';
import { apiRequest } from '@/lib/queryClient';

export function useFcm() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const registerToken = async () => {
    console.log('useFcm: Attempting to retrieve Firebase token...');
    try {
      const fcmToken = await getFcmToken();
      if (fcmToken) {
        console.log('useFcm: Token retrieved. Sending to backend...');
        setToken(fcmToken);
        // Register token with server
        const response = await fetch('/api/fcm/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: fcmToken,
            platform: 'web',
            userAgent: navigator.userAgent,
          }),
        });
        if (response.ok) {
          console.log('useFcm: Token successfully registered with backend');
        } else {
          console.error('useFcm: Failed to register token with backend:', response.status, response.statusText);
        }
      } else {
        console.warn('useFcm: No FCM token retrieved');
      }
    } catch (e) {
      console.error('useFcm: Error retrieving or registering FCM token:', e);
    }
  };

  useEffect(() => {
    console.log('useFcm mounted. Permission status:', Notification.permission);

    // Check current permission
    setPermission(Notification.permission);

    // If permission is already granted, automatically register token
    if (Notification.permission === 'granted') {
      console.log('useFcm: Permission already granted, registering token...');
      registerToken();
    }

    // Listen for permission changes (using interval as fallback since addEventListener isn't universally supported)
    const interval = setInterval(() => {
      const currentPermission = Notification.permission;
      if (currentPermission !== permission) {
        console.log('useFcm: Permission changed from', permission, 'to', currentPermission);
        setPermission(currentPermission);
        if (currentPermission === 'granted') {
          console.log('useFcm: Permission granted, registering token...');
          registerToken();
        }
      }
    }, 5000);

    // Listen for incoming push messages when app is in foreground
    const unsubscribe = onPushMessage((payload) => {
      console.log('useFcm: Push message received in foreground:', payload);
      // You can show an in-app notification here if desired
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [permission]);

  const requestPermission = async () => {
    console.log('useFcm: Requesting notification permission...');
    setLoading(true);
    try {
      const granted = await requestNotificationPermission();
      setPermission(granted ? 'granted' : 'denied');
      console.log('useFcm: Permission request result:', granted ? 'granted' : 'denied');

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
    console.log('useFcm: Unregistering token...');
    try {
      await fetch('/api/fcm/unregister', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      setToken(null);
      console.log('useFcm: Token unregistered');
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
