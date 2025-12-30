import type { RouteHandler } from '@hono/zod-openapi';

import { createHandler, Responses } from '@/api/core';
import type { UsageStatus } from '@/api/core/enums';
import {
  canAffordCredits,
  getUserCreditBalance,
  getUserTransactionHistory,
} from '@/api/services/credit.service';
import {
  estimateStreamingCredits,
  tokensToCredits,
} from '@/api/services/product-logic.service';
import type { ApiEnv } from '@/api/types';
import { CREDIT_CONFIG } from '@/lib/config/credit-config';

import type {
  estimateCreditCostRoute,
  getCreditBalanceRoute,
  getCreditTransactionsRoute,
} from './route';
import { CreditEstimateRequestSchema, CreditTransactionsQuerySchema } from './schema';

// ============================================================================
// Credit Balance Handler
// ============================================================================

/**
 * Get current credit balance and plan information
 */
export const getCreditBalanceHandler: RouteHandler<
  typeof getCreditBalanceRoute,
  ApiEnv
> = createHandler(
  {
    auth: 'session',
    operationName: 'getCreditBalance',
  },
  async (c) => {
    const { user } = c.auth();

    const creditBalance = await getUserCreditBalance(user.id);

    // Calculate available credits (reserved is already computed in CreditBalanceInfo)
    const available = creditBalance.available;

    // Calculate percentage used from monthly/signup allocation
    const totalAllocation = creditBalance.planType === 'paid'
      ? creditBalance.monthlyCredits
      : CREDIT_CONFIG.PLANS.free.signupCredits;

    const percentage = totalAllocation > 0
      ? Math.round(((totalAllocation - creditBalance.balance) / totalAllocation) * 100)
      : 0;

    // Determine status based on remaining credits
    let status: UsageStatus = 'default';
    if (available <= 0) {
      status = 'critical';
    } else if (percentage >= 80) {
      status = 'warning';
    }

    return Responses.ok(c, {
      balance: creditBalance.balance,
      reserved: creditBalance.reserved,
      available,
      status,
      percentage: Math.min(percentage, 100),
      plan: {
        type: creditBalance.planType,
        monthlyCredits: creditBalance.monthlyCredits,
        nextRefillAt: creditBalance.nextRefillAt?.toISOString() ?? null,
        payAsYouGoEnabled: creditBalance.payAsYouGoEnabled,
      },
    });
  },
);

// ============================================================================
// Credit Transactions Handler
// ============================================================================

/**
 * Get credit transaction history with pagination
 */
export const getCreditTransactionsHandler: RouteHandler<
  typeof getCreditTransactionsRoute,
  ApiEnv
> = createHandler(
  {
    auth: 'session',
    validateQuery: CreditTransactionsQuerySchema,
    operationName: 'getCreditTransactions',
  },
  async (c) => {
    const { user } = c.auth();
    const query = c.validated.query;

    const limit = query.limit ?? 20;
    const page = query.page ?? 1;
    const offset = (page - 1) * limit;

    const { transactions, total } = await getUserTransactionHistory(
      user.id,
      { limit, offset, type: query.type as 'deduction' | 'credit_grant' | undefined },
    );

    return Responses.ok(c, {
      items: transactions.map(tx => ({
        id: tx.id,
        type: tx.type,
        amount: tx.amount,
        balanceAfter: tx.balanceAfter,
        action: tx.action,
        description: tx.description,
        inputTokens: tx.inputTokens,
        outputTokens: tx.outputTokens,
        threadId: tx.threadId,
        createdAt: tx.createdAt,
      })),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + transactions.length < total,
      },
    });
  },
);

// ============================================================================
// Credit Estimate Handler
// ============================================================================

/**
 * Estimate credit cost for a given action
 */
export const estimateCreditCostHandler: RouteHandler<
  typeof estimateCreditCostRoute,
  ApiEnv
> = createHandler(
  {
    auth: 'session',
    validateBody: CreditEstimateRequestSchema,
    operationName: 'estimateCreditCost',
  },
  async (c) => {
    const { user } = c.auth();
    const body = c.validated.body;

    let estimatedCredits = 0;

    switch (body.action) {
      case 'ai_response':
      case 'user_message': {
        // Streaming estimation
        const participantCount = body.params?.participantCount ?? 1;
        const inputTokens = body.params?.estimatedInputTokens;
        estimatedCredits = estimateStreamingCredits(participantCount, inputTokens);
        break;
      }
      case 'web_search':
        estimatedCredits = tokensToCredits(CREDIT_CONFIG.ACTION_COSTS.webSearchQuery);
        break;
      case 'thread_creation':
        estimatedCredits = tokensToCredits(CREDIT_CONFIG.ACTION_COSTS.threadCreation);
        break;
      case 'file_reading':
        estimatedCredits = tokensToCredits(CREDIT_CONFIG.ACTION_COSTS.fileReading);
        break;
      case 'analysis_generation':
        estimatedCredits = tokensToCredits(CREDIT_CONFIG.ACTION_COSTS.analysisGeneration);
        break;
      default:
        // Default minimum
        estimatedCredits = 1;
    }

    // Get current balance
    const creditBalance = await getUserCreditBalance(user.id);
    const currentBalance = creditBalance.available;

    // Check affordability
    const canAfford = await canAffordCredits(user.id, estimatedCredits);

    return Responses.ok(c, {
      estimatedCredits,
      canAfford,
      currentBalance,
      balanceAfter: currentBalance - estimatedCredits,
    });
  },
);
