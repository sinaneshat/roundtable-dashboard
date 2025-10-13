import { createRoute } from '@hono/zod-openapi';
import * as HttpStatusCodes from 'stoker/http-status-codes';
import * as HttpStatusPhrases from 'stoker/http-status-phrases';

import { ApiErrorResponseSchema } from '@/api/core/schemas';

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
      description: HttpStatusPhrases.OK,
      content: {
        'application/json': {
          schema: UsageStatsResponseSchema,
        },
      },
    },
    [HttpStatusCodes.UNAUTHORIZED]: {
      description: HttpStatusPhrases.UNAUTHORIZED,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: {
      description: HttpStatusPhrases.INTERNAL_SERVER_ERROR,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
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
      description: HttpStatusPhrases.OK,
      content: {
        'application/json': {
          schema: QuotaCheckResponseSchema,
        },
      },
    },
    [HttpStatusCodes.UNAUTHORIZED]: {
      description: HttpStatusPhrases.UNAUTHORIZED,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: {
      description: HttpStatusPhrases.INTERNAL_SERVER_ERROR,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
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
      description: HttpStatusPhrases.OK,
      content: {
        'application/json': {
          schema: QuotaCheckResponseSchema,
        },
      },
    },
    [HttpStatusCodes.UNAUTHORIZED]: {
      description: HttpStatusPhrases.UNAUTHORIZED,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: {
      description: HttpStatusPhrases.INTERNAL_SERVER_ERROR,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
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
      description: HttpStatusPhrases.OK,
      content: {
        'application/json': {
          schema: QuotaCheckResponseSchema,
        },
      },
    },
    [HttpStatusCodes.UNAUTHORIZED]: {
      description: HttpStatusPhrases.UNAUTHORIZED,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: {
      description: HttpStatusPhrases.INTERNAL_SERVER_ERROR,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
  },
});
