import { useEffect, useState } from 'react';
import { requestNotificationPermission, getFcmToken, onPushMessage } from '@/lib/firebase';
import { apiRequest } from '@/lib/queryClient';
import { toast } from '@/hooks/use-toast';

export function useFcm() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [lastSyncedTimezone, setLastSyncedTimezone] = useState<string | null>(null);

  const registerToken = async () => {
    // Skip if we already have a token
    if (token) {
      console.log('useFcm: Token already registered, skipping');
      return;
    }

    console.log('useFcm: Starting FCM token generation...');
    try {
      const fcmToken = await getFcmToken();
      if (fcmToken) {
        console.log('useFcm: FCM Token Successfully Generated:', fcmToken);
        setToken(fcmToken);

        const currentLocalTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const payload = {
          token: fcmToken,
          platform: 'web',
          userAgent: navigator.userAgent,
          timezone: currentLocalTimezone,
        };

        console.log('useFcm: Registering token with server (timezone:', currentLocalTimezone, ')...');
        const response = await fetch('/api/fcm/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          console.log('useFcm: Token successfully registered with server');
          setLastSyncedTimezone(currentLocalTimezone);
          toast({
            title: 'Notifications Enabled',
            description: 'FCM token successfully registered',
            variant: 'default',
          });
        } else {
          console.error('useFcm: Failed to register token with server:', response.status, response.statusText);
          toast({
            title: 'Registration Failed',
            description: `Server returned ${response.status}: ${response.statusText}`,
            variant: 'destructive',
          });
        }
      } else {
        console.error('useFcm: getFcmToken returned null - token generation failed');
        toast({
          title: 'Token Generation Failed',
          description: 'Could not generate FCM token. Check console for details.',
          variant: 'destructive',
        });
      }
    } catch (e) {
      console.error('useFcm: Error retrieving or registering FCM token:', e);
      toast({
        title: 'FCM Error',
        description: e instanceof Error ? e.message : 'Unknown error occurred',
        variant: 'destructive',
      });
    }
  };

  const syncTimezone = async () => {
    if (!token) return;

    const currentLocalTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Skip if timezone hasn't changed
    if (lastSyncedTimezone === currentLocalTimezone) {
      return;
    }

    console.log('useFcm: Timezone changed from', lastSyncedTimezone, 'to', currentLocalTimezone, '- syncing with server');

    try {
      const response = await fetch('/api/fcm/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          token,
          platform: 'web',
          userAgent: navigator.userAgent,
          timezone: currentLocalTimezone,
        }),
      });

      if (response.ok) {
        console.log('useFcm: Timezone successfully synced with server');
        setLastSyncedTimezone(currentLocalTimezone);
      } else {
        console.error('useFcm: Failed to sync timezone:', response.status, response.statusText);
      }
    } catch (e) {
      console.error('useFcm: Error syncing timezone:', e);
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

  // Sync timezone on mount and window focus (user may have traveled)
  useEffect(() => {
    if (!token) return;

    // Sync on mount
    syncTimezone();

    // Sync on window focus
    const handleFocus = () => {
      syncTimezone();
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [token]);

  const requestPermission = async () => {
    setLoading(true);
    console.log('useFcm: Requesting browser notification permission...');
    try {
      const granted = await requestNotificationPermission();
      console.log('useFcm: Permission result:', granted ? 'granted' : 'denied');
      setPermission(granted ? 'granted' : 'denied');

      if (granted) {
        console.log('useFcm: Permission granted, proceeding with token registration...');
        await registerToken();
      } else {
        console.error('useFcm: Permission denied by user');
        toast({
          title: 'Permission Denied',
          description: 'Notification permission was denied. Please enable it in browser settings.',
          variant: 'destructive',
        });
      }
    } catch (e) {
      console.error('useFcm: Error requesting notification permission:', e);
      toast({
        title: 'Permission Error',
        description: e instanceof Error ? e.message : 'Failed to request permission',
        variant: 'destructive',
      });
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
    registerToken,
    unregisterToken,
  };
}
