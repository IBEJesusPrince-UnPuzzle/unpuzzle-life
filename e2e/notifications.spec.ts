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
    await page.locator('button, a').filter({ hasText: /data|preferences/i }).first().click();
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
    await page.locator('button').filter({ hasText: /save preferences/i }).first().click();
    
    // Wait for save to complete
    await page.waitForSelector('text=Preferences saved', { timeout: 5000 });
    
    // Navigate away to Agenda page
    await page.locator('button, a').filter({ hasText: /agenda/i }).first().click();
    await page.waitForLoadState('networkidle');
    
    // Navigate back to Data page
    await page.locator('button, a').filter({ hasText: /data|preferences/i }).first().click();
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
    await page.locator('button').filter({ hasText: /save preferences/i }).first().click();
  });

  test('should save all notification preference fields', async ({ page }) => {
    // Navigate to Data page
    await page.locator('button, a').filter({ hasText: /data|preferences/i }).first().click();
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
    await page.locator('button').filter({ hasText: /save preferences/i }).first().click();
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
    await page.locator('button, a').filter({ hasText: /data|preferences/i }).first().click();
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

test.describe('FCM Token Registration', () => {
  test.beforeEach(async ({ page }) => {
    // Grant notification permissions before navigation
    await page.context().grantPermissions(['notifications']);

    // Navigate to the app and login
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Login if needed
    const loginButton = page.locator('button, a').filter({ hasText: /login|sign in/i }).first();
    if (await loginButton.isVisible()) {
      await loginButton.click();
      await page.fill('input[type="email"]', 'tab@theesweetesttaboo.com');
      const password = process.env.ADMIN_PASSWORD;
      if (!password) {
        throw new Error('ADMIN_PASSWORD environment variable is required for E2E tests');
      }
      await page.fill('input[type="password"]', password);
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');

      // Check for login error
      const loginError = page.locator('text=Login failed');
      if (await loginError.isVisible()) {
        throw new Error('Login failed: Invalid credentials. Check ADMIN_PASSWORD environment variable.');
      }
    }
  });

  test('should grant notification permissions and register FCM token', async ({ page }) => {
    // Navigate to Data page
    await page.goto('/#/data');
    await page.waitForLoadState('networkidle');

    // Click on Data link in sidebar to ensure navigation
    await page.locator('a').filter({ hasText: /data/i }).first().click();
    await page.waitForLoadState('networkidle');

    // Wait for preferences to load
    await page.waitForSelector('[data-testid="notifications-enabled"]', { timeout: 10000 });

    // Enable notifications
    await page.check('[data-testid="notifications-enabled"]');

    // Listen for console logs to detect FCM token generation
    const fcmTokenLogs: string[] = [];
    page.on('console', msg => {
      if (msg.text().includes('FCM') || msg.text().includes('token')) {
        fcmTokenLogs.push(msg.text());
      }
    });

    // Wait for FCM token to be generated (timeout after 10 seconds)
    await page.waitForTimeout(5000);

    // Check if FCM token was logged
    const hasTokenLog = fcmTokenLogs.some(log => log.includes('token') && log.length > 50);
    expect(hasTokenLog).toBeTruthy();

    // Verify the UI shows token registered
    const tokenRegisteredText = await page.locator('text=token registered').count();
    expect(tokenRegisteredText).toBeGreaterThan(0);
  });

  test('should intercept and verify FCM registration API call', async ({ page }) => {
    // Navigate to Data page
    await page.goto('/#/data');
    await page.waitForLoadState('networkidle');

    // Click on Data link in sidebar to ensure navigation
    await page.locator('a').filter({ hasText: /data/i }).first().click();
    await page.waitForLoadState('networkidle');

    // Wait for preferences to load
    await page.waitForSelector('[data-testid="notifications-enabled"]', { timeout: 10000 });

    // Intercept the FCM registration API call
    let registerRequest: any = null;
    page.route('**/api/fcm/register', async route => {
      registerRequest = route.request();
      const response = await route.fetch();
      const body = await response.json();
      // Continue with the request
      route.fulfill({
        status: response.status(),
        body: JSON.stringify(body),
        headers: response.headers(),
      });
    });

    // Enable notifications
    await page.check('[data-testid="notifications-enabled"]');

    // Wait for the API call
    await page.waitForTimeout(3000);

    // Verify the request was made
    expect(registerRequest).not.toBeNull();
    if (registerRequest) {
      expect(registerRequest.method()).toBe('POST');
      const postData = JSON.parse(registerRequest.postData() || '{}');
      expect(postData).toHaveProperty('token');
      expect(postData).toHaveProperty('platform', 'web');
      expect(postData.token.length).toBeGreaterThan(50);
    }
  });

  test('should handle service worker registration without errors', async ({ page }) => {
    // Listen for console errors
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Navigate to Data page
    await page.goto('/#/data');
    await page.waitForLoadState('networkidle');

    // Click on Data link in sidebar to ensure navigation
    await page.locator('a').filter({ hasText: /data/i }).first().click();
    await page.waitForLoadState('networkidle');

    // Wait for preferences to load
    await page.waitForSelector('[data-testid="notifications-enabled"]', { timeout: 10000 });

    // Enable notifications
    await page.check('[data-testid="notifications-enabled"]');

    // Wait for service worker to register
    await page.waitForTimeout(5000);

    // Check for service worker errors
    const swErrors = consoleErrors.filter(err =>
      err.includes('service worker') || err.includes('sw.js') || err.includes('Firebase')
    );

    // Log any errors for debugging
    if (swErrors.length > 0) {
      console.log('Service Worker Errors:', swErrors);
    }

    // Expect no critical service worker errors
    const criticalErrors = swErrors.filter(err =>
      err.includes('Failed to register') || err.includes('not found')
    );
    expect(criticalErrors.length).toBe(0);
  });
});
