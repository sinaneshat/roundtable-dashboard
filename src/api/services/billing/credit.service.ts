/**
 * Credit Service
 *
 * Balance tracking, reservations, deductions, grants, transaction ledger.
 * Optimistic locking prevents concurrent update conflicts.
 */

import 'server-only';

import { and, desc, eq, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { z } from 'zod';

import { invalidateCreditBalanceCache } from '@/api/common/cache-utils';
import { createError } from '@/api/common/error-handling';
import type { ErrorContext } from '@/api/core';
import type { CreditAction, CreditGrantType, CreditTransactionType } from '@/api/core/enums';
import {
  CreditActions,
  CreditActionSchema,
  CreditTransactionTypes,
  DatabaseOperations,
  ErrorContextTypes,
  getGrantTransactionType,
  parsePlanType,
  PlanTypes,
  PlanTypeSchema,
  StripeSubscriptionStatuses,
  SubscriptionTiers,
} from '@/api/core/enums';
import { getModelById } from '@/api/services/models';
import { getDbAsync } from '@/db';
import * as tables from '@/db';
import { DbTextPartSchema } from '@/db/schemas/chat-metadata';
import type { UserCreditBalance } from '@/db/validation';
import { CREDIT_CONFIG } from '@/lib/config/credit-config';

import {
  calculateWeightedCredits,
  getActionCreditCost,
  getModelPricingTierById,
  getPlanConfig,
} from './product-logic.service';

// ============================================================================
// OPTIMISTIC LOCKING CONFIGURATION
// ============================================================================

const MAX_OPTIMISTIC_LOCK_RETRIES = 5;

/**
 * Wraps a database operation with optimistic lock retry logic.
 * Prevents infinite recursion and provides proper error handling.
 *
 * @param operation - Async function that performs the DB update and returns result array
 * @param onRetry - Function to call on retry (for re-fetching fresh version)
 * @param context - Error context for logging
 * @param context.operation - Operation name for error messages
 * @param context.userId - User ID for error context
 * @param retryCount - Current retry count (internal)
 */
async function withOptimisticLockRetry<T>(
  operation: () => Promise<T[]>,
  onRetry: () => Promise<void>,
  context: { operation: string; userId: string },
  retryCount = 0,
): Promise<T> {
  if (retryCount >= MAX_OPTIMISTIC_LOCK_RETRIES) {
    const errorContext: ErrorContext = {
      errorType: ErrorContextTypes.DATABASE,
      operation: DatabaseOperations.UPDATE,
      table: 'user_credit_balance',
      userId: context.userId,
    };
    throw createError.conflict(
      `Credit operation failed after ${MAX_OPTIMISTIC_LOCK_RETRIES} retries due to concurrent updates. Please try again.`,
      errorContext,
    );
  }

  try {
    const result = await operation();

    if (result.length === 0) {
      // Optimistic lock failure - version mismatch, retry with fresh data
      await onRetry();
      return withOptimisticLockRetry(operation, onRetry, context, retryCount + 1);
    }

    return result[0]!;
  } catch (error) {
    // Sanitize database errors - don't expose raw SQL to clients
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check if this is a D1/Drizzle error (contains "Failed query" or SQL)
    if (
      errorMessage.includes('Failed query')
      || errorMessage.includes('UPDATE')
      || errorMessage.includes('INSERT')
      || errorMessage.includes('SELECT')
    ) {
      console.error(`[CreditService] Database error in ${context.operation}:`, {
        userId: context.userId,
        error: errorMessage,
        retryCount,
      });

      const errorContext: ErrorContext = {
        errorType: ErrorContextTypes.DATABASE,
        operation: DatabaseOperations.UPDATE,
        table: 'user_credit_balance',
        userId: context.userId,
      };
      throw createError.database(
        `Credit operation failed. Please try again later.`,
        errorContext,
      );
    }

    // Re-throw non-database errors as-is
    throw error;
  }
}

const _CreditBalanceInfoSchema = z.object({
  balance: z.number(),
  reserved: z.number(),
  available: z.number(),
  planType: PlanTypeSchema,
  monthlyCredits: z.number(),
  nextRefillAt: z.date().nullable(),
});

export type CreditBalanceInfo = z.infer<typeof _CreditBalanceInfoSchema>;

const _TokenUsageSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  action: CreditActionSchema,
  threadId: z.string().optional(),
  messageId: z.string().optional(),
  modelId: z.string(),
});

export type TokenUsage = z.infer<typeof _TokenUsageSchema>;

