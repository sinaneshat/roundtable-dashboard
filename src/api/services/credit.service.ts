/**
 * Credit Service
 *
 * Balance tracking, reservations, deductions, grants, transaction ledger.
 * Optimistic locking prevents concurrent update conflicts.
 */

import { and, desc, eq, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { z } from 'zod';

import { createError } from '@/api/common/error-handling';
import type { ErrorContext } from '@/api/core';
import type { CreditAction, CreditTransactionType } from '@/api/core/enums';
import { CreditActionSchema, CreditTransactionTypes, DatabaseOperations, ErrorContextTypes, getGrantTransactionType, parsePlanType, PlanTypes, PlanTypeSchema, StripeSubscriptionStatuses } from '@/api/core/enums';
import { getModelById } from '@/api/services/models-config.service';
import {
  calculateWeightedCredits,
  getActionCreditCost,
  getModelPricingTierById,
  getPlanConfig,
} from '@/api/services/product-logic.service';
import { getDbAsync } from '@/db';
import * as tables from '@/db';
import type { CreditTransactionMetadata, UserCreditBalance } from '@/db/validation';
import { CREDIT_CONFIG } from '@/lib/config/credit-config';

export const CreditBalanceInfoSchema = z.object({
  balance: z.number(),
  reserved: z.number(),
  available: z.number(),
  planType: PlanTypeSchema,
  monthlyCredits: z.number(),
  nextRefillAt: z.date().nullable(),
});

export type CreditBalanceInfo = z.infer<typeof CreditBalanceInfoSchema>;

export const TokenUsageSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  action: CreditActionSchema,
  threadId: z.string().optional(),
  messageId: z.string().optional(),
  modelId: z.string(), // Required for model-weighted credit calculation
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

/**
 * Get or create user credit balance record with signup credits for new users.
 * SELECT-first + INSERT OR IGNORE pattern handles race conditions atomically.
 */
export async function ensureUserCreditRecord(userId: string): Promise<UserCreditBalance> {
  const db = await getDbAsync();

  const existingResults = await db
    .select()
    .from(tables.userCreditBalance)
    .where(eq(tables.userCreditBalance.userId, userId))
    .limit(1);

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
  } catch (insertError) {
    console.error('[ensureUserCreditRecord] Insert failed, checking if record exists:', insertError);
  }
  const finalResults = await db
    .select()
    .from(tables.userCreditBalance)
    .where(eq(tables.userCreditBalance.userId, userId))
    .limit(1);

  const record = finalResults[0];

  if (record) {
    if (wasInserted && signupCredits > 0) {
      try {
        await recordTransaction({
          userId,
          type: CreditTransactionTypes.CREDIT_GRANT,
          amount: signupCredits,
          balanceAfter: signupCredits,
          action: 'signup_bonus',
          description: 'Signup bonus credits - one free round',
        });
      } catch (txError) {
        console.error('[ensureUserCreditRecord] Failed to record signup transaction:', txError);
      }
    }
    return record;
  }

  const context: ErrorContext = {
    errorType: ErrorContextTypes.DATABASE,
    operation: DatabaseOperations.INSERT,
    table: 'user_credit_balance',
    userId,
  };
  throw createError.internal('Failed to create credit record: User may not exist or database error occurred', context);
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
export async function enforceCredits(userId: string, requiredCredits: number): Promise<void> {
  let balance = await getUserCreditBalance(userId);

  if (balance.planType === PlanTypes.FREE) {
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

const FREE_ROUND_COMPLETE_ACTION = 'free_round_complete' as const;

/**
 * Check if a free user has already created a thread.
 * Free users are limited to ONE thread total.
 */
export async function checkFreeUserHasCreatedThread(userId: string): Promise<boolean> {
  const db = await getDbAsync();

  const existingThread = await db
    .select()
    .from(tables.chatThread)
    .where(eq(tables.chatThread.userId, userId))
    .limit(1);

  return existingThread.length > 0;
}

/**
 * Check if a free user has completed their one free round.
 * A round is complete when ALL enabled participants have responded in round 0.
 * This is the security gate to prevent free users from getting unlimited usage.
 */
export async function checkFreeUserHasCompletedRound(userId: string): Promise<boolean> {
  const db = await getDbAsync();

  // Fast path: Check for explicit "free_round_complete" transaction marker
  const freeRoundTransaction = await db
    .select()
    .from(tables.creditTransaction)
    .where(
      and(
        eq(tables.creditTransaction.userId, userId),
        eq(tables.creditTransaction.action, FREE_ROUND_COMPLETE_ACTION),
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

  // Round is complete when ALL enabled participants have responded
  return respondedParticipantIds.size >= enabledParticipants.length;
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
      action: FREE_ROUND_COMPLETE_ACTION,
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
    action: 'monthly_renewal',
    amount: planConfig.monthlyCredits,
    balanceAfter: planConfig.monthlyCredits,
    description: 'Credits provisioned (subscription sync recovery)',
  });
}

export async function reserveCredits(
  userId: string,
  streamId: string,
  estimatedCredits: number,
): Promise<void> {
  const db = await getDbAsync();

  await enforceCredits(userId, estimatedCredits);

  const record = await ensureUserCreditRecord(userId);

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
    return reserveCredits(userId, streamId, estimatedCredits);
  }

  await recordTransaction({
    userId,
    type: CreditTransactionTypes.RESERVATION,
    amount: -estimatedCredits, // Negative to show credits are held
    balanceAfter: result[0].balance,
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

  const record = await ensureUserCreditRecord(userId);

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
  // Store pricing as micro-dollars per million tokens (e.g., $1.50/M = 1500000)
  const inputPricingMicro = model ? Math.round(Number.parseFloat(model.pricing.prompt) * 1_000_000 * 1_000_000) : undefined;
  const outputPricingMicro = model ? Math.round(Number.parseFloat(model.pricing.completion) * 1_000_000 * 1_000_000) : undefined;

  const result = await db
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
        eq(tables.userCreditBalance.version, record.version),
      ),
    )
    .returning();

  if (!result[0]) {
    return finalizeCredits(userId, streamId, actualUsage);
  }

  await recordTransaction({
    userId,
    type: CreditTransactionTypes.DEDUCTION,
    amount: -weightedCredits,
    balanceAfter: result[0].balance,
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

  const record = await ensureUserCreditRecord(userId);

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
    return releaseReservation(userId, streamId, reservedAmount);
  }

  await recordTransaction({
    userId,
    type: CreditTransactionTypes.RELEASE,
    amount: reservedAmount,
    balanceAfter: result[0].balance,
    streamId,
    description: `Released ${reservedAmount} reserved credits (cancelled/error)`,
  });
}

type GrantType = 'credit_grant' | 'monthly_refill' | 'purchase';

export async function grantCredits(
  userId: string,
  amount: number,
  type: GrantType,
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
    return grantCredits(userId, amount, type, description);
  }

  await recordTransaction({
    userId,
    type: getGrantTransactionType(type),
    amount,
    balanceAfter: result[0].balance,
    action: type === 'monthly_refill' ? 'monthly_renewal' : type === 'purchase' ? 'credit_purchase' : 'signup_bonus',
    description: description || `Granted ${amount} credits`,
  });
}

const ACTION_COST_TO_CREDIT_ACTION_MAP: Record<keyof typeof CREDIT_CONFIG.ACTION_COSTS, CreditAction> = {
  threadCreation: 'thread_creation',
  webSearchQuery: 'web_search',
  fileReading: 'file_reading',
  analysisGeneration: 'analysis_generation',
  customRoleCreation: 'thread_creation',
} as const;

export async function deductCreditsForAction(
  userId: string,
  action: keyof typeof CREDIT_CONFIG.ACTION_COSTS,
  context?: { threadId?: string; description?: string },
): Promise<void> {
  const credits = getActionCreditCost(action);

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
    return deductCreditsForAction(userId, action, context);
  }

  await recordTransaction({
    userId,
    type: CreditTransactionTypes.DEDUCTION,
    amount: -credits,
    balanceAfter: result[0].balance,
    creditsUsed: credits,
    threadId: context?.threadId,
    action: ACTION_COST_TO_CREDIT_ACTION_MAP[action],
    description: context?.description || `${String(action)}: ${credits} credits`,
  });
}

export async function processMonthlyRefill(userId: string): Promise<void> {
  const db = await getDbAsync();

  const record = await ensureUserCreditRecord(userId);

  if (record.planType !== PlanTypes.PAID) {
    return;
  }

  const now = new Date();
  if (record.nextRefillAt && record.nextRefillAt > now) {
    return;
  }

  const planConfig = getPlanConfig(PlanTypes.PAID);
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
    return processMonthlyRefill(userId);
  }

  await recordTransaction({
    userId,
    type: CreditTransactionTypes.MONTHLY_REFILL,
    amount: planConfig.monthlyCredits,
    balanceAfter: result[0].balance,
    action: 'monthly_renewal',
    description: `Monthly refill: ${planConfig.monthlyCredits} credits`,
  });
}

