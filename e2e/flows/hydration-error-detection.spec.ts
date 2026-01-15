import { expect, test } from '@playwright/test';

/**
 * Hydration Error Detection E2E Tests
 *
 * Verifies that React hydration errors are NOT present on page load.
 * These errors indicate server/client HTML mismatch which causes:
 * - Performance issues (full tree re-render)
 * - UI flashing/flickering
 * - Console errors in development
 *
 * Root causes fixed:
 * 1. ChatInput file input conditional rendering based on loading state
 * 2. isModelsLoading from TanStack Query differing between SSR and client
 */
test.describe('Hydration Error Detection', () => {
  test('chat overview page loads without hydration errors', async ({ page }) => {
    const consoleErrors: string[] = [];

    // Capture console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // Wait for React to fully hydrate
    await page.waitForTimeout(2000);

    // Check for hydration mismatch errors
    const hydrationErrors = consoleErrors.filter(
      error =>
        error.includes('Hydration failed')
        || error.includes('hydration mismatch')
        || error.includes('server rendered HTML didn\'t match')
        || error.includes('Text content does not match'),
    );

    expect(hydrationErrors).toHaveLength(0);
  });

  test('chat input renders file input consistently', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // File input should always be present (hidden but in DOM)
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeAttached({ timeout: 10000 });
  });

  test('chat auto mode toggle renders without disabled attribute mismatch', async ({ page }) => {
    const consoleErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // Auto mode toggle should be visible
    const autoToggle = page.getByRole('radiogroup', { name: /auto/i });
    await expect(autoToggle).toBeVisible({ timeout: 10000 });

    // No hydration errors related to disabled attribute
    const disabledMismatchErrors = consoleErrors.filter(
      error =>
        error.includes('disabled')
        && (error.includes('Hydration') || error.includes('mismatch')),
    );

    expect(disabledMismatchErrors).toHaveLength(0);
  });

  test('multiple page navigations do not cause hydration errors', async ({ page }) => {
    const consoleErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Navigate to chat multiple times (simulates real user behavior)
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // Wait for hydration
    await page.waitForTimeout(2000);

    const hydrationErrors = consoleErrors.filter(
      error =>
        error.includes('Hydration failed')
        || error.includes('hydration mismatch'),
    );

    expect(hydrationErrors).toHaveLength(0);
  });
});
