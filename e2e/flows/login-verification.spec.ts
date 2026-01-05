import { expect, test } from '@playwright/test';

/**
 * Login Verification E2E Test
 * Tests that authenticated users (via stored auth state from global setup)
 * can access protected routes without being redirected
 *
 * Note: This app uses Magic Link auth, so we can't test actual login flow
 * The global-setup.ts uses the Better Auth API directly to authenticate users
 */
test.describe('Login Verification', () => {
  test('authenticated user can access /chat', async ({ page }) => {
    // Uses stored auth state from global setup (free-user.json)
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // Should NOT be redirected to sign-in
    await expect(page).not.toHaveURL(/\/auth\/sign-in/, { timeout: 15000 });

    // Should be on chat page
    await expect(page).toHaveURL(/\/chat/);
  });

  test('authenticated user sees chat interface elements', async ({ page }) => {
    // Use same navigation strategy as first test for consistency
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // Should NOT be redirected
    await expect(page).toHaveURL(/\/chat/);

    // Wait for the chat interface to fully hydrate
    // The textarea appears after React hydration and store initialization
    const textarea = page.locator('textarea[placeholder]').first();
    await expect(textarea).toBeVisible({ timeout: 20000 });
    await expect(textarea).toBeEnabled();
  });
});
