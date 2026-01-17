/**
 * Credits Routes
 *
 * Credit balance, transactions, and cost estimation endpoints
 */

import { createRoute } from '@hono/zod-openapi';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import { createProtectedRouteResponses } from '@/core';

import {
  CreditBalanceResponseSchema,
  CreditEstimateRequestSchema,
  CreditEstimateResponseSchema,
  CreditTransactionsQuerySchema,
  CreditTransactionsResponseSchema,
} from './schema';

/**
 * Get current credit balance
 */
export const getCreditBalanceRoute = createRoute({
  method: 'get',
  path: '/credits/balance',
  tags: ['credits'],
  summary: 'Get credit balance',
  description: 'Retrieve current credit balance and plan information',
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Credit balance retrieved successfully',
      content: {
        'application/json': { schema: CreditBalanceResponseSchema },
      },
    },
    ...createProtectedRouteResponses(),
  },
});

/**
 * Get credit transaction history
 */
export const getCreditTransactionsRoute = createRoute({
  method: 'get',
  path: '/credits/transactions',
  tags: ['credits'],
  summary: 'Get credit transactions',
  description: 'Retrieve credit transaction history with pagination',
  request: {
    query: CreditTransactionsQuerySchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Credit transactions retrieved successfully',
      content: {
        'application/json': { schema: CreditTransactionsResponseSchema },
      },
    },
    ...createProtectedRouteResponses(),
  },
});

/**
 * Estimate credit cost for an action
 */
export const estimateCreditCostRoute = createRoute({
  method: 'post',
  path: '/credits/estimate',
  tags: ['credits'],
  summary: 'Estimate credit cost',
  description: 'Estimate credit cost for a given action before executing it',
  request: {
    body: {
      content: {
        'application/json': { schema: CreditEstimateRequestSchema },
      },
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Credit estimate calculated successfully',
      content: {
        'application/json': { schema: CreditEstimateResponseSchema },
      },
    },
    ...createProtectedRouteResponses(),
  },
});
