import { z } from '@hono/zod-openapi';

import { ApiErrorResponseSchema, createApiResponseSchema } from '@/api/core/schemas';
import { subscriptionTierSchema } from '@/db/validation/usage';

// ============================================================================
// Usage Statistics Schemas
// ============================================================================

/**
 * Usage stats response schema
 */
export const UsageStatsResponseSchema = createApiResponseSchema(
  z.object({
    threads: z.object({
      used: z.number().openapi({
        description: 'Number of threads created this period',
        example: 1,
      }),
      limit: z.number().openapi({
        description: 'Maximum threads allowed this period',
        example: 2,
      }),
      remaining: z.number().openapi({
        description: 'Number of threads remaining',
        example: 1,
      }),
      percentage: z.number().openapi({
        description: 'Percentage of limit used',
        example: 50,
      }),
    }),
    messages: z.object({
      used: z.number().openapi({
        description: 'Number of messages created this period',
        example: 10,
      }),
      limit: z.number().openapi({
        description: 'Maximum messages allowed this period',
        example: 20,
      }),
      remaining: z.number().openapi({
        description: 'Number of messages remaining',
        example: 10,
      }),
      percentage: z.number().openapi({
        description: 'Percentage of limit used',
        example: 50,
      }),
    }),
    memories: z.object({
      used: z.number().openapi({
        description: 'Number of memories created this period',
        example: 0,
      }),
      limit: z.number().openapi({
        description: 'Maximum memories allowed this period',
        example: 0,
      }),
      remaining: z.number().openapi({
        description: 'Number of memories remaining',
        example: 0,
      }),
      percentage: z.number().openapi({
        description: 'Percentage of limit used',
        example: 0,
      }),
    }),
    customRoles: z.object({
      used: z.number().openapi({
        description: 'Number of custom roles created this period',
        example: 0,
      }),
      limit: z.number().openapi({
        description: 'Maximum custom roles allowed this period',
        example: 0,
      }),
      remaining: z.number().openapi({
        description: 'Number of custom roles remaining',
        example: 0,
      }),
      percentage: z.number().openapi({
        description: 'Percentage of limit used',
        example: 0,
      }),
    }),
    period: z.object({
      start: z.coerce.date().openapi({
        description: 'Billing period start date',
        example: '2025-10-01T00:00:00Z',
      }),
      end: z.coerce.date().openapi({
        description: 'Billing period end date',
        example: '2025-10-31T23:59:59Z',
      }),
      daysRemaining: z.number().openapi({
        description: 'Days remaining in billing period',
        example: 27,
      }),
    }),
    subscription: z.object({
      tier: subscriptionTierSchema.openapi({
        description: 'Current subscription tier',
        example: 'free',
      }),
      isAnnual: z.boolean().openapi({
        description: 'Whether subscription is annual',
        example: false,
      }),
      pendingTierChange: subscriptionTierSchema.nullable().optional().openapi({
        description: 'Scheduled tier change (for downgrades at period end)',
        example: 'starter',
      }),
      pendingTierIsAnnual: z.boolean().nullable().optional().openapi({
        description: 'Whether pending tier is annual',
        example: false,
      }),
    }),
  }),
).openapi('UsageStatsResponse');

/**
 * Quota check response schema
 */
export const QuotaCheckResponseSchema = createApiResponseSchema(
  z.object({
    canCreate: z.boolean().openapi({
      description: 'Whether user can create more resources',
      example: true,
    }),
    current: z.number().openapi({
      description: 'Current usage count',
      example: 1,
    }),
    limit: z.number().openapi({
      description: 'Maximum allowed',
      example: 2,
    }),
    remaining: z.number().openapi({
      description: 'Remaining quota',
      example: 1,
    }),
    resetDate: z.coerce.date().openapi({
      description: 'Date when quota resets',
      example: '2025-10-31T23:59:59Z',
    }),
    tier: subscriptionTierSchema.openapi({
      description: 'Current subscription tier',
      example: 'free',
    }),
  }),
).openapi('QuotaCheckResponse');

// ============================================================================
// Error Response
// ============================================================================

export const UsageErrorResponseSchema = ApiErrorResponseSchema;
