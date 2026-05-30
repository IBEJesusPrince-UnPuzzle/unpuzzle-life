import { storage } from './storage';
import { sendPushNotificationIndividual } from './firebase-admin';
import { addMinutes, addDays, parseISO, isBefore, isAfter, format } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';

interface NotificationScheduleResult {
  taskReminders: number;
  dailyReviews: number;
  deadlineAlerts: number;
  stalledAlerts: number;
  total: number;
}

export async function scheduleNotifications(): Promise<NotificationScheduleResult> {
  const result: NotificationScheduleResult = {
    taskReminders: 0,
    dailyReviews: 0,
    deadlineAlerts: 0,
    stalledAlerts: 0,
    total: 0,
  };

  const now = new Date();
  const nowIso = now.toISOString();

  // Phase 1: Queue upcoming notifications (deterministic scheduling)
  const users = storage.getAllUsers();
  for (const user of users) {
    if (!user.notificationsEnabled) continue;

    // Queue task reminders
    if (user.taskReminderMinutes && Number(user.taskReminderMinutes) > 0) {
      await queueTaskReminders(user.id, Number(user.taskReminderMinutes), now);
    }

    // Queue daily review (timezone-aware)
    if (user.dailyReviewEnabled && user.dailyReviewTime) {
      await queueDailyReview(user.id, user.dailyReviewTime, now);
    }

    // Queue deadline alerts
    if (user.projectDeadlineAlertsEnabled && user.projectDeadlineDaysBefore) {
      await queueDeadlineAlerts(user.id, Number(user.projectDeadlineDaysBefore), now);
    }

    // Queue stalled alerts
    if (user.stalledProjectAlertsEnabled && user.stalledProjectDaysThreshold) {
      await queueStalledAlerts(user.id, Number(user.stalledProjectDaysThreshold), now);
    }
  }

  // Phase 2: Send pending notifications (idempotent dispatch)
  const pendingNotifications = storage.getPendingNotifications(nowIso);
  const allInvalidTokens: string[] = [];

  for (const notification of pendingNotifications) {
    const fcmTokens = storage.getFcmTokens(notification.userId);
    console.log(`[Scheduler] Processing notification ${notification.id} for user ${notification.userId}, found ${fcmTokens.length} FCM token(s)`);

    if (fcmTokens.length === 0) {
      console.log(`[Scheduler] No FCM tokens found for user ${notification.userId}, marking notification ${notification.id} as failed`);
      storage.markNotificationFailed(notification.id, 'no_tokens');
      continue;
    }

    const tokens = fcmTokens.map(t => t.token);
    console.log(`[Scheduler] Sending to ${tokens.length} token(s) for notification ${notification.id}:`, tokens.map(t => t.substring(0, 20) + '...'));

    const payload = buildNotificationPayload(notification);

    const response = await sendPushNotificationIndividual(tokens, payload.notification, payload.data, payload.options);

    console.log(`[Scheduler] Notification ${notification.id} send result: ${response.success} success, ${response.failed} failed`);

    if (response.success > 0) {
      storage.markNotificationSent(notification.id, nowIso);
      result[getNotificationTypeKey(notification.notificationType)] += response.success;
    } else {
      storage.markNotificationFailed(notification.id, 'send_failed');
      allInvalidTokens.push(...response.invalidTokens);
    }
  }

  // Clean up invalid tokens
  for (const token of allInvalidTokens) {
    storage.deleteFcmTokenByToken(token);
  }

  // Cleanup old notifications (keep 7 days)
  storage.cleanupOldNotifications(7);

  result.total = result.taskReminders + result.dailyReviews + result.deadlineAlerts + result.stalledAlerts;
  return result;
}