export async function upgradeToPaidPlan(userId: string): Promise<void> {
  const db = await getDbAsync();

  const record = await ensureUserCreditRecord(userId);
  const planConfig = getPlanConfig(PlanTypes.PAID);
  const now = new Date();
  const nextRefill = new Date(now);
  nextRefill.setMonth(nextRefill.getMonth() + 1);

  const result = await db
    .update(tables.userCreditBalance)
    .set({
      planType: 'paid',
      balance: sql`${tables.userCreditBalance.balance} + ${planConfig.monthlyCredits}`,
      monthlyCredits: planConfig.monthlyCredits,
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

  await recordTransaction({
    userId,
    type: CreditTransactionTypes.CREDIT_GRANT,
    amount: planConfig.monthlyCredits,
    balanceAfter: result[0].balance,
    action: 'monthly_renewal',
    description: `Upgraded to Pro plan: ${planConfig.monthlyCredits} credits`,
  });
}

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
  // Model pricing at time of transaction (micro-dollars per million tokens)
  modelPricingInputPerMillion?: number;
  modelPricingOutputPerMillion?: number;
  description?: string;
  metadata?: CreditTransactionMetadata;
};

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
    modelPricingInputPerMillion: record.modelPricingInputPerMillion,
    modelPricingOutputPerMillion: record.modelPricingOutputPerMillion,
    description: record.description,
    metadata: record.metadata,
    createdAt: new Date(),
  });
}

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
