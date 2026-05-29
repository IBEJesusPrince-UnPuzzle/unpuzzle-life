import admin from 'firebase-admin';

// Firebase Admin SDK initialization
// Service account credentials should be loaded from environment variables or a config file
// For security, the full service account JSON should be stored in a .env file or secure secret manager

let firebaseApp: admin.app.App | null = null;

export function initializeFirebaseAdmin() {
  if (firebaseApp) return firebaseApp;

  const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID || 'unpuzzle-life',
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  };

  if (!serviceAccount.privateKey || !serviceAccount.clientEmail) {
    console.warn('Firebase Admin SDK credentials not fully configured. Push notifications will not work.');
    return null;
  }

  try {
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    return firebaseApp;
  } catch (e) {
    console.error('Error initializing Firebase Admin SDK:', e);
    return null;
  }
}

export function getFirebaseAdmin() {
  if (!firebaseApp) {
    return initializeFirebaseAdmin();
  }
  return firebaseApp;
}

interface PushNotificationResult {
  success: number;
  failed: number;
  invalidTokens: string[];
}

export async function sendPushNotification(
  tokens: string[],
  notification: {
    title: string;
    body: string;
    tag?: string;
    requireInteraction?: boolean;
  },
  data?: Record<string, string>,
  options?: {
    iconUrl?: string;
    imageUrl?: string;
    actions?: Array<{ action: string; title: string }>;
  }
): Promise<PushNotificationResult> {
  const app = getFirebaseAdmin();
  if (!app) {
    console.warn('Firebase Admin not initialized, cannot send push notification');
    return { success: 0, failed: tokens.length, invalidTokens: [] };
  }

  const message: any = {
    notification,
    data,
    tokens,
    webpush: {
      headers: {
        Urgency: 'high',
      },
      notification: {
        title: notification.title,
        body: notification.body,
        icon: options?.iconUrl || '/assets/logo.png',
        image: options?.imageUrl,
        requireInteraction: notification.requireInteraction || true,
        actions: options?.actions || [],
      },
    },
  };

  try {
    const response = await app.messaging().sendEachForMulticast(message);
    return {
      success: response.successCount,
      failed: response.failureCount,
      invalidTokens: response.responses
        .map((r: any, i: number) => {
          if (!r.success) {
            console.error(`Failed to send to token ${tokens[i]}:`, r.error);
            return tokens[i];
          }
          return null;
        })
        .filter(Boolean) as string[],
    };
  } catch (e) {
    console.error('Error sending push notification:', e);
    return { success: 0, failed: tokens.length, invalidTokens: [] };
  }
}
