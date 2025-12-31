/**
 * Credit Service - Core credit management operations
 *
 * Handles all credit-related operations:
 * - Balance tracking and queries
 * - Credit reservation for streaming (pre-authorization)
 * - Credit deduction after actual usage
 * - Credit grants (signup bonus, monthly refill, purchases)
 * - Transaction ledger for audit trail
 *
 * Architecture:
 * - Uses optimistic locking (version column) for concurrent updates
 * - Pre-reservation system prevents overdraft during streaming
 * - Immutable transaction ledger for audit and debugging
 */

import { and, eq, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { z } from 'zod';

import { createError } from '@/api/common/error-handling';
import type { ErrorContext } from '@/api/core';
import type { CreditAction, CreditTransactionType } from '@/api/core/enums';
import { CreditActionSchema, CreditTransactionTypes, getGrantTransactionType, parsePlanType, PlanTypes, PlanTypeSchema, StripeSubscriptionStatuses } from '@/api/core/enums';
import {
  calculateActualCredits,
  getActionCreditCost,
  getPlanConfig,
} from '@/api/services/product-logic.service';
import { getDbAsync } from '@/db';
import * as tables from '@/db';
import type { UserCreditBalance } from '@/db/validation';
import { CREDIT_CONFIG } from '@/lib/config/credit-config';

// ============================================================================
// TYPES (Zod Schemas - Single Source of Truth)
// ============================================================================

export const CreditBalanceInfoSchema = z.object({
  balance: z.number(),
  reserved: z.number(),
  available: z.number(),
  planType: PlanTypeSchema,
  monthlyCredits: z.number(),
  nextRefillAt: z.date().nullable(),
  payAsYouGoEnabled: z.boolean(),
});

export type CreditBalanceInfo = z.infer<typeof CreditBalanceInfoSchema>;

export const TokenUsageSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  action: CreditActionSchema,
  threadId: z.string().optional(),
  messageId: z.string().optional(),
  modelId: z.string().optional(),
});

export type TokenUsage = z.infer<typeof TokenUsageSchema>;