const _EnforceCreditsOptionsSchema = z.object({
  skipRoundCheck: z.boolean().optional(),
});

export type EnforceCreditsOptions = z.infer<typeof _EnforceCreditsOptionsSchema>;

export async function ensureUserCreditRecord(userId: string): Promise<UserCreditBalance> {
  const db = await getDbAsync();

  // ✅ PERF: Add KV cache to credit balance lookup (60s TTL)
  const existingResults = await db
    .select()
    .from(tables.userCreditBalance)
    .where(eq(tables.userCreditBalance.userId, userId))
    .limit(1)
    .$withCache({
      config: { ex: 60 }, // 1 minute cache - balance changes frequently
      tag: `credit-balance-${userId}`,
    });

  if (existingResults[0]) {
    return existingResults[0];
  }

  const now = new Date();
  const signupCredits = CREDIT_CONFIG.SIGNUP_CREDITS;
  let wasInserted = false;

  try {
    const insertResult = await db
      .insert(tables.userCreditBalance)
      .values({
        id: ulid(),
        userId,
        balance: signupCredits,
        reservedCredits: 0,
        planType: PlanTypes.FREE,
        monthlyCredits: 0,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: tables.userCreditBalance.userId })
      .returning();

    wasInserted = insertResult.length > 0;
  } catch {
    // Insert failed (likely race condition) - will fetch existing record below
  }
  const finalResults = await db
    .select()
    .from(tables.userCreditBalance)
    .where(eq(tables.userCreditBalance.userId, userId))
    .limit(1);

  const record = finalResults[0];

  if (!record) {
    const context: ErrorContext = {
      errorType: ErrorContextTypes.DATABASE,
      operation: DatabaseOperations.INSERT,
      table: 'user_credit_balance',
      userId,
    };
    throw createError.internal('Failed to create credit record', context);
  }

  if (wasInserted && signupCredits > 0) {
    try {
      await recordTransaction({
        userId,
        type: CreditTransactionTypes.CREDIT_GRANT,
        amount: signupCredits,
        balanceAfter: signupCredits,
        action: CreditActions.SIGNUP_BONUS,
        description: 'Signup bonus credits - one free round',
      });
    } catch {
      // Transaction recording failed - non-critical
    }
  }

  return record;
}

export async function getUserCreditBalance(userId: string): Promise<CreditBalanceInfo> {
  const record = await ensureUserCreditRecord(userId);

  return {
    balance: record.balance,
    reserved: record.reservedCredits,
    available: Math.max(0, record.balance - record.reservedCredits),
    planType: parsePlanType(record.planType),
    monthlyCredits: record.monthlyCredits,
    nextRefillAt: record.nextRefillAt,
  };
}

export async function canAffordCredits(userId: string, requiredCredits: number): Promise<boolean> {
  const balance = await getUserCreditBalance(userId);
  return balance.available >= requiredCredits;
}

export async function enforceCredits(
  userId: string,
  requiredCredits: number,
  options?: EnforceCreditsOptions,
): Promise<void> {
  let balance = await getUserCreditBalance(userId);

  // Skip round check for operations that are part of completing the round
  // (e.g., moderator analysis which must run to mark round as complete)
  if (balance.planType === PlanTypes.FREE && !options?.skipRoundCheck) {
    const hasCompletedRound = await checkFreeUserHasCompletedRound(userId);
    if (hasCompletedRound) {
      const context: ErrorContext = {
        errorType: ErrorContextTypes.RESOURCE,
        resource: 'credits',
        userId,
      };
      throw createError.badRequest(
        'Your free conversation round has been used. Subscribe to Pro to continue chatting.',
        context,
      );
    }
  }

  if (balance.available < requiredCredits) {
    const hasActiveSubscription = await checkHasActiveSubscription(userId);

    if (hasActiveSubscription && balance.planType !== PlanTypes.PAID) {
      await provisionPaidUserCredits(userId);
      balance = await getUserCreditBalance(userId);

      if (balance.available >= requiredCredits) {
        return;
      }
    }

    const context: ErrorContext = {
      errorType: ErrorContextTypes.RESOURCE,
      resource: 'credits',
      userId,
    };

    throw createError.badRequest(
      `Insufficient credits. Required: ${requiredCredits}, Available: ${balance.available}. `
      + `${balance.planType === PlanTypes.FREE ? 'Subscribe to Pro or ' : ''}Purchase additional credits to continue.`,
      context,
    );
  }
}
async function checkHasActiveSubscription(userId: string): Promise<boolean> {
  const db = await getDbAsync();

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
    .limit(1)
    .$withCache({
      config: { ex: 120 },
      tag: `has-active-sub-${userId}`,
    });

  return results.length > 0;
}

