/**
 * User Queries
 *
 * Reusable DB operations for user-related data.
 * Provides typed, consistent access patterns for subscriptions and credits.
 */

import { CreditActions, StripeSubscriptionStatuses } from '@roundtable/shared/enums';
import { and, eq } from 'drizzle-orm';

import type { getDbAsync } from '@/db';
import * as tables from '@/db';

type DbInstance = Awaited<ReturnType<typeof getDbAsync>>;

// ============================================================================
// Subscription Operations
// ============================================================================

/**
 * Check if user has active subscription
 */
export async function checkHasActiveSubscription(
  userId: string,
  db: DbInstance,
): Promise<boolean> {
  const results = await db
    .select()
    .from(tables.stripeCustomer)
    .innerJoin(
      tables.stripeSubscription,
      and(
        eq(tables.stripeSubscription.customerId, tables.stripeCustomer.id),
        eq(tables.stripeSubscription.status, StripeSubscriptionStatuses.ACTIVE),
      ),
    )
    .where(eq(tables.stripeCustomer.userId, userId))
    .limit(1);

  return results.length > 0;
}

/**
 * Get user's subscription status
 */
export async function getUserSubscriptionStatus(
  userId: string,
  db: DbInstance,
) {
  const result = await db
    .select()
    .from(tables.stripeCustomer)
    .innerJoin(
      tables.stripeSubscription,
      eq(tables.stripeSubscription.customerId, tables.stripeCustomer.id),
    )
    .where(eq(tables.stripeCustomer.userId, userId))
    .limit(1);

  const row = result[0];
  if (!row)
    return null;

  return {
    subscriptionId: row.stripe_subscription.id,
    status: row.stripe_subscription.status,
    currentPeriodEnd: row.stripe_subscription.currentPeriodEnd,
  };
}

// ============================================================================
// Free User Operations
// ============================================================================

/**
 * Check if free user completed a round
 * Returns true if user has FREE_ROUND_COMPLETE transaction
 */
export async function checkFreeUserCompletedRound(
  userId: string,
  db: DbInstance,
): Promise<boolean> {
  const hasTransactionResults = await db
    .select()
    .from(tables.creditTransaction)
    .where(
      and(
        eq(tables.creditTransaction.userId, userId),
        eq(tables.creditTransaction.action, CreditActions.FREE_ROUND_COMPLETE),
      ),
    )
    .limit(1);

  return hasTransactionResults.length > 0;
}

/**
 * Check if user has created any thread
 */
export async function checkUserHasThread(
  userId: string,
  db: DbInstance,
): Promise<boolean> {
  const existingThread = await db
    .select()
    .from(tables.chatThread)
    .where(eq(tables.chatThread.userId, userId))
    .limit(1);

  return existingThread.length > 0;
}

// ============================================================================
// Credit Balance Operations
// ============================================================================

/**
 * Get user credit balance
 */
export async function getUserCreditBalanceRecord(
  userId: string,
  db: DbInstance,
) {
  const results = await db
    .select()
    .from(tables.userCreditBalance)
    .where(eq(tables.userCreditBalance.userId, userId))
    .limit(1);

  return results[0] ?? null;
}
