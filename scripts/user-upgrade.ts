#!/usr/bin/env npx tsx
/**
 * User Upgrade Script
 *
 * Upgrades an existing user to Pro plan for 1 month.
 * - If already pro: tops off credits (+100K) and extends period (+1 month)
 * - If free: upgrades to pro, grants 100K credits, sets 1 month period
 *
 * Usage:
 *   npx tsx scripts/user-upgrade.ts
 *
 * Environment:
 *   Uses wrangler d1 execute to run SQL against preview/prod D1 databases
 */

import { execSync } from 'node:child_process';
import * as readline from 'node:readline';

const ACCOUNT_ID = '499b6c3c38f75f7f7dc7d3127954b921';

const D1_DATABASE_NAMES = {
  preview: 'roundtable-dashboard-db-preview',
  prod: 'roundtable-dashboard-db-prod',
} as const;

// Pro plan constants (from product-logic.service.ts and credit-config.ts)
const PRO_MONTHLY_CREDITS = 100_000;

type Environment = keyof typeof D1_DATABASE_NAMES;

function createReadline(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
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

async function main() {
  const rl = createReadline();

  console.log('\n🚀 User Upgrade Script\n');
  console.log('This script upgrades an existing user to Pro plan for 1 month.\n');

  // Ask for environment
  let env: Environment | null = null;
  while (!env) {
    const envInput = await question(rl, 'Environment (preview/prod): ');
    if (envInput === 'preview' || envInput === 'prod') {
      env = envInput;
    } else {
      console.log('❌ Invalid environment. Please enter "preview" or "prod".\n');
    }
  }

  const dbName = D1_DATABASE_NAMES[env];
  console.log(`\n✅ Using database: ${dbName}\n`);

  // Ask for user email
  const email = await question(rl, 'User email to upgrade: ');
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

  const existingUsage = usageRecords[0];
  const existingCredit = creditRecords[0];

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

    console.log(`\n🎉 Successfully upgraded ${email} to Pro!\n`);
    console.log('Summary:');
    console.log(`   Tier: pro`);
    console.log(`   Period: ${new Date(now * 1000).toLocaleDateString()} - ${new Date(newPeriodEnd * 1000).toLocaleDateString()}`);
    console.log(`   Credits: ${newBalance.toLocaleString()}`);
    console.log(`   Monthly credits: ${PRO_MONTHLY_CREDITS.toLocaleString()}\n`);
  } catch (error) {
    console.error('\n❌ Upgrade failed. Please check the error above.\n');
    process.exit(1);
  }
}

main();
