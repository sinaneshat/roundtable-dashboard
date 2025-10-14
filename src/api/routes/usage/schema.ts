import { z } from '@hono/zod-openapi';

import { createApiResponseSchema } from '@/api/core/schemas';
import { SUBSCRIPTION_TIERS } from '@/api/services/product-logic.service';
import { quotaCheckSchema, usageStatsSchema } from '@/db/validation/usage';

// ============================================================================
// Usage Statistics Schemas (Reusing Database Validation)
// ============================================================================

/**
 * ✅ REUSE: Usage stats schema from database validation
 * Extended with OpenAPI metadata for API documentation
 * Additional 'memories' field added for future feature support
 *
 * Single source of truth: @/db/validation/usage.ts:usageStatsSchema
 */
export const UsageStatsPayloadSchema = usageStatsSchema
  .extend({
    // Add OpenAPI metadata to nested objects
    threads: usageStatsSchema.shape.threads
      .extend({
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
    messages: usageStatsSchema.shape.messages
      .extend({
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
    // Additional field for future memories feature
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
    }).optional(),
    customRoles: usageStatsSchema.shape.customRoles
      .extend({
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
    period: usageStatsSchema.shape.period
      .extend({
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
    subscription: usageStatsSchema.shape.subscription
      .extend({
        tier: usageStatsSchema.shape.subscription.shape.tier.openapi({
          description: 'Current subscription tier',
          example: SUBSCRIPTION_TIERS[0],
        }),
        isAnnual: z.boolean().openapi({
          description: 'Whether subscription is annual',
          example: false,
        }),
        pendingTierChange: usageStatsSchema.shape.subscription.shape.pendingTierChange.openapi({
          description: 'Scheduled tier change (for downgrades at period end)',
          example: 'starter',
        }),
        pendingTierIsAnnual: usageStatsSchema.shape.subscription.shape.pendingTierIsAnnual.openapi({
          description: 'Whether pending tier is annual',
          example: false,
        }),
      }),
  })
  .openapi('UsageStatsPayload');

export const UsageStatsResponseSchema = createApiResponseSchema(
  UsageStatsPayloadSchema,
).openapi('UsageStatsResponse');

/**
 * ✅ REUSE: Quota check schema from database validation
 * Extended with OpenAPI metadata for API documentation
 *
 * Single source of truth: @/db/validation/usage.ts:quotaCheckSchema
 */
export const QuotaCheckPayloadSchema = quotaCheckSchema
  .extend({
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
    tier: quotaCheckSchema.shape.tier.openapi({
      description: 'Current subscription tier',
      example: SUBSCRIPTION_TIERS[0],
    }),
  })
  .openapi('QuotaCheckPayload');

export const QuotaCheckResponseSchema = createApiResponseSchema(
  QuotaCheckPayloadSchema,
).openapi('QuotaCheckResponse');

// ============================================================================
// Type Exports
// ============================================================================

export type UsageStatsPayload = z.infer<typeof UsageStatsPayloadSchema>;
export type QuotaCheckPayload = z.infer<typeof QuotaCheckPayloadSchema>;

// ============================================================================
// Error Response
// ============================================================================
// Use ApiErrorResponseSchema from @/api/core/schemas directly
