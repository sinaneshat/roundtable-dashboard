import { z } from '@hono/zod-openapi';

import { PLAN_TYPES, UsageStatusSchema } from '@/api/core/enums';
import { createApiResponseSchema } from '@/api/core/schemas';

// ============================================================================
// Usage Statistics API Schemas
// ============================================================================

/**
 * ✅ CREDITS-ONLY: Simplified usage stats - only shows credits
 * Users don't need to know about threads/messages/analysis quotas
 * They just need to see their credit balance
 */
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
    type: z.enum(PLAN_TYPES).openapi({
      description: 'Current plan type (free/paid)',
      example: 'free',
    }),
    name: z.string().openapi({
      description: 'Plan display name',
      example: 'Free',
    }),
    monthlyCredits: z.number().openapi({
      description: 'Monthly credit allocation (0 for free, 1M for paid)',
      example: 0,
    }),
    hasPaymentMethod: z.boolean().openapi({
      description: 'Whether user has connected a payment method',
      example: false,
    }),
    hasActiveSubscription: z.boolean().openapi({
      description: 'Whether user has an active paid subscription',
      example: false,
    }),
    nextRefillAt: z.string().datetime().nullable().openapi({
      description: 'Next monthly refill date (null for free plan)',
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

/**
 * Type exports for backend services and frontend consumers
 * Note: Date objects are automatically serialized to ISO strings by Hono/JSON.stringify
 */
export type UsageStatsPayload = z.infer<typeof UsageStatsPayloadSchema>;

export type UsageStatus = z.infer<typeof UsageStatusSchema>;
