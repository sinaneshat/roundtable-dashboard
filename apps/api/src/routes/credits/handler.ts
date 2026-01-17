import type { RouteHandler } from '@hono/zod-openapi';
import type { UsageStatus } from '@roundtable/shared/enums';
import { CreditActions, PlanTypes, UsageStatuses } from '@roundtable/shared/enums';

import { createHandler, Responses } from '@/core';
import { CREDIT_CONFIG } from '@/lib/config/credit-config';
import {
  canAffordCredits,
  estimateStreamingCredits,
  getUserCreditBalance,
  getUserTransactionHistory,
  tokensToCredits,
} from '@/services/billing';
import type { ApiEnv } from '@/types';

import type {
  estimateCreditCostRoute,
  getCreditBalanceRoute,
  getCreditTransactionsRoute,
} from './route';
import { CreditEstimateRequestSchema, CreditTransactionsQuerySchema } from './schema';

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

    const available = creditBalance.available;

    const totalAllocation = creditBalance.planType === PlanTypes.PAID
      ? creditBalance.monthlyCredits
      : CREDIT_CONFIG.SIGNUP_CREDITS;

    const percentage = totalAllocation > 0
      ? Math.round(((totalAllocation - creditBalance.balance) / totalAllocation) * 100)
      : 0;

    let status: UsageStatus = UsageStatuses.DEFAULT;
    if (available <= 0) {
      status = UsageStatuses.CRITICAL;
    } else if (percentage >= 80) {
      status = UsageStatuses.WARNING;
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
      },
    });
  },
);

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
      { limit, offset, type: query.type },
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
      case CreditActions.AI_RESPONSE:
      case CreditActions.USER_MESSAGE: {
        const participantCount = body.params?.participantCount ?? 1;
        const inputTokens = body.params?.estimatedInputTokens;
        estimatedCredits = estimateStreamingCredits(participantCount, inputTokens);
        break;
      }
      case CreditActions.WEB_SEARCH:
        estimatedCredits = tokensToCredits(CREDIT_CONFIG.ACTION_COSTS.webSearchQuery);
        break;
      case CreditActions.THREAD_CREATION:
        estimatedCredits = tokensToCredits(CREDIT_CONFIG.ACTION_COSTS.threadCreation);
        break;
      case CreditActions.FILE_READING:
        estimatedCredits = tokensToCredits(CREDIT_CONFIG.ACTION_COSTS.fileReading);
        break;
      case CreditActions.ANALYSIS_GENERATION:
        estimatedCredits = tokensToCredits(CREDIT_CONFIG.ACTION_COSTS.analysisGeneration);
        break;
      default:
        estimatedCredits = 1;
    }

    const creditBalance = await getUserCreditBalance(user.id);
    const currentBalance = creditBalance.available;

    const canAfford = await canAffordCredits(user.id, estimatedCredits);

    return Responses.ok(c, {
      estimatedCredits,
      canAfford,
      currentBalance,
      balanceAfter: currentBalance - estimatedCredits,
    });
  },
);
