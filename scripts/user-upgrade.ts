#!/usr/bin/env npx tsx
/**
 * User Upgrade Script
 *
 * Grants a user Pro access for 1 month (manual upgrade, no Stripe payment).
 * - If already pro: tops off credits (+100K) and extends period (+1 month)
 * - If free: upgrades to pro, grants 100K credits, sets 1 month period
 *
 * Creates all necessary database records for proper behavior:
 * - user_chat_usage: subscription tier = 'pro', billing period
 * - user_credit_balance: credit balance, plan_type = 'paid'
 * - credit_transaction: audit log for the credit grant
 * - stripe_customer: links user to Stripe (prevents rollover downgrade)
 * - stripe_subscription: active subscription with cancel_at_period_end=1
 *
 * Key behavior:
 * - Uses REAL Stripe product/price IDs from seed files (environment-specific)
 * - Sets cancel_at_period_end=1 so user can STILL PURCHASE a real subscription
 * - The checkout handler allows new subscriptions when cancel_at_period_end=true
 * - Metadata includes {"manualGrant":"true"} for tracking
 *
 * Usage:
 *   Interactive:  npx tsx scripts/user-upgrade.ts
 *   CLI args:     npx tsx scripts/user-upgrade.ts --env prod --email user@example.com
 *
 * Prerequisites:
 *   - Seed data must be applied (product/price records must exist)
 *   - User must already be signed up
 */

import { execSync } from 'node:child_process';
import * as readline from 'node:readline';

const D1_DATABASE_NAMES = {
  preview: 'roundtable-dashboard-db-preview',
  prod: 'roundtable-dashboard-db-prod',
} as const;

// Pro plan constants (from product-logic.service.ts and credit-config.ts)
const PRO_MONTHLY_CREDITS = 100_000;

// Stripe IDs from seed files - use real product/price so tier detection works correctly
// These match the actual Stripe catalog (test mode for preview, live mode for prod)
const STRIPE_IDS = {
  preview: {
    productId: 'prod_Tf8t3FTCKcpVDq',
    priceId: 'price_1Smaap52vWNZ3v8w4wEjE10y',
  },
  prod: {
    productId: 'prod_Tm6uQ8p2TyzcaA',
    priceId: 'price_1SoYgp52vWNZ3v8wGzxrv0NC',
  },
} as const;

type Environment = keyof typeof D1_DATABASE_NAMES;

function createReadline(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: process.stdin.isTTY ?? false,
  });
}

function question(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise(resolve => {
    rl.question(prompt, answer => {
      resolve(answer.trim());
    });
  });
}

function generateId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
}

function executeD1(dbName: string, sql: string): string {
  const escapedSql = sql.replace(/"/g, '\\"');
  const cmd = `wrangler d1 execute ${dbName} --remote --command "${escapedSql}"`;
  try {
    const result = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    return result;
  } catch (error: unknown) {
    const err = error as { stderr?: string; message?: string };
    console.error('D1 execution error:', err.stderr || err.message);
    throw error;
  }
}

function executeD1Json(dbName: string, sql: string): unknown[] {
  const escapedSql = sql.replace(/"/g, '\\"');
  const cmd = `wrangler d1 execute ${dbName} --remote --json --command "${escapedSql}"`;
  try {
    const result = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    const parsed = JSON.parse(result);
    // wrangler d1 returns array of result sets, first one contains our results
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].results) {
      return parsed[0].results;
    }
    return [];
  } catch (error: unknown) {
    const err = error as { stderr?: string; message?: string };
    console.error('D1 execution error:', err.stderr || err.message);
    throw error;
  }
}

interface UserRow {
  id: string;
  email: string;
  name: string;
}

interface UsageRow {
  id: string;
  user_id: string;
  subscription_tier: string;
  current_period_start: number;
  current_period_end: number;
  threads_created: number;
  messages_created: number;
  custom_roles_created: number;
  analysis_generated: number;
  version: number;
}

interface CreditRow {
  id: string;
  user_id: string;
  balance: number;
  plan_type: string;
  monthly_credits: number;
  version: number;
}

interface StripeCustomerRow {
  id: string;
  user_id: string;
  email: string;
}