// Queue task reminders with deduplication
async function queueTaskReminders(userId: number, minutesBefore: number, now: Date) {
  const agendaWindow = storage.getAgendaWindow(userId,
    format(now, 'yyyy-MM-dd'),
    format(addDays(now, 1), 'yyyy-MM-dd')
  );

  // Get user's timezone from FCM tokens (fallback to UTC if not set)
  const fcmTokens = storage.getFcmTokens(userId);
  const userTimezone = fcmTokens[0]?.timezone || 'UTC';

  for (const task of agendaWindow) {
    if (task.status !== 'ready') continue;

    // Parse task time in user's timezone, then convert to UTC
    let taskDateTime;
    if (task.time) {
      // Parse the local time string in user's timezone
      const localDateTime = parseISO(`${task.startDate}T${task.time}`);
      taskDateTime = fromZonedTime(localDateTime, userTimezone);
    } else {
      // All-day event: use start of day in user's timezone
      const localDateTime = parseISO(task.startDate);
      taskDateTime = fromZonedTime(localDateTime, userTimezone);
    }

    // Check if task is within reminder window
    const reminderWindowEnd = addMinutes(now, minutesBefore);
    if (isAfter(taskDateTime, now) && isBefore(taskDateTime, reminderWindowEnd)) {
      // Deduplication: check if already queued
      const existing = storage.getPendingNotification(userId, 'task_reminder', task.id);
      if (!existing) {
        storage.queueNotification({
          userId,
          notificationType: 'task_reminder',
          entityId: task.id,
          scheduledFor: taskDateTime.toISOString(),
          status: 'pending',
        });
      }
    }
  }
}

// Queue daily review with timezone-aware scheduling
async function queueDailyReview(userId: number, timeStr: string, now: Date) {
  const [hours, minutes] = timeStr.split(':').map(Number);

  // Get user's timezone preference (default to UTC if not set)
  const user = storage.getUserById(userId);
  const userTimezone = (user as any)?.timezone || 'UTC';

  // Calculate next occurrence in user's timezone
  const scheduledTime = getNextDailyReviewTime(hours, minutes, userTimezone, now);
  const scheduledTimeIso = scheduledTime.toISOString();

  // Deduplication: check if already queued for today
  const todayStr = format(scheduledTime, 'yyyy-MM-dd');
  const existing = storage.getPendingNotificationForDate(userId, 'daily_review', todayStr);

  if (existing) {
    // Check if the existing pending row has the correct scheduled time
    // If not, delete it so we can queue the correct time
    if (existing.scheduledFor !== scheduledTimeIso) {
      console.log(`[scheduler] Daily review time changed for user ${userId}: ${existing.scheduledFor} -> ${scheduledTimeIso}, re-queuing`);
      // Delete the stale pending row (we'll queue a new one below)
      storage.deleteNotification(existing.id);
    } else {
      // Existing row is correct, skip
      return;
    }
  }

  // Queue the daily review (either no existing row, or we just deleted a stale one)
  storage.queueNotification({
    userId,
    notificationType: 'daily_review',
    entityId: 0, // No entity ID for daily review
    scheduledFor: scheduledTimeIso,
    status: 'pending',
  });
}

// Queue deadline alerts
async function queueDeadlineAlerts(userId: number, daysBefore: number, now: Date) {
  const projects = storage.getProjects(userId);
  const alertDate = addDays(now, daysBefore);
  const alertDateStr = format(alertDate, 'yyyy-MM-dd');

  for (const project of projects) {
    if (!project.targetDate || project.status === 'done' || project.status === 'cancelled') continue;

    const projectTargetDate = parseISO(project.targetDate);
    const alertDateObj = parseISO(alertDateStr);

    // Check if project deadline is on the alert date
    if (format(projectTargetDate, 'yyyy-MM-dd') === format(alertDateObj, 'yyyy-MM-dd')) {
      // Deduplication: check if already queued
      const existing = storage.getPendingNotification(userId, 'deadline', project.id);
      if (!existing) {
        storage.queueNotification({
          userId,
          notificationType: 'deadline',
          entityId: project.id,
          scheduledFor: alertDateObj.toISOString(),
          status: 'pending',
        });
      }
    }
  }
}

