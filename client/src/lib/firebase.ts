import { initializeApp, getApps, getApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, type Messaging } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: "AIzaSyCKJzQifOatyz5SWjM6IAxxqZnYAnbJpiw",
  authDomain: "unpuzzle-life.firebaseapp.com",
  projectId: "unpuzzle-life",
  storageBucket: "unpuzzle-life.firebasestorage.app",
  messagingSenderId: "625746914197",
  appId: "1:625746914197:web:0db36a47fef205d206249c",
  measurementId: "G-HZ48HQ6711"
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
let messaging: Messaging | null = null;

// Only initialize messaging if we're in a browser environment
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  try {
    messaging = getMessaging(app);
  } catch (e) {
    console.warn('Firebase Messaging not available:', e);
  }
}

const VAPID_KEY = 'BoQpGC8ceuwRESc3waqxIetE-ZocYUtUcckCucX8Jxk';

export async function requestNotificationPermission(): Promise<boolean> {
  if (!messaging) return false;

  try {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  } catch (e) {
    console.error('Error requesting notification permission:', e);
    return false;
  }
}

export async function getFcmToken(): Promise<string | null> {
  if (!messaging) return null;

  try {
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    return token;
  } catch (e) {
    console.error('Error getting FCM token:', e);
    return null;
  }
}

export function onPushMessage(callback: (payload: any) => void): () => void {
  if (!messaging) return () => {};

  return onMessage(messaging, callback);
}

export { app, messaging };
