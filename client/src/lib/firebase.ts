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

// VAPID key from Firebase Console > Project Settings > Cloud Messaging > Web Push certificates
// This is a placeholder - you need to replace it with your actual VAPID key
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || 'BoQpGC8ceuwRESc3waqxIetE-ZocYUtUcckCucX8Jxk';

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
    // Validate VAPID key before attempting token generation
    if (!VAPID_KEY || VAPID_KEY.length < 40) {
      console.error('Firebase: Invalid or missing VAPID key. Please set VITE_FIREBASE_VAPID_KEY in your .env file or update the hardcoded value in firebase.ts');
      console.error('Current VAPID key length:', VAPID_KEY.length);
      return null;
    }

    // Get the existing service worker registration
    const registration = await navigator.serviceWorker.ready;
    console.log('Firebase: Using existing service worker registration:', registration.scope);

    // Pass the registration to getToken to use our /sw.js instead of default firebase-messaging-sw.js
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    return token;
  } catch (e) {
    console.error('Error getting FCM token:', e);
    if (e instanceof Error && e.message.includes('applicationServerKey')) {
      console.error('Firebase: The VAPID key is invalid. Please get the correct key from Firebase Console:');
      console.error('1. Go to Firebase Console > Project Settings > Cloud Messaging');
      console.error('2. Find "Web Push certificates" section');
      console.error('3. Copy the "VAPID Key" value');
      console.error('4. Set it as VITE_FIREBASE_VAPID_KEY in your .env file');
    }
    return null;
  }
}

export function onPushMessage(callback: (payload: any) => void): () => void {
  if (!messaging) return () => {};

  return onMessage(messaging, callback);
}

export { app, messaging };
