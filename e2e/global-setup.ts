import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import type { FullConfig } from '@playwright/test';
import { chromium } from '@playwright/test';

import type { TestUser } from './fixtures/test-users';
import { ALL_TEST_USERS } from './fixtures/test-users';

/**
 * Playwright Global Setup
 * Authenticates all test users via Better Auth API and saves auth state
 *
 * This app uses Better Auth with emailAndPassword enabled on the server,
 * but the UI only shows Magic Link + Google OAuth.
 * We use the API endpoint directly for E2E test authentication.
 *
 * @see https://playwright.dev/docs/auth
 */

const AUTH_DIR = '.playwright/auth';

// Store user IDs for billing setup
const userIds: Map<string, string> = new Map();

/**
 * Authenticate a single user via Better Auth API and save their auth state
 * First tries sign-up (creates user with scrypt password hash), then sign-in
 * Returns the user ID for billing data setup
 */
async function authenticateUser(
  baseURL: string,
  user: TestUser,
  authFile: string,
): Promise<string | null> {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  let userId: string | null = null;

  try {
    // Navigate to the app first to establish origin cookies
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');

    // First try sign-up to create user with scrypt password hash
    const signUpResponse = await page.request.post(`${baseURL}/api/auth/sign-up/email`, {
      data: {
        email: user.email,
        password: user.password,
        name: user.name,
      },
      headers: {
        'Content-Type': 'application/json',
        Origin: baseURL,
        Referer: baseURL,
      },
    });

    // Capture user ID from sign-up response if successful
    if (signUpResponse.ok()) {
      try {
        const signUpData = await signUpResponse.json();
        userId = signUpData.user?.id || null;
      } catch {
        // Ignore JSON parse errors
      }
    }

    // Sign in to get session
    const response = await page.request.post(`${baseURL}/api/auth/sign-in/email`, {
      data: {
        email: user.email,
        password: user.password,
      },
      headers: {
        'Content-Type': 'application/json',
        Origin: baseURL,
        Referer: baseURL,
      },
    });

    if (!response.ok()) {
      const errorBody = await response.text();
      throw new Error(`Auth API failed (${response.status()}): ${errorBody}`);
    }

    // Parse response to check for success and get user ID
    const authResponse = await response.json();
    if (authResponse.error) {
      throw new Error(`Auth error: ${authResponse.error}`);
    }

    // Get user ID from sign-in response if not already captured
    if (!userId && authResponse.user?.id) {
      userId = authResponse.user.id;
    }

    // Navigate to /chat to verify auth and get final cookies
    await page.goto(`${baseURL}/chat`);
    await page.waitForLoadState('networkidle');

    // Verify we're authenticated (should be on /chat, not redirected to sign-in)
    const currentUrl = page.url();
    if (currentUrl.includes('/auth/sign-in')) {
      throw new Error('Authentication failed - redirected to sign-in page');
    }

    // Save storage state (cookies, localStorage)
    await context.storageState({ path: authFile });

    console.error(`✅ Authenticated ${user.tier} user: ${user.email} (ID: ${userId})`);

    // Store user ID for billing setup
    if (userId) {
      userIds.set(user.email, userId);
    }

    return userId;
  } catch (error) {
    console.error(`❌ Failed to authenticate ${user.tier} user: ${user.email}`);
    console.error(error);
    // Create empty auth file to prevent test failures
    fs.writeFileSync(authFile, JSON.stringify({ cookies: [], origins: [] }));
    return null;
  } finally {
    await browser.close();
  }
}

/**
 * Set up billing data for test users using D1 database
 * Creates stripe_customer, payment_method, and subscription records
 */
function setupBillingData(): void {
  console.error('\n💳 Setting up billing data for E2E test users...\n');

  const now = Date.now();
  const futureDate = now + 365 * 24 * 60 * 60 * 1000; // 1 year from now

  for (const user of ALL_TEST_USERS) {
    const userId = userIds.get(user.email);
    if (!userId) {
      console.error(`⚠️ Skipping billing setup for ${user.email} - no user ID`);
      continue;
    }

    const customerId = `cus_e2e_${user.tier}_${Date.now()}`;
    const paymentMethodId = `pm_e2e_${user.tier}_${Date.now()}`;

    try {
      // Create stripe_customer
      const customerSql = `INSERT OR REPLACE INTO stripe_customer (id, user_id, email, name, default_payment_method_id, metadata, created_at, updated_at) VALUES ('${customerId}', '${userId}', '${user.email}', '${user.name}', '${paymentMethodId}', '{"e2e_test":"true"}', ${now}, ${now});`;

      execSync(`npx wrangler d1 execute DB --local --command="${customerSql}"`, {
        stdio: 'pipe',
        encoding: 'utf-8',
      });

      // Create stripe_payment_method
      const paymentSql = `INSERT OR REPLACE INTO stripe_payment_method (id, customer_id, type, card_brand, card_last4, card_exp_month, card_exp_year, is_default, metadata, created_at, updated_at) VALUES ('${paymentMethodId}', '${customerId}', 'card', 'visa', '4242', 12, 2030, 1, '{"e2e_test":"true"}', ${now}, ${now});`;

      execSync(`npx wrangler d1 execute DB --local --command="${paymentSql}"`, {
        stdio: 'pipe',
        encoding: 'utf-8',
      });

      // Create subscription for Pro user
      if (user.tier === 'pro') {
        const subscriptionId = `sub_e2e_pro_${Date.now()}`;
        const subscriptionSql = `INSERT OR REPLACE INTO stripe_subscription (id, customer_id, user_id, status, price_id, quantity, cancel_at_period_end, current_period_start, current_period_end, metadata, version, created_at, updated_at) VALUES ('${subscriptionId}', '${customerId}', '${userId}', 'active', 'price_1Shoc952vWNZ3v8wCuBiKKIA', 1, 0, ${now}, ${futureDate}, '{"e2e_test":"true"}', 1, ${now}, ${now});`;

        execSync(`npx wrangler d1 execute DB --local --command="${subscriptionSql}"`, {
          stdio: 'pipe',
          encoding: 'utf-8',
        });
      }

      console.error(`✅ Billing setup complete for ${user.tier} user: ${user.email}`);
    } catch (error) {
      console.error(`❌ Failed billing setup for ${user.email}:`, error);
    }
  }
}

/**
 * Global setup function - runs before all tests
 */
async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use?.baseURL || 'http://localhost:3000';

  console.error('\n🔐 Setting up E2E authentication via Better Auth API...\n');

  // Ensure auth directory exists
  const authDir = path.resolve(AUTH_DIR);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  // Authenticate each test user sequentially
  // (parallel can cause race conditions with cookie handling)
  for (const user of ALL_TEST_USERS) {
    const authFile = path.join(authDir, `${user.tier}-user.json`);
    await authenticateUser(baseURL, user, authFile);
  }

  // Set up billing data for all authenticated users
  setupBillingData();

  console.error('\n✅ E2E authentication setup complete!\n');
}

export default globalSetup;
