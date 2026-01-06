import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import type { FullConfig } from '@playwright/test';
import { chromium } from '@playwright/test';

import type { TestUser } from './fixtures/test-users';
import { ALL_TEST_USERS } from './fixtures/test-users';

/**
 * Playwright Global Setup
 * Authenticates test users via Better Auth API and saves auth state
 *
 * IMPORTANT: Test users must be created first using the seed script:
 *   pnpm test:e2e:seed
 *
 * This setup only signs in existing users and sets up billing data.
 * It does NOT create new users - run the seed script first.
 *
 * @see https://playwright.dev/docs/auth
 */

const AUTH_DIR = '.playwright/auth';

// Store user IDs for billing setup
const userIds: Map<string, string> = new Map();

/**
 * Authenticate a single user via Better Auth API and save their auth state
 * Signs in existing users - users must be created first via pnpm test:e2e:seed
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
    // ✅ FIX: Increase timeout for slow initial compilation
    await page.goto(baseURL, { timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 60000 });

    // Try sign-up first (creates user if doesn't exist)
    const signUpResponse = await page.request.post(`${baseURL}/api/auth/sign-up/email`, {
      data: {
        email: user.email,
        password: user.password,
        name: user.name,
      },
      headers: {
        'Content-Type': 'application/json',
        'Origin': baseURL,
        'Referer': baseURL,
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
        'Origin': baseURL,
        'Referer': baseURL,
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
    // ✅ FIX: Increase timeout for slow initial compilation
    await page.goto(`${baseURL}/chat`, { timeout: 90000 });
    await page.waitForLoadState('networkidle', { timeout: 90000 });

    // Verify we're authenticated (should be on /chat, not redirected to sign-in)
    const currentUrl = page.url();
    if (currentUrl.includes('/auth/sign-in') || currentUrl.includes('/auth/')) {
      throw new Error(`Authentication failed - redirected to ${currentUrl} instead of staying on /chat`);
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
    // Admin user failure is non-fatal (admin tests are optional)
    // Free and Pro user failures are fatal as most tests require them
    if (user.tier === 'admin') {
      console.error(`⚠️ Admin user auth failed - admin tests will be skipped`);
      return null;
    }
    throw new Error(`Failed to authenticate ${user.tier} user ${user.email}. Tests cannot proceed without valid auth.`);
  } finally {
    await browser.close();
  }
}

/**
 * Set up billing data for test users using D1 database
 * Creates stripe_customer, payment_method, and subscription records
 *
 * Uses INSERT OR IGNORE to avoid overwriting existing data if tests run multiple times.
 * Data is cleaned up by global-teardown.ts after tests complete.
 */
