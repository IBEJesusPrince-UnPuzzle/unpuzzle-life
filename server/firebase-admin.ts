import admin from 'firebase-admin';

// Firebase Admin SDK initialization
// Service account credentials should be loaded from environment variables or a config file
// For security, the full service account JSON should be stored in a .env file or secure secret manager

let firebaseApp: admin.app.App | null = null;

export function initializeFirebaseAdmin() {
  if (firebaseApp) return firebaseApp;

  const privateKey = process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    : undefined;

  const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID || 'unpuzzle-life',
    privateKey,
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

  console.log(`[Firebase] Sending notification to ${tokens.length} token(s):`, notification.title);

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

    console.log(`[Firebase] Response: ${response.successCount} success, ${response.failureCount} failed`);

    const invalidTokens: string[] = [];
    response.responses.forEach((r: any, i: number) => {
      if (!r.success) {
        const error = r.error;
        console.error(`[Firebase] Failed to send to token ${tokens[i].substring(0, 20)}...:`, {
          code: error?.code,
          message: error?.message,
          details: error?.details,
        });
        invalidTokens.push(tokens[i]);
      } else {
        console.log(`[Firebase] Successfully sent to token ${tokens[i].substring(0, 20)}...`);
      }
    });

    return {
      success: response.successCount,
      failed: response.failureCount,
      invalidTokens,
    };
  } catch (e: any) {
    console.error('[Firebase] Error sending push notification:', {
      message: e?.message,
      code: e?.code,
      stack: e?.stack,
    });
    return { success: 0, failed: tokens.length, invalidTokens: [] };
  }
}

// Individual token send (matches Admin Tester approach - more reliable for web push)
export async function sendPushNotificationIndividual(
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

  console.log(`[Firebase] Sending notification to ${tokens.length} token(s) individually:`, notification.title);

  let successCount = 0;
  let failureCount = 0;
  const invalidTokens: string[] = [];

  // Send to each token individually (matches Admin Tester approach)
  for (const token of tokens) {
    const message = {
      token,
      notification: {
        title: notification.title,
        body: notification.body,
      },
      data: {
        url: data?.url || '/dashboard',
        ...data,
      },
      webpush: {
        headers: {
          Urgency: 'high',
        },
        notification: {
          title: notification.title,
          body: notification.body,
          icon: options?.iconUrl || '/assets/logo.png',
          image: options?.imageUrl || '',
          requireInteraction: notification.requireInteraction || true,
          actions: options?.actions || [],
        },
      },
    };

    try {
      await app.messaging().send(message);
      successCount++;
      console.log(`[Firebase] Successfully sent to token ${token.substring(0, 20)}...`);
    } catch (error: any) {
      failureCount++;

      // If token is invalid, mark for cleanup
      if (error.code === 'messaging/registration-token-not-registered' ||
          error.code === 'messaging/invalid-argument') {
        invalidTokens.push(token);
        console.error(`[Firebase] Invalid token ${token.substring(0, 20)}...:`, error.code);
      } else {
        console.error(`[Firebase] Failed to send to token ${token.substring(0, 20)}...:`, {
          code: error?.code,
          message: error?.message,
        });
      }
    }
  }

  console.log(`[Firebase] Individual send complete: ${successCount} success, ${failureCount} failed`);

  return {
    success: successCount,
    failed: failureCount,
    invalidTokens,
  };
}
