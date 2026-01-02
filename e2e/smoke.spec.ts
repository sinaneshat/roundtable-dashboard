import { expect, test } from '@playwright/test';

/**
 * Smoke Tests - Basic App Functionality Checks
 * These run first to catch fundamental issues before running full suite
 *
 * Uses chromium-no-auth project (no stored auth state)
 */
test.describe('Smoke Tests', () => {
  test('homepage loads successfully', async ({ page }) => {
    const response = await page.goto('/');

    // Verify page loads without server errors
    expect(response?.status()).toBeLessThan(500);

    // Check that the page has basic content
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('auth pages are accessible', async ({ page }) => {
    // Sign in page
    await page.goto('/auth/sign-in');
    await expect(page).toHaveURL('/auth/sign-in');

    // Verify auth form elements exist (Google button + Continue with Email)
    const googleButton = page.getByRole('button', { name: /google/i });
    await expect(googleButton).toBeVisible();

    // Sign up page
    await page.goto('/auth/sign-up');
    await expect(page).toHaveURL('/auth/sign-up');
  });

  test('static pages load correctly', async ({ page }) => {
    // Terms page
    const termsResponse = await page.goto('/terms');
    expect(termsResponse?.status()).toBeLessThan(500);
    await expect(page).toHaveURL('/terms');

    // Privacy page
    const privacyResponse = await page.goto('/privacy');
    expect(privacyResponse?.status()).toBeLessThan(500);
    await expect(page).toHaveURL('/privacy');
  });

  test('API health check', async ({ page }) => {
    // Check if API is responding
    const response = await page.goto('/api/v1/system/health');

    // API should respond with 200 or similar success
    expect(response?.status()).toBeLessThan(500);
  });
});

test.describe('Critical Path Smoke', () => {
  test('protected routes redirect to auth', async ({ page }) => {
    await page.goto('/chat');

    // Should redirect to sign-in for unauthenticated users
    await expect(page).toHaveURL(/\/auth\/sign-in/, { timeout: 10000 });
  });

  test('sign-in page has auth options', async ({ page }) => {
    await page.goto('/auth/sign-in');

    // Verify page has Google OAuth button
    await expect(page.getByRole('button', { name: /google/i })).toBeVisible();

    // Verify page has "Continue with Email" button for magic link
    await expect(page.getByRole('button', { name: /continue with email/i })).toBeVisible();
  });
});
