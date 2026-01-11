import { expect, test } from '@playwright/test';

/**
 * Authenticated Routes E2E Tests
 * Tests that protected routes are accessible when authenticated
 * Uses stored auth state from global setup
 */
test.describe('Authenticated Routes', () => {
  test('can access /chat when authenticated', async ({ page }) => {
    await page.goto('/chat');

    // Should NOT redirect to sign-in
    await expect(page).not.toHaveURL(/\/auth\/sign-in/);

    // Should be on chat page
    await expect(page).toHaveURL(/\/chat/);
  });

  test('can access pricing page when authenticated', async ({ page }) => {
    await page.goto('/chat/pricing');

    // Should NOT redirect to sign-in
    await expect(page).not.toHaveURL(/\/auth\/sign-in/, { timeout: 10000 });

    // Should be on pricing or chat (some apps redirect from pricing if already subscribed)
    await expect(page).toHaveURL(/\/chat/);
  });

  test('can access billing pages when authenticated', async ({ page }) => {
    // Try accessing billing-related pages
    await page.goto('/chat/billing/subscription-success');

    // Should NOT redirect to sign-in
    await expect(page).not.toHaveURL(/\/auth\/sign-in/, { timeout: 10000 });

    // Should be on billing or chat page
    await expect(page).toHaveURL(/\/chat/);
  });

  test('shows user session info', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // Look for user menu or avatar - the nav-user component shows user info
    const userIndicator = page
      .locator('[data-user-session]')
      .or(page.getByRole('button', { name: /account|profile|user|e2e/i }))
      .or(page.locator('[data-testid="user-menu"]'))
      .or(page.locator('[data-slot="avatar"]'));

    await expect(userIndicator.first()).toBeVisible({ timeout: 15000 });
  });
});

test.describe('Protected Route Redirects', () => {
  // These tests use a fresh context without auth
  test.use({ storageState: { cookies: [], origins: [] } });

  test('redirects unauthenticated users from /chat to sign-in', async ({ page }) => {
    await page.goto('/chat');

    // Should redirect to sign-in
    await expect(page).toHaveURL(/\/auth\/sign-in/, { timeout: 15000 });
  });

  test('redirects unauthenticated users from /chat/pricing to sign-in', async ({ page }) => {
    await page.goto('/chat/pricing');

    // Should redirect to sign-in
    await expect(page).toHaveURL(/\/auth\/sign-in/, { timeout: 15000 });
  });
});