export async function checkFreeUserHasCreatedThread(userId: string): Promise<boolean> {
  const db = await getDbAsync();

  const existingThread = await db
    .select()
    .from(tables.chatThread)
    .where(eq(tables.chatThread.userId, userId))
    .limit(1);

  return existingThread.length > 0;
}

export async function isFreeUserWithPendingRound(
  userId: string,
  userTier: string,
): Promise<boolean> {
  if (userTier !== SubscriptionTiers.FREE) {
    return false;
  }
  const hasCompletedRound = await checkFreeUserHasCompletedRound(userId);
  return !hasCompletedRound;
}

export async function checkFreeUserHasCompletedRound(userId: string): Promise<boolean> {
  const db = await getDbAsync();

  const freeRoundTransaction = await db
    .select()
    .from(tables.creditTransaction)
    .where(
      and(
        eq(tables.creditTransaction.userId, userId),
        eq(tables.creditTransaction.action, CreditActions.FREE_ROUND_COMPLETE),
      ),
    )
    .limit(1);

  if (freeRoundTransaction.length > 0) {
    return true;
  }

  // Get the user's thread (free users can only have one)
  const thread = await db.query.chatThread.findFirst({
    where: eq(tables.chatThread.userId, userId),
  });

  if (!thread) {
    return false; // No thread = no round completed
  }

  // Get enabled participants for this thread
  const enabledParticipants = await db.query.chatParticipant.findMany({
    where: and(
      eq(tables.chatParticipant.threadId, thread.id),
      eq(tables.chatParticipant.isEnabled, true),
    ),
  });

  if (enabledParticipants.length === 0) {
    return false; // No participants = no round can be completed
  }

  // Get assistant messages in round 0 (first round, 0-based)
  const round0AssistantMessages = await db
    .select()
    .from(tables.chatMessage)
    .where(
      and(
        eq(tables.chatMessage.threadId, thread.id),
        eq(tables.chatMessage.role, 'assistant'),
        eq(tables.chatMessage.roundNumber, 0),
      ),
    );

  // Count unique participants that have responded in round 0
  const respondedParticipantIds = new Set(
    round0AssistantMessages
      .map(m => m.participantId)
      .filter((id): id is string => id !== null),
  );

  // All participants must have responded
  const allParticipantsResponded = respondedParticipantIds.size >= enabledParticipants.length;

  if (!allParticipantsResponded) {
    return false;
  }

  if (enabledParticipants.length >= 2) {
    const moderatorMessageId = `${thread.id}_r0_moderator`;
    const moderatorMessage = await db.query.chatMessage.findFirst({
      where: eq(tables.chatMessage.id, moderatorMessageId),
    });

    if (!moderatorMessage) {
      return false;
    }

    const hasModeContent = Array.isArray(moderatorMessage.parts)
      && moderatorMessage.parts.length > 0
      && moderatorMessage.parts.some((part) => {
        const result = DbTextPartSchema.safeParse(part);
        return result.success && result.data.text.trim().length > 0;
      });

    if (!hasModeContent) {
      return false;
    }
  }

  return true;
}

export async function zeroOutFreeUserCredits(userId: string): Promise<void> {
  const db = await getDbAsync();

  const record = await ensureUserCreditRecord(userId);

  if (record.planType !== PlanTypes.FREE) {
    return;
  }

  const previousBalance = record.balance;

  await db
    .update(tables.userCreditBalance)
    .set({
      balance: 0,
      reservedCredits: 0,
      updatedAt: new Date(),
    })
    .where(eq(tables.userCreditBalance.userId, userId));

  if (previousBalance > 0) {
    await recordTransaction({
      userId,
      type: CreditTransactionTypes.DEDUCTION,
      action: CreditActions.FREE_ROUND_COMPLETE,
      amount: -previousBalance,
      balanceAfter: 0,
      description: 'Free round completed - credits exhausted',
    });
  }
}

