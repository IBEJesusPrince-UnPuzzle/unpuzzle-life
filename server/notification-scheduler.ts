import { storage } from './storage';
import { sendPushNotification } from './firebase-admin';
import { addMinutes, addDays, parseISO, isBefore, isAfter, format } from 'date-fns';

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

  const users = storage.getAllUsers();
  const now = new Date();
  const allInvalidTokens: string[] = [];

  for (const user of users) {
    // Skip users who have notifications disabled globally
    if (!user.notificationsEnabled) continue;

    const fcmTokens = storage.getFcmTokens(user.id);
    if (fcmTokens.length === 0) continue;

    const tokens = fcmTokens.map(t => t.token);

    // 1. Upcoming task reminders
    if (user.taskReminderMinutes && Number(user.taskReminderMinutes) > 0) {
      const taskResult = await scheduleTaskReminders(user.id, tokens, Number(user.taskReminderMinutes), now, allInvalidTokens);
      result.taskReminders += taskResult;
    }

    // 2. Daily review reminders
    if (user.dailyReviewEnabled && user.dailyReviewTime) {
      const reviewResult = await scheduleDailyReviewReminder(user.id, tokens, user.dailyReviewTime, now, allInvalidTokens);
      result.dailyReviews += reviewResult;
    }

    // 3. Project deadline alerts
    if (user.projectDeadlineAlertsEnabled && user.projectDeadlineDaysBefore) {
      const deadlineResult = await scheduleDeadlineAlerts(user.id, tokens, Number(user.projectDeadlineDaysBefore), now, allInvalidTokens);
      result.deadlineAlerts += deadlineResult;
    }

    // 4. Stalled project alerts
    if (user.stalledProjectAlertsEnabled && user.stalledProjectDaysThreshold) {
      const stalledResult = await scheduleStalledAlerts(user.id, tokens, Number(user.stalledProjectDaysThreshold), now, allInvalidTokens);
      result.stalledAlerts += stalledResult;
    }
  }

  // Clean up invalid tokens from database
  for (const token of allInvalidTokens) {
    storage.deleteFcmTokenByToken(token);
  }

  result.total = result.taskReminders + result.dailyReviews + result.deadlineAlerts + result.stalledAlerts;
  return result;
}

async function scheduleTaskReminders(
  userId: number,
  tokens: string[],
  minutesBefore: number,
  now: Date,
  invalidTokens: string[]
): Promise<number> {
  const agendaWindow = storage.getAgendaWindow(userId,
    format(now, 'yyyy-MM-dd'),
    format(addDays(now, 1), 'yyyy-MM-dd')
  );

  const reminderTime = addMinutes(now, minutesBefore);
  let sent = 0;

  for (const task of agendaWindow) {
    if (task.status !== 'ready') continue;

    const taskDateTime = task.time
      ? parseISO(`${task.startDate}T${task.time}`)
      : parseISO(task.startDate);

    // Check if task is within the reminder window
    if (isBefore(taskDateTime, reminderTime) && isAfter(taskDateTime, now)) {
      const title = task.title || 'Task';
      const response = await sendPushNotification(tokens, {
        title: 'Upcoming Task',
        body: `${title} starts in ${minutesBefore} minutes`,
        tag: `task-${task.id}`,
      }, {
        type: 'task',
        taskId: task.id.toString(),
        url: '/',
      });

      if (response.success) sent++;
      // Track invalid tokens for cleanup
      invalidTokens.push(...response.invalidTokens);
    }
  }

  return sent;
}

async function scheduleDailyReviewReminder(
  userId: number,
  tokens: string[],
  timeStr: string,
  now: Date,
  invalidTokens: string[]
): Promise<number> {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const reminderTime = new Date(now);
  reminderTime.setHours(hours, minutes, 0, 0);

  // Only send if we're within 1 minute of the scheduled time
  const diff = Math.abs(now.getTime() - reminderTime.getTime());
  if (diff > 60000) return 0;

  // Check if daily review was already completed today
  const today = format(now, 'yyyy-MM-dd');
  const weeklyReviews = storage.getWeeklyReviews(userId);
  const todayReview = weeklyReviews.find(r => r.weekOf === today);

  if (todayReview && todayReview.inboxCleared && todayReview.projectsReviewed) {
    return 0; // Already completed today
  }

  const response = await sendPushNotification(tokens, {
    title: 'Daily Review',
    body: 'Time for your daily review',
    tag: 'daily-review',
    requireInteraction: true,
  }, {
    type: 'daily-review',
    url: '/weekly-review',
  });

  // Track invalid tokens for cleanup
  invalidTokens.push(...response.invalidTokens);
  return Number(response.success);
}

async function scheduleDeadlineAlerts(
  userId: number,
  tokens: string[],
  daysBefore: number,
  now: Date,
  invalidTokens: string[]
): Promise<number> {
  const projects = storage.getProjects(userId);
  const alertDate = addDays(now, daysBefore);
  const alertDateStr = format(alertDate, 'yyyy-MM-dd');
  let sent = 0;

  for (const project of projects) {
    if (!project.targetDate || project.status === 'done' || project.status === 'cancelled') continue;

    if (project.targetDate === alertDateStr) {
      const response = await sendPushNotification(tokens, {
        title: 'Project Deadline',
        body: `"${project.title}" is due in ${daysBefore} day${daysBefore > 1 ? 's' : ''}`,
        tag: `deadline-${project.id}`,
      }, {
        type: 'project-deadline',
        projectId: project.id.toString(),
        url: `/projects/${project.id}`,
      });

      if (response.success) sent++;
      // Track invalid tokens for cleanup
      invalidTokens.push(...response.invalidTokens);
    }
  }

  return sent;
}

async function scheduleStalledAlerts(
  userId: number,
  tokens: string[],
  daysThreshold: number,
  now: Date,
  invalidTokens: string[]
): Promise<number> {
  const projects = storage.getProjects(userId);
  const thresholdDate = addDays(now, -daysThreshold);
  const thresholdDateStr = format(thresholdDate, 'yyyy-MM-dd');
  let sent = 0;

  for (const project of projects) {
    if (project.status !== 'stalled' || !project.stalledAt) continue;

    // Check if project has been stalled for exactly the threshold days
    const stalledDate = parseISO(project.stalledAt);
    const stalledDateStr = format(stalledDate, 'yyyy-MM-dd');

    if (stalledDateStr === thresholdDateStr) {
      const response = await sendPushNotification(tokens, {
        title: 'Stalled Project',
        body: `"${project.title}" has been stalled for ${daysThreshold} days`,
        tag: `stalled-${project.id}`,
      }, {
        type: 'stalled-project',
        projectId: project.id.toString(),
        url: `/projects/${project.id}`,
      });

      if (response.success) sent++;
      // Track invalid tokens for cleanup
      invalidTokens.push(...response.invalidTokens);
    }
  }

  return sent;
}
