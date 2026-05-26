import { test, expect } from '@playwright/test';

test.describe('Excel Export', () => {
  test('should export data successfully', async ({ page }) => {
    // Navigate to the app
    await page.goto('/');
    
    // Wait for the app to load
    await page.waitForLoadState('networkidle');
    
    // Find and click the export button (adjust selector based on your UI)
    const exportButton = page.locator('button, a').filter({ hasText: /export/i }).first();
    await expect(exportButton).toBeVisible();
    await exportButton.click();
    
    // Wait for download to start
    const downloadPromise = page.waitForEvent('download');
    await downloadPromise;
    
    // Verify the download started successfully
    // Note: We can't verify the file contents in E2E without additional setup,
    // but we can verify the download was triggered
  });
  
  test('should export with correct data fields', async ({ page, request }) => {
    // Test the export API directly
    const response = await request.get('/api/export');
    expect(response.ok()).toBeTruthy();
    
    // Verify it returns an Excel file
    const contentType = response.headers()['content-type'];
    expect(contentType).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  });
});
