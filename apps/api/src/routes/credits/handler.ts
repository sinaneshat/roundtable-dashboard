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

/** Internal params for credit estimation calculations */
type CreditEstimateParams = {
  participantCount: number;
  inputTokens: number;
};

type CreditCalculator = (params: CreditEstimateParams) => number;

const CREDIT_ACTION_CALCULATORS: Record<CreditAction, CreditCalculator> = {
  [CreditActions.AI_RESPONSE]: p => estimateStreamingCredits(p.participantCount, p.inputTokens),
  [CreditActions.ANALYSIS_GENERATION]: () => tokensToCredits(CREDIT_CONFIG.ACTION_COSTS.analysisGeneration),
  [CreditActions.CREDIT_PURCHASE]: () => 0,
  [CreditActions.FILE_READING]: () => tokensToCredits(CREDIT_CONFIG.ACTION_COSTS.fileReading),
  [CreditActions.FREE_ROUND_COMPLETE]: () => 0,
  [CreditActions.MEMORY_EXTRACTION]: () => tokensToCredits(CREDIT_CONFIG.ACTION_COSTS.memoryExtraction),
  [CreditActions.MONTHLY_RENEWAL]: () => 0,
  [CreditActions.PROJECT_FILE_LINK]: () => tokensToCredits(CREDIT_CONFIG.ACTION_COSTS.projectFileLink),
  [CreditActions.PROJECT_STORAGE]: () => tokensToCredits(CREDIT_CONFIG.ACTION_COSTS.projectStoragePer10MB),
  [CreditActions.RAG_QUERY]: () => tokensToCredits(CREDIT_CONFIG.ACTION_COSTS.ragQuery),
  // Grant actions - return 0 for estimation (not deductions)
  [CreditActions.SIGNUP_BONUS]: () => 0,
  [CreditActions.THREAD_CREATION]: () => tokensToCredits(CREDIT_CONFIG.ACTION_COSTS.threadCreation),
  [CreditActions.USER_MESSAGE]: p => estimateStreamingCredits(p.participantCount, p.inputTokens),
  [CreditActions.WEB_SEARCH]: () => tokensToCredits(CREDIT_CONFIG.ACTION_COSTS.webSearchQuery),
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
      available,
      balance: creditBalance.balance,
      percentage: Math.min(percentage, 100),
      plan: {
        monthlyCredits: creditBalance.monthlyCredits,
        nextRefillAt: creditBalance.nextRefillAt?.toISOString() ?? null,
        type: creditBalance.planType,
      },
      reserved: creditBalance.reserved,
      status,
    });
  },
);

export const getCreditTransactionsHandler: RouteHandler<
  typeof getCreditTransactionsRoute,
  ApiEnv
> = createHandler(
  {
    auth: 'session',
    operationName: 'getCreditTransactions',
    validateQuery: CreditTransactionsQuerySchema,
  },
  async (c) => {
    const { user } = c.auth();
    const query = c.validated.query;

    const limit = query.limit ?? 20;
    const page = query.page ?? 1;
    const offset = (page - 1) * limit;

    // Only include type in options if defined to satisfy exactOptionalPropertyTypes
    const { total, transactions } = await getUserTransactionHistory(
      user.id,
      query.type !== undefined
        ? { limit, offset, type: query.type }
        : { limit, offset },
    );

    return Responses.ok(c, {
      items: transactions.map(tx => ({
        action: tx.action,
        amount: tx.amount,
        balanceAfter: tx.balanceAfter,
        createdAt: tx.createdAt,
        description: tx.description,
        id: tx.id,
        inputTokens: tx.inputTokens,
        outputTokens: tx.outputTokens,
        threadId: tx.threadId,
        type: tx.type,
      })),
      pagination: {
        hasMore: offset + transactions.length < total,
        limit,
        offset,
        total,
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
    operationName: 'estimateCreditCost',
    validateBody: CreditEstimateRequestSchema,
  },
  async (c) => {
    const { user } = c.auth();
    const body = c.validated.body;

    const params: CreditEstimateParams = {
      inputTokens: body.params?.estimatedInputTokens ?? CREDIT_CONFIG.DEFAULT_ESTIMATED_INPUT_TOKENS,
      participantCount: body.params?.participantCount ?? 1,
    };

    const estimatedCredits = calculateCreditCost(body.action, params);

    const creditBalance = await getUserCreditBalance(user.id);
    const currentBalance = creditBalance.available;

    const canAfford = await canAffordCredits(user.id, estimatedCredits);

    return Responses.ok(c, {
      balanceAfter: currentBalance - estimatedCredits,
      canAfford,
      currentBalance,
      estimatedCredits,
    });
  },
);
