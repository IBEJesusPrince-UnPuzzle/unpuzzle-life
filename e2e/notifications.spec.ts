import { test, expect } from '@playwright/test';

test.describe('Notification Preferences', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app and login
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Login if needed (adjust based on your auth flow)
    const loginButton = page.locator('button, a').filter({ hasText: /login|sign in/i }).first();
    if (await loginButton.isVisible()) {
      await loginButton.click();
      // Fill in login credentials
      await page.fill('input[type="email"]', 'tab@theesweetesttaboo.com');
      await page.fill('input[type="password"]', process.env.ADMIN_PASSWORD || 'your-password');
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');
    }
  });

  test('should persist notification preferences after navigation', async ({ page }) => {
    // Navigate to Data page
    await page.click('button, a').filter({ hasText: /data|preferences/i }).first();
    await page.waitForLoadState('networkidle');
    
    // Wait for preferences to load
    await page.waitForSelector('[data-testid="notifications-enabled"]', { timeout: 5000 });
    
    // Get initial state
    const initialEnabled = await page.isChecked('[data-testid="notifications-enabled"]');
    const initialTaskMinutes = await page.inputValue('input[type="number"][data-testid="task-reminder-minutes"]');
    
    // Toggle notification enabled
    await page.check('[data-testid="notifications-enabled"]');
    
    // Change task reminder minutes
    await page.fill('input[type="number"][data-testid="task-reminder-minutes"]', '30');
    
    // Save preferences
    await page.click('button').filter({ hasText: /save preferences/i });
    
    // Wait for save to complete
    await page.waitForSelector('text=Preferences saved', { timeout: 5000 });
    
    // Navigate away to Agenda page
    await page.click('button, a').filter({ hasText: /agenda/i }).first();
    await page.waitForLoadState('networkidle');
    
    // Navigate back to Data page
    await page.click('button, a').filter({ hasText: /data|preferences/i }).first();
    await page.waitForLoadState('networkidle');
    
    // Wait for preferences to load
    await page.waitForSelector('[data-testid="notifications-enabled"]', { timeout: 5000 });
    
    // Verify preferences persisted
    const afterEnabled = await page.isChecked('[data-testid="notifications-enabled"]');
    const afterTaskMinutes = await page.inputValue('input[type="number"][data-testid="task-reminder-minutes"]');
    
    expect(afterEnabled).toBe(true);
    expect(afterTaskMinutes).toBe('30');
    
    // Reset to original state
    if (!initialEnabled) {
      await page.uncheck('[data-testid="notifications-enabled"]');
    }
    await page.fill('input[type="number"][data-testid="task-reminder-minutes"]', initialTaskMinutes);
    await page.click('button').filter({ hasText: /save preferences/i });
  });

  test('should save all notification preference fields', async ({ page }) => {
    // Navigate to Data page
    await page.click('button, a').filter({ hasText: /data|preferences/i }).first();
    await page.waitForLoadState('networkidle');
    
    // Wait for preferences to load
    await page.waitForSelector('[data-testid="notifications-enabled"]', { timeout: 5000 });
    
    // Set all notification preferences
    await page.check('[data-testid="notifications-enabled"]');
    await page.fill('input[type="number"][data-testid="task-reminder-minutes"]', '20');
    await page.check('[data-testid="daily-review-enabled"]');
    await page.fill('input[type="time"][data-testid="daily-review-time"]', '10:00');
    await page.check('[data-testid="project-deadline-alerts-enabled"]');
    await page.fill('input[type="number"][data-testid="project-deadline-days-before"]', '2');
    await page.check('[data-testid="stalled-project-alerts-enabled"]');
    await page.fill('input[type="number"][data-testid="stalled-project-days-threshold"]', '14');
    
    // Save preferences
    await page.click('button').filter({ hasText: /save preferences/i });
    await page.waitForSelector('text=Preferences saved', { timeout: 5000 });
    
    // Refresh the page
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Wait for preferences to load
    await page.waitForSelector('[data-testid="notifications-enabled"]', { timeout: 5000 });
    
    // Verify all fields persisted
    expect(await page.isChecked('[data-testid="notifications-enabled"]')).toBe(true);
    expect(await page.inputValue('input[type="number"][data-testid="task-reminder-minutes"]')).toBe('20');
    expect(await page.isChecked('[data-testid="daily-review-enabled"]')).toBe(true);
    expect(await page.inputValue('input[type="time"][data-testid="daily-review-time"]')).toBe('10:00');
    expect(await page.isChecked('[data-testid="project-deadline-alerts-enabled"]')).toBe(true);
    expect(await page.inputValue('input[type="number"][data-testid="project-deadline-days-before"]')).toBe('2');
    expect(await page.isChecked('[data-testid="stalled-project-alerts-enabled"]')).toBe(true);
    expect(await page.inputValue('input[type="number"][data-testid="stalled-project-days-threshold"]')).toBe('14');
  });

  test('should disable notification fields when notifications are disabled', async ({ page }) => {
    // Navigate to Data page
    await page.click('button, a').filter({ hasText: /data|preferences/i }).first();
    await page.waitForLoadState('networkidle');
    
    // Wait for preferences to load
    await page.waitForSelector('[data-testid="notifications-enabled"]', { timeout: 5000 });
    
    // Uncheck notifications enabled
    await page.uncheck('[data-testid="notifications-enabled"]');
    
    // Verify dependent fields are disabled
    expect(await page.isDisabled('input[type="number"][data-testid="task-reminder-minutes"]')).toBe(true);
    expect(await page.isDisabled('[data-testid="daily-review-enabled"]')).toBe(true);
    expect(await page.isDisabled('[data-testid="project-deadline-alerts-enabled"]')).toBe(true);
    expect(await page.isDisabled('[data-testid="stalled-project-alerts-enabled"]')).toBe(true);
  });
});
