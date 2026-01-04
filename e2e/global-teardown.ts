import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import type { FullConfig } from '@playwright/test';

/**
 * Playwright Global Teardown
 * Cleans up E2E test users and their related data after tests complete
 *
 * This ensures test data doesn't persist and cause conflicts with normal app usage.
 * Test users are identified by email pattern: e2e-*@roundtable.now
 */

const AUTH_DIR = '.playwright/auth';

/**
 * Clean up E2E test data from the database
 * Deletes all records associated with E2E test users
 */
function cleanupTestData(): void {
  console.error('\n🧹 Cleaning up E2E test data...\n');

  try {
    // Delete in order to respect foreign key constraints:
    // 1. credit_transaction (references user)
    // 2. user_credit_balance (references user)
    // 3. user_chat_usage (references user)
    // 4. user_chat_usage_history (references user)
    // 5. stripe_subscription (references customer, user)
    // 6. stripe_payment_method (references customer)
    // 7. stripe_customer (references user)
    // 8. chat_message (references thread, user via participant)
    // 9. chat_participant (references thread, user)
    // 10. chat_thread (references user)
    // 11. session (references user)
    // 12. account (references user)
    // 13. verification (references user by identifier)
    // 14. user (the base record)

    const cleanupQueries = [
      // Delete credit transactions for E2E users
      `DELETE FROM credit_transaction WHERE user_id IN (SELECT id FROM user WHERE email LIKE 'e2e-%@roundtable.now');`,

      // Delete credit balances for E2E users
      `DELETE FROM user_credit_balance WHERE user_id IN (SELECT id FROM user WHERE email LIKE 'e2e-%@roundtable.now');`,

      // Delete usage records for E2E users
      `DELETE FROM user_chat_usage WHERE user_id IN (SELECT id FROM user WHERE email LIKE 'e2e-%@roundtable.now');`,

      // Delete usage history for E2E users
      `DELETE FROM user_chat_usage_history WHERE user_id IN (SELECT id FROM user WHERE email LIKE 'e2e-%@roundtable.now');`,

      // Delete subscriptions for E2E users (via customer)
      `DELETE FROM stripe_subscription WHERE customer_id IN (SELECT id FROM stripe_customer WHERE user_id IN (SELECT id FROM user WHERE email LIKE 'e2e-%@roundtable.now'));`,

      // Delete payment methods for E2E users (via customer)
      `DELETE FROM stripe_payment_method WHERE customer_id IN (SELECT id FROM stripe_customer WHERE user_id IN (SELECT id FROM user WHERE email LIKE 'e2e-%@roundtable.now'));`,

      // Delete Stripe customers for E2E users
      `DELETE FROM stripe_customer WHERE user_id IN (SELECT id FROM user WHERE email LIKE 'e2e-%@roundtable.now');`,

      // Delete chat messages for E2E users (via thread owner)
      `DELETE FROM chat_message WHERE thread_id IN (SELECT id FROM chat_thread WHERE user_id IN (SELECT id FROM user WHERE email LIKE 'e2e-%@roundtable.now'));`,

      // Delete chat participants for E2E users
      `DELETE FROM chat_participant WHERE thread_id IN (SELECT id FROM chat_thread WHERE user_id IN (SELECT id FROM user WHERE email LIKE 'e2e-%@roundtable.now'));`,

      // Delete chat threads for E2E users
      `DELETE FROM chat_thread WHERE user_id IN (SELECT id FROM user WHERE email LIKE 'e2e-%@roundtable.now');`,

      // Delete sessions for E2E users
      `DELETE FROM session WHERE user_id IN (SELECT id FROM user WHERE email LIKE 'e2e-%@roundtable.now');`,

      // Delete accounts for E2E users
      `DELETE FROM account WHERE user_id IN (SELECT id FROM user WHERE email LIKE 'e2e-%@roundtable.now');`,

      // Delete verification tokens for E2E users
      `DELETE FROM verification WHERE identifier LIKE 'e2e-%@roundtable.now';`,

      // Finally, delete the E2E users themselves
      `DELETE FROM user WHERE email LIKE 'e2e-%@roundtable.now';`,
    ];

    for (const sql of cleanupQueries) {
      try {
        execSync(`npx wrangler d1 execute DB --local --command="${sql}"`, {
          stdio: 'pipe',
          encoding: 'utf-8',
        });
      } catch {
        // Ignore errors for tables that might not have data
      }
    }

    console.error('✅ E2E test data cleaned up from database\n');
  } catch (error) {
    console.error('⚠️ Error cleaning up E2E test data:', error);
    // Don't fail teardown if cleanup has issues
  }
}

/**
 * Clean up auth state files
 */
function cleanupAuthFiles(): void {
  const authDir = path.resolve(AUTH_DIR);

  if (fs.existsSync(authDir)) {
    try {
      fs.rmSync(authDir, { recursive: true, force: true });
      console.error('✅ Auth state files cleaned up\n');
    } catch (error) {
      console.error('⚠️ Error cleaning up auth files:', error);
    }
  }
}

/**
 * Global teardown function - runs after all tests
 */
async function globalTeardown(_config: FullConfig): Promise<void> {
  console.error('\n🧹 Running E2E global teardown...\n');

  // Clean up database test data
  cleanupTestData();

  // Clean up auth state files
  cleanupAuthFiles();

  console.error('✅ E2E global teardown complete!\n');
}

export default globalTeardown;
