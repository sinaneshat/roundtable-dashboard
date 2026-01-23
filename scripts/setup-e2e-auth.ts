#!/usr/bin/env tsx
/**
 * E2E Auth Setup Script
 * Creates test users, authenticates them, and saves auth state for Playwright
 * Run this before running e2e tests
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { chromium } from '@playwright/test';

const AUTH_DIR = '.playwright/auth';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

interface TestUser {
  email: string;
  password: string;
  name: string;
  tier: 'free' | 'pro' | 'admin';
}

const TEST_USERS: TestUser[] = [
  {
    email: 'e2e-free-test@roundtable.now',
    password: 'E2ETestPass123!',
    name: 'E2E Free Test User',
    tier: 'free',
  },
  {
    email: 'e2e-pro-test@roundtable.now',
    password: 'E2ETestPass123!',
    name: 'E2E Pro Test User',
    tier: 'pro',
  },
  {
    email: 'e2e-admin-test@roundtable.now',
    password: 'E2ETestPass123!',
    name: 'E2E Admin Test User',
    tier: 'admin',
  },
];

async function setupAuthForUser(user: TestUser): Promise<string | null> {
  console.log(`\n🔐 Setting up auth for ${user.tier} user: ${user.email}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  let userId: string | null = null;

  try {
    // Navigate to app
    await page.goto(BASE_URL, { timeout: 30000 });
    await page.waitForLoadState('networkidle');

    // Try sign-up
    console.log('  Attempting sign-up...');
    const signUpResponse = await page.request.post(`${BASE_URL}/api/auth/sign-up/email`, {
      data: {
        email: user.email,
        password: user.password,
        name: user.name,
      },
      headers: {
        'Content-Type': 'application/json',
        'Origin': BASE_URL,
        'Referer': BASE_URL,
      },
    });

    if (signUpResponse.ok()) {
      const data = await signUpResponse.json();
      userId = data.user?.id || null;
      console.log(`  ✅ Sign-up successful (ID: ${userId})`);
    } else {
      const status = signUpResponse.status();
      if (status === 400 || status === 409) {
        console.log('  ⚠️  User already exists, proceeding to sign-in');
      } else {
        const error = await signUpResponse.text();
        console.log(`  ❌ Sign-up failed (${status}): ${error}`);
      }
    }

    // Sign in
    console.log('  Attempting sign-in...');
    const signInResponse = await page.request.post(`${BASE_URL}/api/auth/sign-in/email`, {
      data: {
        email: user.email,
        password: user.password,
      },
      headers: {
        'Content-Type': 'application/json',
        'Origin': BASE_URL,
        'Referer': BASE_URL,
      },
    });

    if (!signInResponse.ok()) {
      const error = await signInResponse.text();
      throw new Error(`Sign-in failed (${signInResponse.status()}): ${error}`);
    }

    const authData = await signInResponse.json();
    if (!userId && authData.user?.id) {
      userId = authData.user.id;
    }

    console.log('  ✅ Sign-in successful');

    // Navigate to /chat to verify auth
    await page.goto(`${BASE_URL}/chat`);
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/auth/sign-in')) {
      throw new Error('Authentication failed - redirected to sign-in');
    }

    console.log('  ✅ Verified authentication');

    // Save storage state
    const authFile = path.join(AUTH_DIR, `${user.tier}-user.json`);
    await context.storageState({ path: authFile });
    console.log(`  ✅ Saved auth state to ${authFile}`);

    return userId;
  } catch (error) {
    console.error(`  ❌ Failed to set up auth for ${user.email}:`, error);
    // Create empty auth file to prevent test failures
    const authFile = path.join(AUTH_DIR, `${user.tier}-user.json`);
    fs.writeFileSync(authFile, JSON.stringify({ cookies: [], origins: [] }));
    return null;
  } finally {
    await browser.close();
  }
}

function setupBillingForProUser(userId: string): void {
  console.log('\n💳 Setting up billing data for Pro user...');

  const now = Math.floor(Date.now() / 1000);
  const futureDate = now + 365 * 24 * 60 * 60; // 1 year from now

  const customerId = `cus_e2e_pro_test`;
  const paymentMethodId = `pm_e2e_pro_test`;
  const subscriptionId = `sub_e2e_pro_test`;
  const creditBalanceId = `cb_e2e_pro_test`;
  const usageId = `usage_e2e_pro_test`;

  // Query for existing price from DB (matches seed-local.sql)
  let priceId = 'price_test_e2e';
  try {
    const priceResult = execSync(
      `bunx wrangler d1 execute DB --local --command="SELECT id FROM stripe_price LIMIT 1" --json`,
      { stdio: 'pipe', encoding: 'utf-8' },
    );
    const priceData = JSON.parse(priceResult);
    const prices = priceData[0]?.results || [];
    if (prices.length > 0) {
      priceId = prices[0].id;
      console.log(`  📋 Using existing price: ${priceId}`);
    } else {
      console.log('  ⚠️ No prices found, using fallback test price');
    }
  } catch {
    console.log('  ⚠️ Could not query prices, using fallback test price');
  }

  try {
    // Create stripe_customer
    const customerSql = `INSERT OR REPLACE INTO stripe_customer (id, user_id, email, name, default_payment_method_id, metadata, created_at, updated_at) VALUES ('${customerId}', '${userId}', 'e2e-pro-test@roundtable.now', 'E2E Pro Test User', '${paymentMethodId}', NULL, ${now}, ${now});`;
    execSync(`bunx wrangler d1 execute DB --local --command="${customerSql}"`, { stdio: 'pipe' });

    // Create stripe_payment_method
    const paymentSql = `INSERT OR REPLACE INTO stripe_payment_method (id, customer_id, type, card_brand, card_last4, card_exp_month, card_exp_year, is_default, metadata, created_at, updated_at) VALUES ('${paymentMethodId}', '${customerId}', 'card', 'visa', '4242', 12, 2030, 1, NULL, ${now}, ${now});`;
    execSync(`bunx wrangler d1 execute DB --local --command="${paymentSql}"`, { stdio: 'pipe' });

    // Create subscription with dynamically queried price
    const subscriptionSql = `INSERT OR REPLACE INTO stripe_subscription (id, customer_id, user_id, status, price_id, quantity, cancel_at_period_end, current_period_start, current_period_end, metadata, version, created_at, updated_at) VALUES ('${subscriptionId}', '${customerId}', '${userId}', 'active', '${priceId}', 1, 0, ${now}, ${futureDate}, NULL, 1, ${now}, ${now});`;
    execSync(`bunx wrangler d1 execute DB --local --command="${subscriptionSql}"`, { stdio: 'pipe' });

    // Create credit balance
    const monthlyCredits = 50000;
    const creditBalanceSql = `INSERT OR REPLACE INTO user_credit_balance (id, user_id, balance, reserved_credits, plan_type, monthly_credits, pay_as_you_go_enabled, next_refill_at, version, created_at, updated_at) VALUES ('${creditBalanceId}', '${userId}', ${monthlyCredits}, 0, 'paid', ${monthlyCredits}, 0, ${futureDate}, 1, ${now}, ${now});`;
    execSync(`bunx wrangler d1 execute DB --local --command="${creditBalanceSql}"`, { stdio: 'pipe' });

    // Create user_chat_usage with Pro tier
    const periodStart = Math.floor(new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime() / 1000);
    const periodEnd = Math.floor(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59).getTime() / 1000);
    const usageSql = `INSERT OR REPLACE INTO user_chat_usage (id, user_id, current_period_start, current_period_end, threads_created, messages_created, custom_roles_created, analysis_generated, subscription_tier, is_annual, version, created_at, updated_at) VALUES ('${usageId}', '${userId}', ${periodStart}, ${periodEnd}, 0, 0, 0, 0, 'pro', 0, 1, ${now}, ${now});`;
    execSync(`bunx wrangler d1 execute DB --local --command="${usageSql}"`, { stdio: 'pipe' });

    console.log('  ✅ Billing data created successfully');
  } catch (error) {
    console.error('  ❌ Failed to create billing data:', error);
  }
}

async function main() {
  console.log('🚀 E2E Auth Setup Starting...\n');

  // Ensure auth directory exists
  const authDir = path.resolve(AUTH_DIR);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
    console.log(`✅ Created auth directory: ${authDir}\n`);
  }

  // Check if server is running
  try {
    const response = await fetch(BASE_URL);
    if (!response.ok) {
      throw new Error('Server not responding');
    }
    console.log(`✅ Server is running at ${BASE_URL}\n`);
  } catch (error) {
    console.error(`❌ Server not running at ${BASE_URL}`);
    console.error('Please start the dev server with: bun run dev');
    process.exit(1);
  }

  const userIds: Map<string, string> = new Map();

  // Set up auth for all users
  for (const user of TEST_USERS) {
    const userId = await setupAuthForUser(user);
    if (userId) {
      userIds.set(user.tier, userId);
    }
  }

  // Set up billing for pro user
  const proUserId = userIds.get('pro');
  if (proUserId) {
    setupBillingForProUser(proUserId);
  } else {
    console.warn('\n⚠️  No Pro user ID found, skipping billing setup');
  }

  console.log('\n✅ E2E Auth Setup Complete!\n');
  console.log('You can now run: bun run exec playwright test e2e/pro/ --project=chromium-pro');
}

main().catch((error) => {
  console.error('\n❌ Setup failed:', error);
  process.exit(1);
});
