import { z } from '@hono/zod-openapi';

import { SUBSCRIPTION_TIERS, UsageStatusSchema } from '@/api/core/enums';
import { createApiResponseSchema } from '@/api/core/schemas';
import { subscriptionTierSchemaOpenAPI } from '@/api/services/product-logic.service';

// ============================================================================
// Usage Statistics API Schemas
// ============================================================================

/**
 * Usage stats API response schema
 * ✅ ALL FIELDS SERVER-COMPUTED: Service calculates usage, limits, percentages, and status
 * ✅ REUSES: subscriptionTierSchema from product-logic.service.ts
 *
 * Note: Date objects are automatically serialized to ISO strings by Hono
 */
export const UsageStatsPayloadSchema = z.object({
  threads: z.object({
    used: z.number().openapi({
      description: 'Number of threads created this period',
      example: 1,
    }),
    limit: z.number().openapi({
      description: 'Maximum threads allowed this period',
      example: 5,
    }),
    remaining: z.number().openapi({
      description: 'Number of threads remaining',
      example: 4,
    }),
    percentage: z.number().openapi({
      description: 'Percentage of limit used',
      example: 20,
    }),
    status: UsageStatusSchema.openapi({
      description: 'Visual status indicator (default/warning/critical)',
      example: 'default',
    }),
  }).openapi({
    description: 'Thread usage statistics',
  }),
  messages: z.object({
    used: z.number().openapi({
      description: 'Number of messages created this period',
      example: 10,
    }),
    limit: z.number().openapi({
      description: 'Maximum messages allowed this period',
      example: 100,
    }),
    remaining: z.number().openapi({
      description: 'Number of messages remaining',
      example: 90,
    }),
    percentage: z.number().openapi({
      description: 'Percentage of limit used',
      example: 10,
    }),
    status: UsageStatusSchema.openapi({
      description: 'Visual status indicator (default/warning/critical)',
      example: 'default',
    }),
  }).openapi({
    description: 'Message usage statistics',
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
    status: UsageStatusSchema.openapi({
      description: 'Visual status indicator (default/warning/critical)',
      example: 'default',
    }),
  }).openapi({
    description: 'Custom role usage statistics',
  }),
  analysis: z.object({
    used: z.number().openapi({
      description: 'Number of analyses generated this period',
      example: 2,
    }),
    limit: z.number().openapi({
      description: 'Maximum analyses allowed this period',
      example: 10,
    }),
    remaining: z.number().openapi({
      description: 'Number of analyses remaining',
      example: 8,
    }),
    percentage: z.number().openapi({
      description: 'Percentage of limit used',
      example: 20,
    }),
    status: UsageStatusSchema.openapi({
      description: 'Visual status indicator (default/warning/critical)',
      example: 'default',
    }),
  }).openapi({
    description: 'Summary generation usage statistics (only for multi-participant conversations)',
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
    status: UsageStatusSchema.openapi({
      description: 'Visual status indicator (default/warning/critical)',
      example: 'default',
    }),
  }).optional().openapi({
    description: 'Memory usage statistics (future feature)',
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
  }).openapi({
    description: 'Billing period information',
  }),
  subscription: z.object({
    tier: subscriptionTierSchemaOpenAPI.openapi({
      description: 'Current subscription tier',
      example: SUBSCRIPTION_TIERS[0],
    }),
    isAnnual: z.boolean().openapi({
      description: 'Whether subscription is annual',
      example: false,
    }),
    pendingTierChange: subscriptionTierSchemaOpenAPI.nullable().optional().openapi({
      description: 'Scheduled tier change (for downgrades at period end)',
      example: 'starter',
    }),
    pendingTierIsAnnual: z.boolean().nullable().optional().openapi({
      description: 'Whether pending tier is annual',
      example: false,
    }),
  }).openapi({
    description: 'Subscription information',
  }),
}).openapi('UsageStatsPayload');

export const UsageStatsResponseSchema = createApiResponseSchema(
  UsageStatsPayloadSchema,
).openapi('UsageStatsResponse');

// ============================================================================
// Type Exports
// ============================================================================

/**
 * Type exports for backend services and frontend consumers
 * Note: Date objects are automatically serialized to ISO strings by Hono/JSON.stringify
 */
export type UsageStatsPayload = z.infer<typeof UsageStatsPayloadSchema>;

export type UsageStatus = z.infer<typeof UsageStatusSchema>;