async function provisionPaidUserCredits(userId: string): Promise<void> {
  const db = await getDbAsync();
  const planConfig = getPlanConfig(PlanTypes.PAID);
  const now = new Date();
  const nextRefill = new Date(now);
  nextRefill.setMonth(nextRefill.getMonth() + 1);

  await db
    .update(tables.userCreditBalance)
    .set({
      planType: PlanTypes.PAID,
      balance: planConfig.monthlyCredits,
      monthlyCredits: planConfig.monthlyCredits,
      lastRefillAt: now,
      nextRefillAt: nextRefill,
      updatedAt: now,
    })
    .where(eq(tables.userCreditBalance.userId, userId));

  await recordTransaction({
    userId,
    type: CreditTransactionTypes.MONTHLY_REFILL,
    action: CreditActions.MONTHLY_RENEWAL,
    amount: planConfig.monthlyCredits,
    balanceAfter: planConfig.monthlyCredits,
    description: 'Credits provisioned (subscription sync recovery)',
  });
}

export async function reserveCredits(
  userId: string,
  streamId: string,
  estimatedCredits: number,
  options?: EnforceCreditsOptions,
): Promise<void> {
  const db = await getDbAsync();

  await enforceCredits(userId, estimatedCredits, options);

  // Mutable ref to track current record for retries
  let currentRecord = await ensureUserCreditRecord(userId);

  const updatedRecord = await withOptimisticLockRetry(
    () =>
      db
        .update(tables.userCreditBalance)
        .set({
          reservedCredits: sql`${tables.userCreditBalance.reservedCredits} + ${estimatedCredits}`,
          version: sql`${tables.userCreditBalance.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(tables.userCreditBalance.userId, userId),
            eq(tables.userCreditBalance.version, currentRecord.version),
          ),
        )
        .returning(),
    async () => {
      // Re-fetch fresh record on retry
      currentRecord = await ensureUserCreditRecord(userId);
    },
    { operation: 'reserveCredits', userId },
  );

  await recordTransaction({
    userId,
    type: CreditTransactionTypes.RESERVATION,
    amount: -estimatedCredits, // Negative to show credits are held
    balanceAfter: updatedRecord.balance,
    streamId,
    description: `Reserved ${estimatedCredits} credits for streaming`,
  });
}

export async function finalizeCredits(
  userId: string,
  streamId: string,
  actualUsage: TokenUsage,
): Promise<void> {
  const db = await getDbAsync();

  // Mutable ref to track current record for retries
  let currentRecord = await ensureUserCreditRecord(userId);

  // Calculate weighted credits based on model pricing tier
  const weightedCredits = calculateWeightedCredits(
    actualUsage.inputTokens,
    actualUsage.outputTokens,
    actualUsage.modelId,
    getModelById,
  );

  // Get pricing tier and model info for transaction logging
  const pricingTier = getModelPricingTierById(actualUsage.modelId, getModelById);
  const totalTokens = actualUsage.inputTokens + actualUsage.outputTokens;
  const model = getModelById(actualUsage.modelId);
  const inputPricingMicro = model ? Math.round(Number.parseFloat(model.pricing.prompt) * 1_000_000 * 1_000_000) : undefined;
  const outputPricingMicro = model ? Math.round(Number.parseFloat(model.pricing.completion) * 1_000_000 * 1_000_000) : undefined;

  const updatedRecord = await withOptimisticLockRetry(
    () =>
      db
        .update(tables.userCreditBalance)
        .set({
          balance: sql`${tables.userCreditBalance.balance} - ${weightedCredits}`,
          reservedCredits: sql`CASE
            WHEN ${tables.userCreditBalance.reservedCredits} >= ${weightedCredits}
            THEN ${tables.userCreditBalance.reservedCredits} - ${weightedCredits}
            ELSE 0
          END`,
          version: sql`${tables.userCreditBalance.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(tables.userCreditBalance.userId, userId),
            eq(tables.userCreditBalance.version, currentRecord.version),
          ),
        )
        .returning(),
    async () => {
      // Re-fetch fresh record on retry
      currentRecord = await ensureUserCreditRecord(userId);
    },
    { operation: 'finalizeCredits', userId },
  );

  await recordTransaction({
    userId,
    type: CreditTransactionTypes.DEDUCTION,
    amount: -weightedCredits,
    balanceAfter: updatedRecord.balance,
    inputTokens: actualUsage.inputTokens,
    outputTokens: actualUsage.outputTokens,
    totalTokens,
    creditsUsed: weightedCredits,
    threadId: actualUsage.threadId,
    messageId: actualUsage.messageId,
    streamId,
    action: actualUsage.action,
    modelId: actualUsage.modelId,
    modelPricingInputPerMillion: inputPricingMicro,
    modelPricingOutputPerMillion: outputPricingMicro,
    description: `AI response (${pricingTier}): ${totalTokens} tokens = ${weightedCredits} credits`,
  });
}

export async function releaseReservation(
  userId: string,
  streamId: string,
  reservedAmount?: number,
): Promise<void> {
  const db = await getDbAsync();

  if (reservedAmount === undefined) {
    return;
  }

  // Mutable ref to track current record for retries
  let currentRecord = await ensureUserCreditRecord(userId);

  const updatedRecord = await withOptimisticLockRetry(
    () =>
      db
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
            eq(tables.userCreditBalance.version, currentRecord.version),
          ),
        )
        .returning(),
    async () => {
      // Re-fetch fresh record on retry
      currentRecord = await ensureUserCreditRecord(userId);
    },
    { operation: 'releaseReservation', userId },
  );

  await recordTransaction({
    userId,
    type: CreditTransactionTypes.RELEASE,
    amount: reservedAmount,
    balanceAfter: updatedRecord.balance,
    streamId,
    description: `Released ${reservedAmount} reserved credits (cancelled/error)`,
  });
}