export const CreditDeductionSchema = z.object({
  action: CreditActionSchema,
  credits: z.number(),
  threadId: z.string().optional(),
  messageId: z.string().optional(),
  description: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type CreditDeduction = z.infer<typeof CreditDeductionSchema>;

// ============================================================================
// BALANCE OPERATIONS
// ============================================================================

/**
 * Get or create user credit balance record
 * Creates a new record with signup credits for new users
 */
export async function ensureUserCreditRecord(userId: string): Promise<UserCreditBalance> {
  const db = await getDbAsync();

  // Try to fetch existing record
  const existingResults = await db
    .select()
    .from(tables.userCreditBalance)
    .where(eq(tables.userCreditBalance.userId, userId))
    .limit(1);

  if (existingResults[0]) {
    return existingResults[0];
  }

  // Create new record with signup bonus
  const now = new Date();
  const planConfig = getPlanConfig('free');

  try {
    const result = await db
      .insert(tables.userCreditBalance)
      .values({
        id: ulid(),
        userId,
        balance: planConfig.signupCredits,
        reservedCredits: 0,
        planType: PlanTypes.FREE,
        monthlyCredits: planConfig.monthlyCredits,
        payAsYouGoEnabled: planConfig.payAsYouGoEnabled,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const newRecord = result[0];

    if (newRecord) {
      // Record signup bonus transaction
      await recordTransaction({
        userId,
        type: CreditTransactionTypes.CREDIT_GRANT,
        amount: planConfig.signupCredits,
        balanceAfter: planConfig.signupCredits,
        action: 'signup_bonus',
        description: 'Free plan signup credits',
      });

      return newRecord;
    }

    // Fallback: fetch again in case of race condition
    const retryResults = await db
      .select()
      .from(tables.userCreditBalance)
      .where(eq(tables.userCreditBalance.userId, userId))
      .limit(1);

    if (retryResults[0]) {
      return retryResults[0];
    }

    const errorContext: ErrorContext = {
      errorType: 'database',
      operation: 'insert',
      table: 'userCreditBalance',
      userId,
    };
    throw createError.database('Failed to create credit balance record', errorContext);
  } catch (error) {
    // Handle unique constraint violation (race condition)
    const retryResults = await db
      .select()
      .from(tables.userCreditBalance)
      .where(eq(tables.userCreditBalance.userId, userId))
      .limit(1);

    if (retryResults[0]) {
      return retryResults[0];
    }

    const context: ErrorContext = {
      errorType: 'database',
      operation: 'insert',
      table: 'user_credit_balance',
      userId,
    };
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw createError.internal(`Failed to create credit record: ${errorMsg}`, context);
  }
}

/**
 * Get user's credit balance info
 */
export async function getUserCreditBalance(userId: string): Promise<CreditBalanceInfo> {
  const record = await ensureUserCreditRecord(userId);

  return {
    balance: record.balance,
    reserved: record.reservedCredits,
    available: Math.max(0, record.balance - record.reservedCredits),
    // TYPE-SAFE: Use parsePlanType instead of type casting
    planType: parsePlanType(record.planType),
    monthlyCredits: record.monthlyCredits,
    nextRefillAt: record.nextRefillAt,
    payAsYouGoEnabled: record.payAsYouGoEnabled,
  };
}

/**
 * Check if user can afford a credit amount
 */
export async function canAffordCredits(userId: string, requiredCredits: number): Promise<boolean> {
  const balance = await getUserCreditBalance(userId);
  return balance.available >= requiredCredits;
}

/**
 * Check if user needs to connect payment method to receive free credits
 * Returns true if user has zero balance AND no active subscription AND never connected a card
 *
 * ✅ FIX: Check for active subscriptions directly from Stripe tables
 * The planType field in userCreditBalance may be out of sync with actual subscription status
 */
export async function needsCardConnection(userId: string): Promise<boolean> {
  const balance = await getUserCreditBalance(userId);
  const db = await getDbAsync();

  // Users with positive balance don't need card connection
  if (balance.balance > 0) {
    return false;
  }

  // ✅ FIX: Check for active subscription directly from Stripe tables
  // Users with active subscriptions already have a card connected
  const customerResults = await db
    .select()
    .from(tables.stripeCustomer)
    .where(eq(tables.stripeCustomer.userId, userId))
    .limit(1);

  const customer = customerResults[0];
  if (customer) {
    const subscriptionResults = await db
      .select()
      .from(tables.stripeSubscription)
      .where(
        and(
          eq(tables.stripeSubscription.customerId, customer.id),
          eq(tables.stripeSubscription.status, StripeSubscriptionStatuses.ACTIVE),
        ),
      )
      .limit(1);

    // Has active subscription = has card = doesn't need card connection
    if (subscriptionResults.length > 0) {
      return false;
    }
  }

  // Check if user has ever received card connection credits
  const cardConnectionTx = await db
    .select()
    .from(tables.creditTransaction)
    .where(
      and(
        eq(tables.creditTransaction.userId, userId),
        eq(tables.creditTransaction.action, 'card_connection'),
      ),
    )
    .limit(1);

  // No card connection transaction = needs to connect card
  return cardConnectionTx.length === 0;
}

/**
 * Enforce credit availability - throws if insufficient
 *
 * Provides specific error messages for:
 * 1. New users who need to connect payment method to receive free credits
 * 2. Users who have exhausted their credits and need to purchase more
 *
 * ✅ FIX: Auto-provision credits for users with active subscriptions
 * If user has active subscription but credits are out of sync, provision them automatically
 */
export async function enforceCredits(userId: string, requiredCredits: number): Promise<void> {
  let balance = await getUserCreditBalance(userId);

  if (balance.available < requiredCredits) {
    // ✅ FIX: Check if user has active subscription but credits weren't synced
    // This can happen if webhook failed or subscription was created out of band
    const hasActiveSubscription = await checkHasActiveSubscription(userId);

    if (hasActiveSubscription && balance.planType !== 'paid') {
      // User has subscription but credits weren't synced - provision them now
      await provisionPaidUserCredits(userId);
      // Re-check balance after provisioning
      balance = await getUserCreditBalance(userId);

      // If still insufficient, they've genuinely exhausted credits
      if (balance.available >= requiredCredits) {
        return; // Credits provisioned successfully
      }
    }

    const context: ErrorContext = {
      errorType: 'resource',
      resource: 'credits',
      userId,
    };

    // Check if this is a new user who needs to connect their card
    const needsCard = await needsCardConnection(userId);

    if (needsCard) {
      throw createError.badRequest(
        'Connect a payment method to receive your free 10,000 credits and start chatting. '
        + 'No charges until you exceed your free credits.',
        context,
      );
    }

    // User has connected card but exhausted credits
    throw createError.badRequest(
      `Insufficient credits. Required: ${requiredCredits}, Available: ${balance.available}. `
      + `${balance.planType === PlanTypes.FREE ? 'Upgrade to Pro or ' : ''}Purchase additional credits to continue.`,
      context,
    );
  }
}

/**
 * Check if user has an active Stripe subscription
 * Source of truth for subscription status (not cached planType)
 */
async function checkHasActiveSubscription(userId: string): Promise<boolean> {
  const db = await getDbAsync();

  const customerResults = await db
    .select()
    .from(tables.stripeCustomer)
    .where(eq(tables.stripeCustomer.userId, userId))
    .limit(1);

  const customer = customerResults[0];
  if (!customer)
    return false;

  const subscriptionResults = await db
    .select()
    .from(tables.stripeSubscription)
    .where(
      and(
        eq(tables.stripeSubscription.customerId, customer.id),
        eq(tables.stripeSubscription.status, StripeSubscriptionStatuses.ACTIVE),
      ),
    )
    .limit(1);

  return subscriptionResults.length > 0;
}

/**
 * Provision credits for a paid user whose credits weren't synced
 * This is a recovery mechanism for when webhooks fail
 */
async function provisionPaidUserCredits(userId: string): Promise<void> {
  const db = await getDbAsync();
  const planConfig = getPlanConfig('paid');
  const now = new Date();
  const nextRefill = new Date(now);
  nextRefill.setMonth(nextRefill.getMonth() + 1);

  await db
    .update(tables.userCreditBalance)
    .set({
      planType: PlanTypes.PAID,
      balance: planConfig.monthlyCredits,
      monthlyCredits: planConfig.monthlyCredits,
      payAsYouGoEnabled: planConfig.payAsYouGoEnabled,
      lastRefillAt: now,
      nextRefillAt: nextRefill,
      updatedAt: now,
    })
    .where(eq(tables.userCreditBalance.userId, userId));

  // Record the sync transaction
  await recordTransaction({
    userId,
    type: CreditTransactionTypes.MONTHLY_REFILL,
    action: 'monthly_renewal',
    amount: planConfig.monthlyCredits,
    balanceAfter: planConfig.monthlyCredits,
    description: 'Credits provisioned (subscription sync recovery)',
  });
}

// ============================================================================
// RESERVATION SYSTEM (For Streaming)
// ============================================================================

/**
 * Reserve credits before streaming operation
 * Prevents overdraft by locking credits during streaming
 *
 * @param userId User ID
 * @param streamId Unique identifier for this stream (for tracking)
 * @param estimatedCredits Credits to reserve
 */
export async function reserveCredits(
  userId: string,
  streamId: string,
  estimatedCredits: number,
): Promise<void> {
  const db = await getDbAsync();

  // Ensure user has enough available credits
  await enforceCredits(userId, estimatedCredits);

  const record = await ensureUserCreditRecord(userId);

  // Atomic update with optimistic locking
  const result = await db
    .update(tables.userCreditBalance)
    .set({
      reservedCredits: sql`${tables.userCreditBalance.reservedCredits} + ${estimatedCredits}`,
      version: sql`${tables.userCreditBalance.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(tables.userCreditBalance.userId, userId),
        eq(tables.userCreditBalance.version, record.version),
      ),
    )
    .returning();

  if (!result[0]) {
    // Retry on version conflict
    return reserveCredits(userId, streamId, estimatedCredits);
  }

  // Record reservation transaction
  await recordTransaction({
    userId,
    type: CreditTransactionTypes.RESERVATION,
    amount: -estimatedCredits, // Negative to show credits are held
    balanceAfter: result[0].balance,
    streamId,
    description: `Reserved ${estimatedCredits} credits for streaming`,
  });
}

/**
 * Finalize credits after streaming completes
 * Releases reservation and deducts actual usage
 *
 * @param userId User ID
 * @param streamId Stream identifier (must match reservation)
 * @param actualUsage Actual token usage from AI response
 */
export async function finalizeCredits(
  userId: string,
  streamId: string,
  actualUsage: TokenUsage,
): Promise<void> {
  const db = await getDbAsync();

  const record = await ensureUserCreditRecord(userId);

  // Calculate actual credits used
  const actualCredits = calculateActualCredits(actualUsage.inputTokens, actualUsage.outputTokens);

  // Get estimated reservation (we need to release it)
  // For simplicity, we'll just deduct actual and assume reservation matches
  // In production, you might store reservation amount per streamId

  // Atomic update: release reservation and deduct actual
  const result = await db
    .update(tables.userCreditBalance)
    .set({
      // Deduct actual credits from balance
      balance: sql`${tables.userCreditBalance.balance} - ${actualCredits}`,
      // Release reservation (subtract estimated, but we use actual for safety)
      reservedCredits: sql`CASE
        WHEN ${tables.userCreditBalance.reservedCredits} >= ${actualCredits}
        THEN ${tables.userCreditBalance.reservedCredits} - ${actualCredits}
        ELSE 0
      END`,
      version: sql`${tables.userCreditBalance.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(tables.userCreditBalance.userId, userId),
        eq(tables.userCreditBalance.version, record.version),
      ),
    )
    .returning();

  if (!result[0]) {
    // Retry on version conflict
    return finalizeCredits(userId, streamId, actualUsage);
  }

  // Record deduction transaction with full details
  await recordTransaction({
    userId,
    type: CreditTransactionTypes.DEDUCTION,
    amount: -actualCredits,
    balanceAfter: result[0].balance,
    inputTokens: actualUsage.inputTokens,
    outputTokens: actualUsage.outputTokens,
    totalTokens: actualUsage.inputTokens + actualUsage.outputTokens,
    creditsUsed: actualCredits,
    threadId: actualUsage.threadId,
    messageId: actualUsage.messageId,
    streamId,
    action: actualUsage.action,
    modelId: actualUsage.modelId,
    description: `AI response: ${actualUsage.inputTokens} in + ${actualUsage.outputTokens} out = ${actualCredits} credits`,
  });
}

/**
 * Release reservation without deduction (on error or cancellation)
 *
 * @param userId User ID
 * @param streamId Stream identifier
 * @param reservedAmount Amount that was reserved (optional, will release all if not provided)
 */
export async function releaseReservation(
  userId: string,
  streamId: string,
  reservedAmount?: number,
): Promise<void> {
  const db = await getDbAsync();

  const record = await ensureUserCreditRecord(userId);

  // If no amount specified, we can't reliably release
  // In production, store reservation amounts per streamId
  if (reservedAmount === undefined) {
    return;
  }

  const result = await db
    .update(tables.userCreditBalance)
    .set({
      reservedCredits: sql`CASE
        WHEN ${tables.userCreditBalance.reservedCredits} >= ${reservedAmount}
        THEN ${tables.userCreditBalance.reservedCredits} - ${reservedAmount}
        ELSE 0
      END`,
      version: sql`${tables.userCreditBalance.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(tables.userCreditBalance.userId, userId),
        eq(tables.userCreditBalance.version, record.version),
      ),
    )
    .returning();

  if (!result[0]) {
    // Retry on version conflict
    return releaseReservation(userId, streamId, reservedAmount);
  }

  // Record release transaction
  await recordTransaction({
    userId,
    type: CreditTransactionTypes.RELEASE,
    amount: reservedAmount,
    balanceAfter: result[0].balance,
    streamId,
    description: `Released ${reservedAmount} reserved credits (cancelled/error)`,
  });
}

// ============================================================================
// CREDIT MANAGEMENT (Grants, Deductions, Refills)
// ============================================================================

/**
 * Grant credits to a user
 *
 * @param userId User ID
 * @param amount Credits to grant
 * @param type Transaction type (credit_grant, monthly_refill, purchase)
 * @param description Human-readable description
 */
export async function grantCredits(
  userId: string,
  amount: number,
  type: 'credit_grant' | 'monthly_refill' | 'purchase',
  description?: string,
): Promise<void> {
  const db = await getDbAsync();

  const record = await ensureUserCreditRecord(userId);

  const result = await db
    .update(tables.userCreditBalance)
    .set({
      balance: sql`${tables.userCreditBalance.balance} + ${amount}`,
      version: sql`${tables.userCreditBalance.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(tables.userCreditBalance.userId, userId),
        eq(tables.userCreditBalance.version, record.version),
      ),
    )
    .returning();

  if (!result[0]) {
    // Retry on version conflict
    return grantCredits(userId, amount, type, description);
  }

  // Record grant transaction
  // TYPE-SAFE: Use getGrantTransactionType instead of runtime string manipulation + casting
  await recordTransaction({
    userId,
    type: getGrantTransactionType(type),
    amount,
    balanceAfter: result[0].balance,
    action: type === 'monthly_refill' ? 'monthly_renewal' : type === 'purchase' ? 'credit_purchase' : 'signup_bonus',
    description: description || `Granted ${amount} credits`,
  });
}

/**
 * Grant credits for connecting a payment method (free tier users only)
 *
 * Called when a user on free plan successfully attaches a payment method.
 * This is a one-time bonus - subsequent card changes don't grant more credits.
 *
 * @param userId User ID
 * @returns true if credits were granted, false if already received
 */
export async function grantCardConnectionCredits(userId: string): Promise<boolean> {
  const db = await getDbAsync();

  // Check if user already received card connection credits
  const existingTx = await db
    .select()
    .from(tables.creditTransaction)
    .where(
      and(
        eq(tables.creditTransaction.userId, userId),
        eq(tables.creditTransaction.action, 'card_connection'),
      ),
    )
    .limit(1);

  if (existingTx.length > 0) {
    return false; // Already received card connection credits
  }

  // Access free plan config directly (only free plan has cardConnectionCredits)
  const creditsToGrant = CREDIT_CONFIG.PLANS.free.cardConnectionCredits;

  if (creditsToGrant <= 0) {
    return false; // No credits configured for card connection
  }

  const record = await ensureUserCreditRecord(userId);

  const result = await db
    .update(tables.userCreditBalance)
    .set({
      balance: sql`${tables.userCreditBalance.balance} + ${creditsToGrant}`,
      version: sql`${tables.userCreditBalance.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(tables.userCreditBalance.userId, userId),
        eq(tables.userCreditBalance.version, record.version),
      ),
    )
    .returning();

  if (!result[0]) {
    // Retry on version conflict
    return grantCardConnectionCredits(userId);
  }

  // Record card connection transaction
  await recordTransaction({
    userId,
    type: CreditTransactionTypes.CREDIT_GRANT,
    amount: creditsToGrant,
    balanceAfter: result[0].balance,
    action: 'card_connection',
    description: `Free tier bonus: ${creditsToGrant.toLocaleString()} credits for connecting payment method`,
  });

  return true;
}

/**
 * Deduct credits for a specific action (non-streaming)
 * Use for flat-cost actions like thread creation, web search, etc.
 */
export async function deductCreditsForAction(
  userId: string,
  action: keyof typeof CREDIT_CONFIG.ACTION_COSTS,
  context?: { threadId?: string; description?: string },
): Promise<void> {
  const credits = getActionCreditCost(action);

  // Ensure user can afford
  await enforceCredits(userId, credits);

  const db = await getDbAsync();
  const record = await ensureUserCreditRecord(userId);

  const result = await db
    .update(tables.userCreditBalance)
    .set({
      balance: sql`${tables.userCreditBalance.balance} - ${credits}`,
      version: sql`${tables.userCreditBalance.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(tables.userCreditBalance.userId, userId),
        eq(tables.userCreditBalance.version, record.version),
      ),
    )
    .returning();

  if (!result[0]) {
    // Retry on version conflict
    return deductCreditsForAction(userId, action, context);
  }

  // Map action to credit action enum
  const actionMap: Record<keyof typeof CREDIT_CONFIG.ACTION_COSTS, CreditAction> = {
    threadCreation: 'thread_creation',
    webSearchQuery: 'web_search',
    fileReading: 'file_reading',
    analysisGeneration: 'analysis_generation',
    customRoleCreation: 'thread_creation',
  };

  // Record deduction transaction
  await recordTransaction({
    userId,
    type: CreditTransactionTypes.DEDUCTION,
    amount: -credits,
    balanceAfter: result[0].balance,
    creditsUsed: credits,
    threadId: context?.threadId,
    action: actionMap[action],
    description: context?.description || `${String(action)}: ${credits} credits`,
  });
}

/**
 * Process monthly credit refill for paid users
 */
export async function processMonthlyRefill(userId: string): Promise<void> {
  const db = await getDbAsync();

  const record = await ensureUserCreditRecord(userId);

  // Only process for paid users
  if (record.planType !== PlanTypes.PAID) {
    return;
  }

  // Check if refill is due
  const now = new Date();
  if (record.nextRefillAt && record.nextRefillAt > now) {
    return; // Not due yet
  }

  const planConfig = getPlanConfig('paid');
  const nextRefill = new Date(now);
  nextRefill.setMonth(nextRefill.getMonth() + 1);

  const result = await db
    .update(tables.userCreditBalance)
    .set({
      balance: sql`${tables.userCreditBalance.balance} + ${planConfig.monthlyCredits}`,
      lastRefillAt: now,
      nextRefillAt: nextRefill,
      version: sql`${tables.userCreditBalance.version} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(tables.userCreditBalance.userId, userId),
        eq(tables.userCreditBalance.version, record.version),
      ),
    )
    .returning();

  if (!result[0]) {
    // Retry on version conflict
    return processMonthlyRefill(userId);
  }

  // Record refill transaction
  await recordTransaction({
    userId,
    type: CreditTransactionTypes.MONTHLY_REFILL,
    amount: planConfig.monthlyCredits,
    balanceAfter: result[0].balance,
    action: 'monthly_renewal',
    description: `Monthly refill: ${planConfig.monthlyCredits} credits`,
  });
}

/**
 * Upgrade user to paid plan
 */
export async function upgradeToPaidPlan(userId: string): Promise<void> {
  const db = await getDbAsync();

  const record = await ensureUserCreditRecord(userId);
  const planConfig = getPlanConfig('paid');
  const now = new Date();
  const nextRefill = new Date(now);
  nextRefill.setMonth(nextRefill.getMonth() + 1);

  const result = await db
    .update(tables.userCreditBalance)
    .set({
      planType: 'paid',
      balance: sql`${tables.userCreditBalance.balance} + ${planConfig.monthlyCredits}`,
      monthlyCredits: planConfig.monthlyCredits,
      payAsYouGoEnabled: planConfig.payAsYouGoEnabled,
      lastRefillAt: now,
      nextRefillAt: nextRefill,
      version: sql`${tables.userCreditBalance.version} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(tables.userCreditBalance.userId, userId),
        eq(tables.userCreditBalance.version, record.version),
      ),
    )
    .returning();

  if (!result[0]) {
    return upgradeToPaidPlan(userId);
  }

  // Record upgrade transaction
  await recordTransaction({
    userId,
    type: CreditTransactionTypes.CREDIT_GRANT,
    amount: planConfig.monthlyCredits,
    balanceAfter: result[0].balance,
    action: 'monthly_renewal',
    description: `Upgraded to Pro plan: ${planConfig.monthlyCredits} credits`,
  });
}

// ============================================================================
// TRANSACTION LEDGER
// ============================================================================

type TransactionRecord = {
  userId: string;
  type: CreditTransactionType;
  amount: number;
  balanceAfter: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  creditsUsed?: number;
  threadId?: string;
  messageId?: string;
  streamId?: string;
  action?: CreditAction;
  modelId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Record a transaction in the ledger
 */
async function recordTransaction(record: TransactionRecord): Promise<void> {
  const db = await getDbAsync();

  await db.insert(tables.creditTransaction).values({
    id: ulid(),
    userId: record.userId,
    type: record.type,
    amount: record.amount,
    balanceAfter: record.balanceAfter,
    inputTokens: record.inputTokens,
    outputTokens: record.outputTokens,
    totalTokens: record.totalTokens,
    creditsUsed: record.creditsUsed,
    threadId: record.threadId,
    messageId: record.messageId,
    streamId: record.streamId,
    action: record.action,
    modelId: record.modelId,
    description: record.description,
    metadata: record.metadata,
    createdAt: new Date(),
  });
}

/**
 * Get user's transaction history
 */
export async function getUserTransactionHistory(
  userId: string,
  options: { limit?: number; offset?: number; type?: CreditTransactionType } = {},
): Promise<{ transactions: Array<typeof tables.creditTransaction.$inferSelect>; total: number }> {
  const db = await getDbAsync();
  const { limit = 50, offset = 0, type } = options;

  const whereClause = type
    ? and(
        eq(tables.creditTransaction.userId, userId),
        eq(tables.creditTransaction.type, type),
      )
    : eq(tables.creditTransaction.userId, userId);

  const transactions = await db
    .select()
    .from(tables.creditTransaction)
    .where(whereClause)
    .orderBy(sql`${tables.creditTransaction.createdAt} DESC`)
    .limit(limit)
    .offset(offset);

  // Get total count using raw SQL
  const countResult = await db
    .select()
    .from(tables.creditTransaction)
    .where(whereClause);

  return {
    transactions,
    total: countResult.length,
  };
}
