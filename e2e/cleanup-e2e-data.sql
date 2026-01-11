-- E2E Test Data Cleanup Script
-- Run with: pnpm test:e2e:cleanup
--
-- Cleans up all data created by E2E tests.
-- Test users are identified by email pattern: e2e-*@roundtable.now
--
-- This script can be run manually if global-teardown didn't run
-- (e.g., tests were interrupted or crashed).

-- Delete in order to respect foreign key constraints:

-- 1. Credit transactions for E2E users
DELETE FROM credit_transaction WHERE user_id IN (SELECT id FROM user WHERE email LIKE 'e2e-%@roundtable.now');

-- 2. Credit balances for E2E users
DELETE FROM user_credit_balance WHERE user_id IN (SELECT id FROM user WHERE email LIKE 'e2e-%@roundtable.now');

-- 3. Usage records for E2E users
DELETE FROM user_chat_usage WHERE user_id IN (SELECT id FROM user WHERE email LIKE 'e2e-%@roundtable.now');

-- 4. Usage history for E2E users
DELETE FROM user_chat_usage_history WHERE user_id IN (SELECT id FROM user WHERE email LIKE 'e2e-%@roundtable.now');

-- 5. Subscriptions for E2E users (via customer)
DELETE FROM stripe_subscription WHERE customer_id IN (SELECT id FROM stripe_customer WHERE user_id IN (SELECT id FROM user WHERE email LIKE 'e2e-%@roundtable.now'));

-- 6. Payment methods for E2E users (via customer)
DELETE FROM stripe_payment_method WHERE customer_id IN (SELECT id FROM stripe_customer WHERE user_id IN (SELECT id FROM user WHERE email LIKE 'e2e-%@roundtable.now'));

-- 7. Stripe customers for E2E users
DELETE FROM stripe_customer WHERE user_id IN (SELECT id FROM user WHERE email LIKE 'e2e-%@roundtable.now');

-- 8. Chat messages for E2E users (via thread owner)
DELETE FROM chat_message WHERE thread_id IN (SELECT id FROM chat_thread WHERE user_id IN (SELECT id FROM user WHERE email LIKE 'e2e-%@roundtable.now'));

-- 9. Chat participants for E2E users
DELETE FROM chat_participant WHERE thread_id IN (SELECT id FROM chat_thread WHERE user_id IN (SELECT id FROM user WHERE email LIKE 'e2e-%@roundtable.now'));

-- 10. Chat threads for E2E users
DELETE FROM chat_thread WHERE user_id IN (SELECT id FROM user WHERE email LIKE 'e2e-%@roundtable.now');

-- 11. Sessions for E2E users
DELETE FROM session WHERE user_id IN (SELECT id FROM user WHERE email LIKE 'e2e-%@roundtable.now');

-- 12. Accounts for E2E users
DELETE FROM account WHERE user_id IN (SELECT id FROM user WHERE email LIKE 'e2e-%@roundtable.now');

-- 13. Verification tokens for E2E users
DELETE FROM verification WHERE identifier LIKE 'e2e-%@roundtable.now';

-- 14. Finally, delete the E2E users themselves
DELETE FROM user WHERE email LIKE 'e2e-%@roundtable.now';