interface StripeSubscriptionRow {
  id: string;
  customer_id: string;
  user_id: string;
  status: string;
  price_id: string;
  current_period_end: number;
}

function parseArgs(): { env?: string; email?: string } {
  const args = process.argv.slice(2);
  const result: { env?: string; email?: string } = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--env' && args[i + 1]) {
      result.env = args[++i];
    } else if (args[i] === '--email' && args[i + 1]) {
      result.email = args[++i];
    }
  }

  return result;
}

async function main() {
  const cliArgs = parseArgs();
  const rl = createReadline();

  console.log('\n🚀 User Upgrade Script\n');
  console.log('This script upgrades an existing user to Pro plan for 1 month.\n');

  // Get environment from CLI args or prompt
  let env: Environment | null = null;
  if (cliArgs.env === 'preview' || cliArgs.env === 'prod') {
    env = cliArgs.env;
    console.log(`Environment: ${env} (from CLI args)`);
  } else {
    while (!env) {
      const envInput = await question(rl, 'Environment (preview/prod): ');
      if (envInput === 'preview' || envInput === 'prod') {
        env = envInput;
      } else {
        console.log('❌ Invalid environment. Please enter "preview" or "prod".\n');
      }
    }
  }

  const dbName = D1_DATABASE_NAMES[env];
  console.log(`\n✅ Using database: ${dbName}\n`);

  // Get email from CLI args or prompt
  let email = cliArgs.email;
  if (email) {
    console.log(`User email: ${email} (from CLI args)`);
  } else {
    email = await question(rl, 'User email to upgrade: ');
  }

  if (!email || !email.includes('@')) {
    console.error('❌ Invalid email address');
    rl.close();
    process.exit(1);
  }

  rl.close();

  console.log(`\n🔍 Looking up user: ${email}...`);

  // Find user by email
  const users = executeD1Json(dbName, `SELECT id, email, name FROM user WHERE email = '${email}'`) as UserRow[];

  if (users.length === 0) {
    console.error(`\n❌ User not found: ${email}`);
    console.error('   Make sure the user exists and is already signed up.\n');
    process.exit(1);
  }

  const user = users[0];
  console.log(`✅ Found user: ${user.name} (${user.id})\n`);

  // Calculate timestamps
  const now = Math.floor(Date.now() / 1000);
  const oneMonthFromNow = now + 30 * 24 * 60 * 60; // 30 days

  // Check existing usage record
  const usageRecords = executeD1Json(
    dbName,
    `SELECT * FROM user_chat_usage WHERE user_id = '${user.id}'`,
  ) as UsageRow[];

  // Check existing credit balance
  const creditRecords = executeD1Json(
    dbName,
    `SELECT * FROM user_credit_balance WHERE user_id = '${user.id}'`,
  ) as CreditRow[];

  // Check existing Stripe records
  const customerRecords = executeD1Json(
    dbName,
    `SELECT id, user_id, email FROM stripe_customer WHERE user_id = '${user.id}'`,
  ) as StripeCustomerRow[];

  const existingUsage = usageRecords[0];
  const existingCredit = creditRecords[0];
  const existingCustomer = customerRecords[0];

  // Check for existing active subscription if customer exists
  let existingSubscription: StripeSubscriptionRow | undefined;
  if (existingCustomer) {
    const subscriptionRecords = executeD1Json(
      dbName,
      `SELECT id, customer_id, user_id, status, price_id, current_period_end FROM stripe_subscription WHERE customer_id = '${existingCustomer.id}' AND status = 'active'`,
    ) as StripeSubscriptionRow[];
    existingSubscription = subscriptionRecords[0];
  }

  console.log('📊 Current status:');
  if (existingUsage) {
    console.log(`   Tier: ${existingUsage.subscription_tier}`);
    console.log(`   Period ends: ${new Date(existingUsage.current_period_end * 1000).toISOString()}`);
  } else {
    console.log('   No usage record (will create)');
  }
  if (existingCredit) {
    console.log(`   Plan: ${existingCredit.plan_type}`);
    console.log(`   Balance: ${existingCredit.balance.toLocaleString()} credits`);
  } else {
    console.log('   No credit balance (will create)');
  }
  if (existingCustomer) {
    console.log(`   Stripe customer: ${existingCustomer.id}`);
    if (existingSubscription) {
      console.log(`   Active subscription: ${existingSubscription.id} (${existingSubscription.status})`);
    } else {
      console.log('   No active subscription (will create)');
    }
  } else {
    console.log('   No Stripe customer (will create)');
  }
  console.log('');

  // Prepare upgrade
  const newBalance = (existingCredit?.balance || 0) + PRO_MONTHLY_CREDITS;
  let newPeriodEnd = oneMonthFromNow;

  // If already pro with future period end, extend from that date
  if (existingUsage?.subscription_tier === 'pro' && existingUsage.current_period_end > now) {
    newPeriodEnd = existingUsage.current_period_end + 30 * 24 * 60 * 60;
    console.log('ℹ️  User already has pro - extending period and topping off credits\n');
  }

  console.log('📝 Upgrading to Pro:');
  console.log(`   New period end: ${new Date(newPeriodEnd * 1000).toISOString()}`);
  console.log(`   New balance: ${newBalance.toLocaleString()} credits (+${PRO_MONTHLY_CREDITS.toLocaleString()})\n`);

  // Execute upgrade
  console.log('⏳ Executing upgrade...\n');

  try {
    // 1. Update or insert user_chat_usage
    if (existingUsage) {
      executeD1(
        dbName,
        `UPDATE user_chat_usage
         SET subscription_tier = 'pro',
             is_annual = 0,
             current_period_start = ${now},
             current_period_end = ${newPeriodEnd},
             pending_tier_change = NULL,
             pending_tier_is_annual = NULL,
             version = version + 1,
             updated_at = ${now}
         WHERE user_id = '${user.id}'`,
      );
      console.log('✅ Updated user_chat_usage');
    } else {
      const usageId = generateId();
      executeD1(
        dbName,
        `INSERT INTO user_chat_usage
         (id, user_id, subscription_tier, is_annual, current_period_start, current_period_end,
          threads_created, messages_created, custom_roles_created, analysis_generated,
          version, created_at, updated_at)
         VALUES ('${usageId}', '${user.id}', 'pro', 0, ${now}, ${newPeriodEnd},
                 0, 0, 0, 0, 1, ${now}, ${now})`,
      );
      console.log('✅ Created user_chat_usage');
    }

    // 2. Update or insert user_credit_balance
    if (existingCredit) {
      executeD1(
        dbName,
        `UPDATE user_credit_balance
         SET balance = ${newBalance},
             plan_type = 'paid',
             monthly_credits = ${PRO_MONTHLY_CREDITS},
             last_refill_at = ${now},
             next_refill_at = ${newPeriodEnd},
             version = version + 1,
             updated_at = ${now}
         WHERE user_id = '${user.id}'`,
      );
      console.log('✅ Updated user_credit_balance');
    } else {
      const creditId = generateId();
      executeD1(
        dbName,
        `INSERT INTO user_credit_balance
         (id, user_id, balance, reserved_credits, plan_type, monthly_credits,
          last_refill_at, next_refill_at, version, created_at, updated_at)
         VALUES ('${creditId}', '${user.id}', ${newBalance}, 0, 'paid', ${PRO_MONTHLY_CREDITS},
                 ${now}, ${newPeriodEnd}, 1, ${now}, ${now})`,
      );
      console.log('✅ Created user_credit_balance');
    }

    // 3. Log credit transaction
    const txId = generateId();
    const description = `Pro upgrade - manual grant via user-upgrade script`;
    executeD1(
      dbName,
      `INSERT INTO credit_transaction
       (id, user_id, type, amount, balance_after, description, created_at)
       VALUES ('${txId}', '${user.id}', 'credit_grant', ${PRO_MONTHLY_CREDITS}, ${newBalance}, '${description}', ${now})`,
    );
    console.log('✅ Logged credit_transaction');

    // 4. Get environment-specific Stripe IDs (from seed files)
    const stripeIds = STRIPE_IDS[env];
    console.log(`✅ Using Stripe IDs for ${env}: product=${stripeIds.productId}, price=${stripeIds.priceId}`);

    // Verify the product/price exist in DB (should be from seed)
    const existingProducts = executeD1Json(
      dbName,
      `SELECT id FROM stripe_product WHERE id = '${stripeIds.productId}'`,
    ) as { id: string }[];

    if (existingProducts.length === 0) {
      console.error(`❌ Stripe product ${stripeIds.productId} not found in database.`);
      console.error('   Run the seed migration first: pnpm db:migrate:preview or pnpm db:migrate:prod');
      process.exit(1);
    }

    const existingPrices = executeD1Json(
      dbName,
      `SELECT id FROM stripe_price WHERE id = '${stripeIds.priceId}'`,
    ) as { id: string }[];

    if (existingPrices.length === 0) {
      console.error(`❌ Stripe price ${stripeIds.priceId} not found in database.`);
      console.error('   Run the seed migration first: pnpm db:migrate:preview or pnpm db:migrate:prod');
      process.exit(1);
    }

    // 5. Create or update Stripe customer
    const customerId = existingCustomer?.id || `cus_manual_${user.id.substring(0, 16)}`;
    if (!existingCustomer) {
      executeD1(
        dbName,
        `INSERT INTO stripe_customer
         (id, user_id, email, name, metadata, created_at, updated_at)
         VALUES ('${customerId}', '${user.id}', '${email}', '${user.name.replace(/'/g, "''")}', '{"manualGrant":"true"}', ${now}, ${now})`,
      );
      console.log('✅ Created stripe_customer');
    } else {
      console.log('✅ stripe_customer already exists');
    }

    // 6. Create or update Stripe subscription
    // NOTE: cancel_at_period_end = 1 allows user to purchase a REAL subscription later
    // The checkout handler only blocks if there's an active sub WITHOUT cancel_at_period_end
    const subscriptionId = existingSubscription?.id || `sub_manual_${generateId()}`;
    if (existingSubscription) {
      // Update existing subscription period, keep cancel_at_period_end = 1
      executeD1(
        dbName,
        `UPDATE stripe_subscription
         SET current_period_start = ${now},
             current_period_end = ${newPeriodEnd},
             cancel_at = ${newPeriodEnd},
             status = 'active',
             cancel_at_period_end = 1,
             version = version + 1,
             updated_at = ${now}
         WHERE id = '${existingSubscription.id}'`,
      );
      console.log('✅ Updated stripe_subscription (cancel_at_period_end=1, user can still purchase real subscription)');
    } else {
      executeD1(
        dbName,
        `INSERT INTO stripe_subscription
         (id, customer_id, user_id, status, price_id, quantity, cancel_at_period_end, cancel_at,
          current_period_start, current_period_end, metadata, version, created_at, updated_at)
         VALUES ('${subscriptionId}', '${customerId}', '${user.id}', 'active', '${stripeIds.priceId}', 1, 1, ${newPeriodEnd},
                 ${now}, ${newPeriodEnd}, '{"manualGrant":"true"}', 1, ${now}, ${now})`,
      );
      console.log('✅ Created stripe_subscription (cancel_at_period_end=1, user can still purchase real subscription)');
    }

    console.log(`\n🎉 Successfully upgraded ${email} to Pro!\n`);
    console.log('Summary:');
    console.log(`   Tier: pro`);
    console.log(`   Period: ${new Date(now * 1000).toLocaleDateString()} - ${new Date(newPeriodEnd * 1000).toLocaleDateString()}`);
    console.log(`   Credits: ${newBalance.toLocaleString()}`);
    console.log(`   Monthly credits: ${PRO_MONTHLY_CREDITS.toLocaleString()}`);
    console.log(`   Stripe customer: ${customerId}`);
    console.log(`   Stripe subscription: ${subscriptionId} (active, cancels at period end)`);
    console.log(`   Stripe price: ${stripeIds.priceId}\n`);
    console.log('✅ All database records created - user will properly show as Pro subscriber.');
    console.log('✅ User can still purchase a real Stripe subscription (grant set to cancel at period end).\n');
  } catch (error) {
    console.error('\n❌ Upgrade failed. Please check the error above.\n');
    process.exit(1);
  }
}

main();