function setupBillingData(): void {
  console.error('\n💳 Setting up billing data for E2E test users...\n');

  // ✅ FIX: Use Unix seconds (10 digits), NOT milliseconds (13 digits)
  // Drizzle's mode: 'timestamp' expects seconds, not milliseconds
  const now = Math.floor(Date.now() / 1000);
  const futureDate = now + 365 * 24 * 60 * 60; // 1 year from now (in seconds)

  // ✅ FIX: Query for an existing price_id from stripe_price table (FK constraint)
  let priceId = 'price_test_e2e';
  try {
    const priceResult = execSync(
      `npx wrangler d1 execute DB --local --command="SELECT id FROM stripe_price LIMIT 1" --json`,
      { stdio: 'pipe', encoding: 'utf-8' },
    );
    const priceData = JSON.parse(priceResult);
    const prices = priceData[0]?.results || [];
    if (prices.length > 0) {
      priceId = prices[0].id;
      console.error(`📋 Using existing price: ${priceId}`);
    } else {
      // Create a test price if none exists
      console.error('📋 No prices found, creating test price...');
      execSync(
        `npx wrangler d1 execute DB --local --command="INSERT OR IGNORE INTO stripe_price (id, product_id, currency, unit_amount, interval_count, type, lookup_key, active, created_at, updated_at) VALUES ('${priceId}', 'prod_test_e2e', 'usd', 5900, 1, 'recurring', 'pro_monthly', 1, ${now}, ${now});"`,
        { stdio: 'pipe', encoding: 'utf-8' },
      );
    }
  } catch {
    console.error('⚠️ Could not query/create price, subscription setup may fail');
  }

  for (const user of ALL_TEST_USERS) {
    const userId = userIds.get(user.email);
    if (!userId) {
      console.error(`⚠️ Skipping billing setup for ${user.email} - no user ID`);
      continue;
    }

    // Use deterministic IDs based on user email to avoid duplicates
    const emailHash = user.email.replace(/[^a-z0-9]/gi, '_');
    const customerId = `cus_e2e_${emailHash}`;
    const paymentMethodId = `pm_e2e_${emailHash}`;

    try {
      // Create stripe_customer - use INSERT OR IGNORE to skip if exists
      const customerSql = `INSERT OR IGNORE INTO stripe_customer (id, user_id, email, name, default_payment_method_id, metadata, created_at, updated_at) VALUES ('${customerId}', '${userId}', '${user.email}', '${user.name}', '${paymentMethodId}', NULL, ${now}, ${now});`;

      execSync(`npx wrangler d1 execute DB --local --command="${customerSql}"`, {
        stdio: 'pipe',
        encoding: 'utf-8',
      });

      // Create stripe_payment_method - use INSERT OR IGNORE
      const paymentSql = `INSERT OR IGNORE INTO stripe_payment_method (id, customer_id, type, card_brand, card_last4, card_exp_month, card_exp_year, is_default, metadata, created_at, updated_at) VALUES ('${paymentMethodId}', '${customerId}', 'card', 'visa', '4242', 12, 2030, 1, NULL, ${now}, ${now});`;

      execSync(`npx wrangler d1 execute DB --local --command="${paymentSql}"`, {
        stdio: 'pipe',
        encoding: 'utf-8',
      });

      // Create subscription for Pro user
      if (user.tier === 'pro') {
        const subscriptionId = `sub_e2e_${emailHash}`;
        // ✅ FIX: Use dynamic priceId (queried from DB) to satisfy FK constraint
        const subscriptionSql = `INSERT OR IGNORE INTO stripe_subscription (id, customer_id, user_id, status, price_id, quantity, cancel_at_period_end, current_period_start, current_period_end, metadata, version, created_at, updated_at) VALUES ('${subscriptionId}', '${customerId}', '${userId}', 'active', '${priceId}', 1, 0, ${now}, ${futureDate}, NULL, 1, ${now}, ${now});`;

        execSync(`npx wrangler d1 execute DB --local --command="${subscriptionSql}"`, {
          stdio: 'pipe',
          encoding: 'utf-8',
        });

        // Create credit balance for Pro user - use INSERT OR IGNORE then UPDATE to reset balance
        const creditBalanceId = `cb_e2e_${emailHash}`;
        const monthlyCredits = 50000; // Pro tier monthly credits
        // ✅ FIX: Removed pay_as_you_go_enabled column (doesn't exist in schema)
        const creditBalanceSql = `INSERT OR IGNORE INTO user_credit_balance (id, user_id, balance, reserved_credits, plan_type, monthly_credits, next_refill_at, version, created_at, updated_at) VALUES ('${creditBalanceId}', '${userId}', ${monthlyCredits}, 0, 'paid', ${monthlyCredits}, ${futureDate}, 1, ${now}, ${now});`;

        execSync(`npx wrangler d1 execute DB --local --command="${creditBalanceSql}"`, {
          stdio: 'pipe',
          encoding: 'utf-8',
        });

        // ✅ FIX: ALWAYS reset credit balance to full on each test run
        // INSERT OR IGNORE doesn't update existing records, so credits get exhausted across runs
        const resetCreditsSql = `UPDATE user_credit_balance SET balance = ${monthlyCredits}, reserved_credits = 0, updated_at = ${now} WHERE user_id = '${userId}';`;
        execSync(`npx wrangler d1 execute DB --local --command="${resetCreditsSql}"`, {
          stdio: 'pipe',
          encoding: 'utf-8',
        });

        // Create user_chat_usage record with Pro tier - use INSERT OR IGNORE
        const usageId = `usage_e2e_${emailHash}`;
        // ✅ FIX: Use Unix seconds (10 digits), NOT milliseconds (13 digits)
        const periodStart = Math.floor(new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime() / 1000);
        const periodEnd = Math.floor(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59).getTime() / 1000);
        const usageSql = `INSERT OR IGNORE INTO user_chat_usage (id, user_id, current_period_start, current_period_end, threads_created, messages_created, custom_roles_created, analysis_generated, subscription_tier, is_annual, version, created_at, updated_at) VALUES ('${usageId}', '${userId}', ${periodStart}, ${periodEnd}, 0, 0, 0, 0, 'pro', 0, 1, ${now}, ${now});`;

        execSync(`npx wrangler d1 execute DB --local --command="${usageSql}"`, {
          stdio: 'pipe',
          encoding: 'utf-8',
        });

        // ✅ FIX: ALWAYS reset usage counters on each test run
        // INSERT OR IGNORE doesn't update existing records, so counters accumulate across runs
        const resetUsageSql = `UPDATE user_chat_usage SET threads_created = 0, messages_created = 0, custom_roles_created = 0, analysis_generated = 0, subscription_tier = 'pro', updated_at = ${now} WHERE user_id = '${userId}';`;
        execSync(`npx wrangler d1 execute DB --local --command="${resetUsageSql}"`, {
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
 * Ensure billing data exists for test users when auth files are already valid
 * Fetches user IDs from the database by email and sets up billing
 */
async function ensureBillingDataFromExistingUsers(_baseURL: string): Promise<void> {
  console.error('\n💳 Ensuring billing data exists for E2E test users...\n');

  for (const user of ALL_TEST_USERS) {
    try {
      // Fetch user ID from database by email
      const result = execSync(
        `npx wrangler d1 execute DB --local --command="SELECT id FROM user WHERE email = '${user.email}'" --json`,
        { stdio: 'pipe', encoding: 'utf-8' },
      );

      const parsed = JSON.parse(result);
      const rows = parsed[0]?.results || [];
      if (rows.length === 0) {
        console.error(`⚠️ User not found in DB: ${user.email} - skipping billing setup`);
        continue;
      }

      const userId = rows[0].id;
      userIds.set(user.email, userId);
    } catch (error) {
      console.error(`⚠️ Failed to fetch user ID for ${user.email}:`, error);
    }
  }

  // Now run billing setup with the fetched user IDs
  if (userIds.size > 0) {
    setupBillingData();
  }
}

/**
 * Check if an auth file is valid (exists and has cookies)
 */
function isAuthFileValid(authFile: string): boolean {
  if (!fs.existsSync(authFile)) {
    return false;
  }
  try {
    const content = fs.readFileSync(authFile, 'utf-8');
    const data = JSON.parse(content);
    // Check if it has cookies array with at least one cookie
    return Array.isArray(data.cookies) && data.cookies.length > 0;
  } catch {
    return false;
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

  // Check if we have valid auth files already
  const requiredUsers = ALL_TEST_USERS.filter(u => u.tier !== 'admin'); // Admin is optional
  const allAuthFilesValid = requiredUsers.every((user) => {
    const authFile = path.join(authDir, `${user.tier}-user.json`);
    return isAuthFileValid(authFile);
  });

  if (allAuthFilesValid) {
    console.error('✅ Valid auth files found - skipping re-authentication');
    console.error('   Run `pnpm test:e2e:seed` if you need to refresh auth state\n');
    // ✅ FIX: Still ensure billing data exists (INSERT OR IGNORE is safe for re-runs)
    // User IDs need to be fetched from DB since we're not authenticating
    await ensureBillingDataFromExistingUsers(baseURL);
    return;
  }

  // Need to authenticate - check if server is available first
  let serverAvailable = false;
  try {
    const response = await fetch(baseURL, { method: 'HEAD' });
    serverAvailable = response.ok || response.status === 307;
  } catch {
    serverAvailable = false;
  }

  if (!serverAvailable) {
    console.error('⚠️ Server not running. Checking for existing auth files...\n');
    // Check if at least free-user auth exists (required for most tests)
    const freeUserAuth = path.join(authDir, 'free-user.json');
    if (isAuthFileValid(freeUserAuth)) {
      console.error('✅ Using existing auth files (server not running for refresh)\n');
      return;
    }
    throw new Error(
      'No valid auth files and server not running.\n'
      + 'Either:\n'
      + '  1. Start the server: pnpm dev\n'
      + '  2. Run seed script: pnpm test:e2e:seed\n'
      + 'Then run tests again.',
    );
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
