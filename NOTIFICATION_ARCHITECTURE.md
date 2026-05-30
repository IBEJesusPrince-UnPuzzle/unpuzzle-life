# Push Notification Architecture & Production Issues

## Current Implementation Analysis

### 1. Scheduler Persistence Issue (Render Sleep)

**Problem**: The notification scheduler runs on `setInterval` in `server/index.ts`. On Render's free tier, the web service spins down after 15 minutes of inactivity, causing the timer to freeze entirely.

**Current Code**:
```typescript
// server/index.ts
setInterval(async () => {
  const result = await scheduleNotifications();
}, 60000); // Runs every minute
```

**Impact**: When the instance sleeps, no notifications are sent until the next request wakes the server. This creates unpredictable delivery delays.

### 2. Enhanced Logging Added

**Changes Deployed**:
- Added `[Firebase]` prefix to all Firebase Admin SDK logs
- Log token count before sending
- Log success/failure counts from Firebase response
- Log detailed error information (code, message, details) for each failed token
- Log successful sends per token
- Added `[Scheduler]` prefix to scheduler logs
- Log when scheduler runs and when no notifications are due

**What to Look For in Render Logs**:
```
[Firebase] Sending notification to 1 token(s): Upcoming Task
[Firebase] Response: 0 success, 1 failed
[Firebase] Failed to send to token dHJ5c...: {
  code: 'messaging/invalid-registration-token',
  message: 'The registration token is not a valid FCM registration token'
}
```

**Common Firebase Error Codes**:
- `messaging/invalid-registration-token` - Token expired or invalid
- `messaging/registration-token-not-registered` - Token not registered in Firebase
- `messaging/invalid-recipient` - Invalid recipient
- `messaging/unauthenticated` - Firebase credentials invalid
- `messaging/internal-error` - Firebase internal error
- `messaging/third-party-auth-error` - APNs/FCM credentials issue (iOS)

## Recommended Solutions

### Solution 1: Render Background Worker (Recommended)

**Why**: Dedicated worker that never sleeps, ensuring reliable notification delivery.

**Implementation Steps**:

1. **Create `server/worker.ts`**:
```typescript
import { scheduleNotifications } from './notification-scheduler';
import { initializeFirebaseAdmin } from './firebase-admin';

async function main() {
  console.log('[Worker] Starting notification worker...');
  
  // Initialize Firebase
  initializeFirebaseAdmin();
  
  // Run immediately on start
  await runScheduler();
  
  // Then run every minute
  setInterval(runScheduler, 60000);
}

async function runScheduler() {
  try {
    console.log('[Worker] Running notification check...');
    const result = await scheduleNotifications();
    if (result.total > 0) {
      console.log(`[Worker] Sent ${result.total} notifications`);
    }
  } catch (e) {
    console.error('[Worker] Error:', e);
  }
}

main();
```

2. **Update `package.json`**:
```json
{
  "scripts": {
    "worker": "tsx server/worker.ts"
  }
}
```

3. **Create Render Background Worker**:
   - Go to Render Dashboard
   - Create new "Background Worker"
   - Connect to same repository
   - Build command: `npm install`
   - Start command: `npm run worker`
   - Set same environment variables as web service

4. **Remove setInterval from web service**:
```typescript
// server/index.ts - REMOVE this:
// setInterval(async () => { ... }, 60000);
```

### Solution 2: Keep-Alive Endpoint (Quick Fix)

**Why**: Prevents web service from sleeping by pinging it regularly.

**Implementation**:

1. **Add keep-alive endpoint**:
```typescript
// server/routes.ts
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
```

2. **Set up external cron job**:
   - Use cron-job.org or similar free service
   - Ping `https://your-app.onrender.com/health` every 5 minutes
   - Keeps web service awake

**Limitations**: Still less reliable than dedicated worker, depends on external service.

### Solution 3: Render Cron Jobs (Alternative)

**Why**: Render's native cron job feature.

**Implementation**:
1. Create `render-cron.yaml`:
```yaml
services:
  - type: cron
    name: notification-scheduler
    schedule: "* * * * *"  # Every minute
    command: "npm run worker"
```

**Limitations**: Only available on paid plans.

## APNs Key Requirements for iOS

### Current Status

Your Firebase project likely **does not have APNs keys configured**, which is required for iOS push notifications.

### How to Configure APNs Keys

1. **Generate APNs Key in Apple Developer Portal**:
   - Go to [Apple Developer Portal](https://developer.apple.com/account/)
   - Navigate to: Certificates, Identifiers & Profiles → Keys
   - Click "+" to create a new key
   - Select "Apple Push Notifications service (APNs)"
   - Name it (e.g., "UnPuzzle Life Push")
   - Download the `.p8` file (you can only download once!)

2. **Add APNs Key to Firebase Console**:
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Select your project
   - Go to Project Settings → Cloud Messaging
   - Under "APNs Authentication Key" section:
     - Upload the `.p8` file
     - Enter Key ID (from Apple Developer Portal)
     - Enter Team ID (from Apple Developer Portal)
     - Select development or production environment

3. **Verify Bundle ID**:
   - Your iOS app's Bundle ID must match what's in Apple Developer Portal
   - Ensure Push Notifications capability is enabled in Xcode

### Testing iOS Notifications

After configuring APNs keys:

1. **Test with Firebase Console**:
   - Go to Firebase Console → Cloud Messaging
   - Send a test message to your device token
   - Check if it arrives on iOS device

2. **Check Logs**:
   - If you see `messaging/third-party-auth-error`, APNs keys are misconfigured
   - If you see `messaging/invalid-registration-token`, the device token is stale

## Next Steps

1. **Check Render Logs Now**:
   - Go to Render Dashboard → Your Service → Logs
   - Look for `[Scheduler]` and `[Firebase]` entries
   - Identify the specific error code

2. **Implement Background Worker**:
   - Create `server/worker.ts`
   - Add Render Background Worker service
   - Remove setInterval from web service

3. **Configure APNs Keys**:
   - Generate APNs key in Apple Developer Portal
   - Add to Firebase Console
   - Test with Firebase Console

4. **Monitor Delivery**:
   - Watch Render logs for detailed Firebase responses
   - Verify tokens are being cleaned up properly
   - Check notification arrival on device

## Environment Variables Checklist

Ensure these are set in Render:
- `FIREBASE_PROJECT_ID`
- `FIREBASE_PRIVATE_KEY` (with proper `\n` escaping)
- `FIREBASE_CLIENT_EMAIL`
- `DATABASE_URL` (if using external DB)
- `SESSION_SECRET`
