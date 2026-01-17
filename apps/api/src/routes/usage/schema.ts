import { z } from '@hono/zod-openapi';
import { PlanTypeSchema, SubscriptionTierSchema, UsageStatusSchema } from '@roundtable/shared/enums';

import { createApiResponseSchema } from '@/core/schemas';

// ============================================================================
// Usage Statistics API Schemas
// ============================================================================

export const UsageStatsPayloadSchema = z.object({
  credits: z.object({
    balance: z.number().openapi({
      description: 'Current credit balance',
      example: 8500,
    }),
    available: z.number().openapi({
      description: 'Credits available for use',
      example: 8400,
    }),
    status: UsageStatusSchema.openapi({
      description: 'Visual status indicator (default/warning/critical)',
      example: 'default',
    }),
  }).openapi({
    description: 'Credit balance information',
  }),
  plan: z.object({
    type: PlanTypeSchema.openapi({
      description: 'Current plan type (free/paid)',
      example: 'free',
    }),
    name: z.string().openapi({
      description: 'Plan display name',
      example: 'Free',
    }),
    monthlyCredits: z.number().openapi({
      description: 'Monthly credit allocation (0 for free, 100K for paid)',
      example: 0,
    }),
    hasActiveSubscription: z.boolean().openapi({
      description: 'Whether user has an active paid subscription',
      example: false,
    }),
    freeRoundUsed: z.boolean().openapi({
      description: 'Whether free user has used their one-time free round (always false for paid users)',
      example: false,
    }),
    nextRefillAt: z.string().datetime().nullable().openapi({
      description: 'Next monthly refill date (null for free tier - no renewals)',
      example: null,
    }),
    pendingChange: z.object({
      pendingTier: SubscriptionTierSchema.openapi({
        description: 'Tier that will take effect at period end',
        example: 'free',
      }),
      effectiveDate: z.string().datetime().openapi({
        description: 'Date when the tier change takes effect',
        example: '2025-01-15T00:00:00.000Z',
      }),
    }).nullable().openapi({
      description: 'Pending tier change (grace period info) - null if no pending change',
      example: null,
    }),
  }).openapi({
    description: 'Plan information',
  }),
}).openapi('UsageStatsPayload');

export const UsageStatsResponseSchema = createApiResponseSchema(
  UsageStatsPayloadSchema,
).openapi('UsageStatsResponse');

// ============================================================================
// Type Exports
// ============================================================================

export type UsageStatsPayload = z.infer<typeof UsageStatsPayloadSchema>;