export async function grantCredits(
  userId: string,
  amount: number,
  type: CreditGrantType,
  description?: string,
): Promise<void> {
  const db = await getDbAsync();

  // Mutable ref to track current record for retries
  let currentRecord = await ensureUserCreditRecord(userId);

  const updatedRecord = await withOptimisticLockRetry(
    () =>
      db
        .update(tables.userCreditBalance)
        .set({
          balance: sql`${tables.userCreditBalance.balance} + ${amount}`,
          version: sql`${tables.userCreditBalance.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(tables.userCreditBalance.userId, userId),
            eq(tables.userCreditBalance.version, currentRecord.version),
          ),
        )
        .returning(),
    async () => {
      // Re-fetch fresh record on retry
      currentRecord = await ensureUserCreditRecord(userId);
    },
    { operation: 'grantCredits', userId },
  );

  const actionMap: Record<CreditGrantType, CreditAction> = {
    credit_grant: CreditActions.SIGNUP_BONUS,
    monthly_refill: CreditActions.MONTHLY_RENEWAL,
    purchase: CreditActions.CREDIT_PURCHASE,
  };

  await recordTransaction({
    userId,
    type: getGrantTransactionType(type),
    amount,
    balanceAfter: updatedRecord.balance,
    action: actionMap[type],
    description: description || `Granted ${amount} credits`,
  });
}

const ACTION_COST_TO_CREDIT_ACTION_MAP: Record<keyof typeof CREDIT_CONFIG.ACTION_COSTS, CreditAction> = {
  threadCreation: CreditActions.THREAD_CREATION,
  webSearchQuery: CreditActions.WEB_SEARCH,
  fileReading: CreditActions.FILE_READING,
  analysisGeneration: CreditActions.ANALYSIS_GENERATION,
  customRoleCreation: CreditActions.THREAD_CREATION,
  autoModeAnalysis: CreditActions.ANALYSIS_GENERATION, // Uses same action type for tracking
} as const;

export async function deductCreditsForAction(
  userId: string,
  action: keyof typeof CREDIT_CONFIG.ACTION_COSTS,
  context?: { threadId?: string; description?: string },
): Promise<void> {
  const credits = getActionCreditCost(action);

  await enforceCredits(userId, credits);

  const db = await getDbAsync();

  // Mutable ref to track current record for retries
  let currentRecord = await ensureUserCreditRecord(userId);

  const updatedRecord = await withOptimisticLockRetry(
    () =>
      db
        .update(tables.userCreditBalance)
        .set({
          balance: sql`${tables.userCreditBalance.balance} - ${credits}`,
          version: sql`${tables.userCreditBalance.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(tables.userCreditBalance.userId, userId),
            eq(tables.userCreditBalance.version, currentRecord.version),
          ),
        )
        .returning(),
    async () => {
      // Re-fetch fresh record on retry
      currentRecord = await ensureUserCreditRecord(userId);
    },
    { operation: 'deductCreditsForAction', userId },
  );

  await recordTransaction({
    userId,
    type: CreditTransactionTypes.DEDUCTION,
    amount: -credits,
    balanceAfter: updatedRecord.balance,
    creditsUsed: credits,
    threadId: context?.threadId,
    action: ACTION_COST_TO_CREDIT_ACTION_MAP[action],
    description: context?.description || `${String(action)}: ${credits} credits`,
  });
}

export async function processMonthlyRefill(userId: string): Promise<void> {
  const db = await getDbAsync();

  // Mutable ref to track current record for retries
  let currentRecord = await ensureUserCreditRecord(userId);

  if (currentRecord.planType !== PlanTypes.PAID) {
    return;
  }

  const now = new Date();
  if (currentRecord.nextRefillAt && currentRecord.nextRefillAt > now) {
    return;
  }

  const planConfig = getPlanConfig(PlanTypes.PAID);
  const nextRefill = new Date(now);
  nextRefill.setMonth(nextRefill.getMonth() + 1);

  const updatedRecord = await withOptimisticLockRetry(
    () =>
      db
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
            eq(tables.userCreditBalance.version, currentRecord.version),
          ),
        )
        .returning(),
    async () => {
      // Re-fetch fresh record on retry
      currentRecord = await ensureUserCreditRecord(userId);
    },
    { operation: 'processMonthlyRefill', userId },
  );

  await recordTransaction({
    userId,
    type: CreditTransactionTypes.MONTHLY_REFILL,
    amount: planConfig.monthlyCredits,
    balanceAfter: updatedRecord.balance,
    action: CreditActions.MONTHLY_RENEWAL,
    description: `Monthly refill: ${planConfig.monthlyCredits} credits`,
  });
}

