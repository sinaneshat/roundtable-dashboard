import type { Page } from '@playwright/test';
import { test as base } from '@playwright/test';

import type { TestUser } from './test-users';
import { TEST_USER_ADMIN, TEST_USER_FREE, TEST_USER_PRO } from './test-users';

/**
 * Extended test fixtures with authentication support
 * Following Playwright best practices for auth state management
 */

export type AuthFixtures = {
  /**
   * Login as a specific test user and return authenticated page
   */
  loginAs: (user: TestUser) => Promise<Page>;

  /**
   * Pre-authenticated page for free tier user
   */
  authenticatedPage: Page;

  /**
   * Pre-authenticated page for pro tier user
   */
  proUserPage: Page;

  /**
   * Pre-authenticated page for admin user
   */
  adminPage: Page;
};

/**
 * Login helper function - performs login via UI
 * Uses Better Auth email/password flow
 */
async function performLogin(page: Page, user: TestUser): Promise<void> {
  await page.goto('/auth/sign-in');

  // Wait for page to load
  await page.waitForLoadState('networkidle');

  // Fill email
  const emailInput = page.getByLabel(/email/i).or(page.locator('input[type="email"]'));
  await emailInput.fill(user.email);

  // Fill password
  const passwordInput = page.getByLabel(/password/i).or(page.locator('input[type="password"]'));
  await passwordInput.fill(user.password);

  // Submit form
  const submitButton = page.getByRole('button', { name: /sign in/i });
  await submitButton.click();

  // Wait for redirect to chat (authenticated area)
  await page.waitForURL(/\/chat/, { timeout: 15000 });
}

/**
 * Extended Playwright test with auth fixtures
 */
export const test = base.extend<AuthFixtures>({
  /**
   * Login helper that can be called with any test user
   */

  loginAs: async ({ browser }, use) => {
    const loginAs = async (user: TestUser): Promise<Page> => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await performLogin(page, user);
      return page;
    };
    // eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright's use, not React's
    await use(loginAs);
  },

  /**
   * Pre-authenticated page using free tier user (default)
   * Uses stored auth state when available
   */

  authenticatedPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: '.playwright/auth/free-user.json',
    });
    const page = await context.newPage();

    // Verify auth state is valid, re-login if needed
    await page.goto('/chat');
    const currentUrl = page.url();

    if (currentUrl.includes('/auth/')) {
      // Auth state expired, re-login
      await performLogin(page, TEST_USER_FREE);
      // Save updated state
      await context.storageState({ path: '.playwright/auth/free-user.json' });
    }

    // eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright's use, not React's
    await use(page);
    await context.close();
  },

  /**
   * Pre-authenticated page using pro tier user
   */

  proUserPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: '.playwright/auth/pro-user.json',
    });
    const page = await context.newPage();

    await page.goto('/chat');
    const currentUrl = page.url();

    if (currentUrl.includes('/auth/')) {
      await performLogin(page, TEST_USER_PRO);
      await context.storageState({ path: '.playwright/auth/pro-user.json' });
    }

    // eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright's use, not React's
    await use(page);
    await context.close();
  },

  /**
   * Pre-authenticated page using admin user
   */

  adminPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: '.playwright/auth/admin-user.json',
    });
    const page = await context.newPage();

    await page.goto('/chat');
    const currentUrl = page.url();

    if (currentUrl.includes('/auth/')) {
      await performLogin(page, TEST_USER_ADMIN);
      await context.storageState({ path: '.playwright/auth/admin-user.json' });
    }

    // eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright's use, not React's
    await use(page);
    await context.close();
  },
});

export { expect } from '@playwright/test';
