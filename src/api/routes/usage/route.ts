import { createRoute } from '@hono/zod-openapi';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import { createProtectedRouteResponses } from '@/api/core/response-schemas';

import {
  QuotaCheckResponseSchema,
  UsageStatsResponseSchema,
} from './schema';

/**
 * Get user usage statistics
 * Returns current usage for threads and messages with limits and billing period info
 */
export const getUserUsageStatsRoute = createRoute({
  method: 'get',
  path: '/usage/stats',
  tags: ['usage'],
  summary: 'Get user usage statistics',
  description: 'Retrieve current usage statistics for threads and messages with quota limits',
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Usage statistics retrieved successfully',
      content: {
        'application/json': { schema: UsageStatsResponseSchema },
      },
    },
    ...createProtectedRouteResponses(),
  },
});

/**
 * Check thread creation quota
 * Returns whether user can create more threads
 */
export const checkThreadQuotaRoute = createRoute({
  method: 'get',
  path: '/usage/quota/threads',
  tags: ['usage'],
  summary: 'Check thread creation quota',
  description: 'Check if user can create more chat threads based on their subscription tier',
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Thread quota check completed',
      content: {
        'application/json': { schema: QuotaCheckResponseSchema },
      },
    },
    ...createProtectedRouteResponses(),
  },
});

/**
 * Check message creation quota
 * Returns whether user can send more messages
 */
export const checkMessageQuotaRoute = createRoute({
  method: 'get',
  path: '/usage/quota/messages',
  tags: ['usage'],
  summary: 'Check message creation quota',
  description: 'Check if user can send more messages based on their subscription tier',
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Message quota check completed',
      content: {
        'application/json': { schema: QuotaCheckResponseSchema },
      },
    },
    ...createProtectedRouteResponses(),
  },
});

/**
 * Check custom role creation quota
 * Returns whether user can create more custom roles
 */
export const checkCustomRoleQuotaRoute = createRoute({
  method: 'get',
  path: '/usage/quota/custom-roles',
  tags: ['usage'],
  summary: 'Check custom role creation quota',
  description: 'Check if user can create more custom role templates based on their subscription tier',
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Custom role quota check completed',
      content: {
        'application/json': { schema: QuotaCheckResponseSchema },
      },
    },
    ...createProtectedRouteResponses(),
  },
});