export async function upgradeToPaidPlan(userId: string): Promise<void> {
  const db = await getDbAsync();

  // Mutable ref to track current record for retries
  let currentRecord = await ensureUserCreditRecord(userId);

  if (currentRecord.planType === PlanTypes.PAID) {
    return;
  }

  const planConfig = getPlanConfig(PlanTypes.PAID);
  const now = new Date();
  const nextRefill = new Date(now);
  nextRefill.setMonth(nextRefill.getMonth() + 1);

  const updatedRecord = await withOptimisticLockRetry(
    () =>
      db
        .update(tables.userCreditBalance)
        .set({
          planType: PlanTypes.PAID,
          balance: planConfig.monthlyCredits,
          monthlyCredits: planConfig.monthlyCredits,
          lastRefillAt: now,
          nextRefillAt: nextRefill,
          version: sql`${tables.userCreditBalance.version} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(tables.userCreditBalance.userId, userId),
            eq(tables.userCreditBalance.version, currentRecord.version),
          ),
        )
        .returning(),
    async () => {
      // Re-fetch fresh record on retry
      currentRecord = await ensureUserCreditRecord(userId);
    },
    { operation: 'upgradeToPaidPlan', userId },
  );

  await recordTransaction({
    userId,
    type: CreditTransactionTypes.CREDIT_GRANT,
    amount: planConfig.monthlyCredits,
    balanceAfter: updatedRecord.balance,
    action: CreditActions.MONTHLY_RENEWAL,
    description: `Upgraded to Pro plan: ${planConfig.monthlyCredits} credits`,
  });

  // CRITICAL: Invalidate cached credit balance so subsequent requests see the new planType
  // Without this, thread creation checks may still see planType=FREE from stale cache
  await invalidateCreditBalanceCache(db, userId);
}

const _RecordTransactionSchema = z.object({
  userId: z.string(),
  type: z.custom<CreditTransactionType>(),
  amount: z.number(),
  balanceAfter: z.number(),
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  totalTokens: z.number().optional(),
  creditsUsed: z.number().optional(),
  threadId: z.string().optional(),
  messageId: z.string().optional(),
  streamId: z.string().optional(),
  action: z.custom<CreditAction>().optional(),
  modelId: z.string().optional(),
  modelPricingInputPerMillion: z.number().optional(),
  modelPricingOutputPerMillion: z.number().optional(),
  description: z.string().optional(),
});

export type RecordTransactionParams = z.infer<typeof _RecordTransactionSchema>;

async function recordTransaction(record: RecordTransactionParams): Promise<void> {
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
    modelPricingInputPerMillion: record.modelPricingInputPerMillion,
    modelPricingOutputPerMillion: record.modelPricingOutputPerMillion,
    description: record.description,
    createdAt: new Date(),
  });
}

export type CreditTransactionSelect = typeof tables.creditTransaction.$inferSelect;

export async function getUserTransactionHistory(
  userId: string,
  options: { limit?: number; offset?: number; type?: CreditTransactionType } = {},
): Promise<{ transactions: CreditTransactionSelect[]; total: number }> {
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
    .orderBy(desc(tables.creditTransaction.createdAt))
    .limit(limit)
    .offset(offset);

  const countResult = await db
    .select()
    .from(tables.creditTransaction)
    .where(whereClause);

  return {
    transactions,
    total: countResult.length,
  };
}