// Queue stalled alerts
async function queueStalledAlerts(userId: number, daysThreshold: number, now: Date) {
  const projects = storage.getProjects(userId);
  const thresholdDate = addDays(now, -daysThreshold);
  const thresholdDateStr = format(thresholdDate, 'yyyy-MM-dd');

  for (const project of projects) {
    if (project.status !== 'stalled' || !project.stalledAt) continue;

    const stalledDate = parseISO(project.stalledAt);
    const thresholdDateObj = parseISO(thresholdDateStr);

    // Check if project has been stalled for exactly the threshold days
    if (format(stalledDate, 'yyyy-MM-dd') === format(thresholdDateObj, 'yyyy-MM-dd')) {
      // Deduplication: check if already queued
      const existing = storage.getPendingNotification(userId, 'stalled', project.id);
      if (!existing) {
        storage.queueNotification({
          userId,
          notificationType: 'stalled',
          entityId: project.id,
          scheduledFor: thresholdDateObj.toISOString(),
          status: 'pending',
        });
      }
    }
  }
}

// Helper: Calculate next daily review time in user's timezone
function getNextDailyReviewTime(hours: number, minutes: number, timezone: string, now: Date): Date {
  // Create date in user's timezone
  const userDate = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  userDate.setHours(hours, minutes, 0, 0);

  // If time has passed today, schedule for tomorrow
  if (userDate < now) {
    userDate.setDate(userDate.getDate() + 1);
  }

  // Convert back to UTC for storage
  return new Date(userDate.toLocaleString('en-US', { timeZone: 'UTC' }));
}

// Helper: Build notification payload from queue record
function buildNotificationPayload(notification: any): any {
  const type = notification.notificationType;
  const entityId = notification.entityId;
  const userId = notification.userId;

  switch (type) {
    case 'task_reminder':
      const task = storage.getAgendaTask(userId, entityId);
      const title = task?.title || 'Task';
      return {
        notification: {
          title: 'Upcoming Task',
          body: `${title} starts soon`,
          tag: `task-${entityId}`,
        },
        data: {
          type: 'task',
          taskId: entityId.toString(),
          url: '/',
        },
        options: {
          iconUrl: '/assets/logo.png',
        },
      };

    case 'daily_review':
      return {
        notification: {
          title: 'Daily Review',
          body: 'Time for your daily review',
          tag: 'daily-review',
          requireInteraction: true,
        },
        data: {
          type: 'daily-review',
          url: '/weekly-review',
        },
        options: {
          iconUrl: '/assets/logo.png',
        },
      };

    case 'deadline':
      const project = storage.getProject(userId, entityId);
      return {
        notification: {
          title: 'Project Deadline',
          body: `"${project?.title}" is due soon`,
          tag: `deadline-${entityId}`,
        },
        data: {
          type: 'project-deadline',
          projectId: entityId.toString(),
          url: `/projects/${entityId}`,
        },
        options: {
          iconUrl: '/assets/logo.png',
        },
      };

    case 'stalled':
      const stalledProject = storage.getProject(userId, entityId);
      return {
        notification: {
          title: 'Stalled Project',
          body: `"${stalledProject?.title}" has been stalled`,
          tag: `stalled-${entityId}`,
        },
        data: {
          type: 'stalled-project',
          projectId: entityId.toString(),
          url: `/projects/${entityId}`,
        },
        options: {
          iconUrl: '/assets/logo.png',
        },
      };

    default:
      return {
        notification: { title: 'Notification', body: 'You have a notification' },
        data: { url: '/' },
      };
  }
}

// Helper: Map notification type to result key
function getNotificationTypeKey(type: string): keyof NotificationScheduleResult {
  switch (type) {
    case 'task_reminder': return 'taskReminders';
    case 'daily_review': return 'dailyReviews';
    case 'deadline': return 'deadlineAlerts';
    case 'stalled': return 'stalledAlerts';
    default: return 'total';
  }
}
