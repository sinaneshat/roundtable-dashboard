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
  description: 'Retrieve current credit balance and plan information',
  method: 'get',
  path: '/credits/balance',
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: CreditBalanceResponseSchema },
      },
      description: 'Credit balance retrieved successfully',
    },
    ...createProtectedRouteResponses(),
  },
  summary: 'Get credit balance',
  tags: ['credits'],
});

/**
 * Get credit transaction history
 */
export const getCreditTransactionsRoute = createRoute({
  description: 'Retrieve credit transaction history with pagination',
  method: 'get',
  path: '/credits/transactions',
  request: {
    query: CreditTransactionsQuerySchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: CreditTransactionsResponseSchema },
      },
      description: 'Credit transactions retrieved successfully',
    },
    ...createProtectedRouteResponses(),
  },
  summary: 'Get credit transactions',
  tags: ['credits'],
});

/**
 * Estimate credit cost for an action
 */
export const estimateCreditCostRoute = createRoute({
  description: 'Estimate credit cost for a given action before executing it',
  method: 'post',
  path: '/credits/estimate',
  request: {
    body: {
      content: {
        'application/json': { schema: CreditEstimateRequestSchema },
      },
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: CreditEstimateResponseSchema },
      },
      description: 'Credit estimate calculated successfully',
    },
    ...createProtectedRouteResponses(),
  },
  summary: 'Estimate credit cost',
  tags: ['credits'],
});
