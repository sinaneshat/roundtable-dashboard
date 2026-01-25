import type { RouteHandler } from '@hono/zod-openapi';
import { CREDIT_CONFIG } from '@roundtable/shared';
import type { CreditAction, UsageStatus } from '@roundtable/shared/enums';
import { CreditActions, PlanTypes, UsageStatuses } from '@roundtable/shared/enums';

import { createHandler, Responses } from '@/core';
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

// ============================================================================
// Credit Action Calculator Registry
// ============================================================================

type CreditEstimateParams = {
  participantCount: number;
  inputTokens: number;
};

type CreditCalculator = (params: CreditEstimateParams) => number;

const CREDIT_ACTION_CALCULATORS: Record<CreditAction, CreditCalculator> = {
  [CreditActions.AI_RESPONSE]: p => estimateStreamingCredits(p.participantCount, p.inputTokens),
  [CreditActions.USER_MESSAGE]: p => estimateStreamingCredits(p.participantCount, p.inputTokens),
  [CreditActions.WEB_SEARCH]: () => tokensToCredits(CREDIT_CONFIG.ACTION_COSTS.webSearchQuery),
  [CreditActions.THREAD_CREATION]: () => tokensToCredits(CREDIT_CONFIG.ACTION_COSTS.threadCreation),
  [CreditActions.FILE_READING]: () => tokensToCredits(CREDIT_CONFIG.ACTION_COSTS.fileReading),
  [CreditActions.ANALYSIS_GENERATION]: () => tokensToCredits(CREDIT_CONFIG.ACTION_COSTS.analysisGeneration),
  [CreditActions.MEMORY_EXTRACTION]: () => tokensToCredits(CREDIT_CONFIG.ACTION_COSTS.memoryExtraction),
  [CreditActions.RAG_QUERY]: () => tokensToCredits(CREDIT_CONFIG.ACTION_COSTS.ragQuery),
  [CreditActions.PROJECT_FILE_LINK]: () => tokensToCredits(CREDIT_CONFIG.ACTION_COSTS.projectFileLink),
  [CreditActions.PROJECT_STORAGE]: () => tokensToCredits(CREDIT_CONFIG.ACTION_COSTS.projectStoragePer10MB),
  // Grant actions - return 0 for estimation (not deductions)
  [CreditActions.SIGNUP_BONUS]: () => 0,
  [CreditActions.MONTHLY_RENEWAL]: () => 0,
  [CreditActions.CREDIT_PURCHASE]: () => 0,
  [CreditActions.FREE_ROUND_COMPLETE]: () => 0,
};

function calculateCreditCost(action: CreditAction, params: CreditEstimateParams): number {
  return CREDIT_ACTION_CALCULATORS[action](params);
}

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

    const params: CreditEstimateParams = {
      participantCount: body.params?.participantCount ?? 1,
      inputTokens: body.params?.estimatedInputTokens ?? CREDIT_CONFIG.DEFAULT_ESTIMATED_INPUT_TOKENS,
    };

    const estimatedCredits = calculateCreditCost(body.action, params);

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
