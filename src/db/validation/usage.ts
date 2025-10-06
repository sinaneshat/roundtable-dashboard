import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

import type { SubscriptionTier } from '../tables/usage';
import {
  SUBSCRIPTION_TIERS,
  subscriptionTierQuotas,
  userChatUsage,
  userChatUsageHistory,
} from '../tables/usage';

// ============================================================================
// Subscription Tier Validation
// ============================================================================

/**
 * Subscription Tier Enum - Zod Schema
 * Use this for validation in API routes, database schemas, and forms
 */
export const subscriptionTierSchema = z.enum(SUBSCRIPTION_TIERS);

/**
 * Subscription Tier Display Names
 * Human-readable names for each tier
 */
export const SUBSCRIPTION_TIER_NAMES: Record<SubscriptionTier, string> = {
  free: 'Free',
  starter: 'Starter',
  pro: 'Pro',
  power: 'Power',
} as const;

/**
 * Helper function to validate if a string is a valid subscription tier
 */
export function isValidSubscriptionTier(tier: unknown): tier is SubscriptionTier {
  return subscriptionTierSchema.safeParse(tier).success;
}

/**
 * Helper function to get tier display name
 */
export function getSubscriptionTierName(tier: SubscriptionTier): string {
  return SUBSCRIPTION_TIER_NAMES[tier];
}

// Re-export for convenience
export { SUBSCRIPTION_TIERS, type SubscriptionTier };

// ============================================================================
// User Chat Usage Schemas
// ============================================================================

export const userChatUsageSelectSchema = createSelectSchema(userChatUsage);
export const userChatUsageInsertSchema = createInsertSchema(userChatUsage, {
  threadsCreated: schema => schema.min(0),
  threadsLimit: schema => schema.min(0),
  messagesCreated: schema => schema.min(0),
  messagesLimit: schema => schema.min(0),
  subscriptionTier: () => subscriptionTierSchema,
  isAnnual: () => z.boolean(),
});

export type UserChatUsage = z.infer<typeof userChatUsageSelectSchema>;
export type UserChatUsageInsert = z.infer<typeof userChatUsageInsertSchema>;

// ============================================================================
// User Chat Usage History Schemas
// ============================================================================

export const userChatUsageHistorySelectSchema = createSelectSchema(userChatUsageHistory);
export const userChatUsageHistoryInsertSchema = createInsertSchema(userChatUsageHistory, {
  threadsCreated: schema => schema.min(0),
  threadsLimit: schema => schema.min(0),
  messagesCreated: schema => schema.min(0),
  messagesLimit: schema => schema.min(0),
  subscriptionTier: () => subscriptionTierSchema,
  isAnnual: () => z.boolean(),
});

export type UserChatUsageHistory = z.infer<typeof userChatUsageHistorySelectSchema>;
export type UserChatUsageHistoryInsert = z.infer<typeof userChatUsageHistoryInsertSchema>;

// ============================================================================
// Subscription Tier Quotas Schemas
// ============================================================================

export const subscriptionTierQuotasSelectSchema = createSelectSchema(subscriptionTierQuotas);
export const subscriptionTierQuotasInsertSchema = createInsertSchema(subscriptionTierQuotas, {
  tier: () => subscriptionTierSchema,
  isAnnual: () => z.boolean(),
  threadsPerMonth: schema => schema.min(0),
  messagesPerMonth: schema => schema.min(0),
  maxAiModels: schema => schema.min(1).max(50),
  allowCustomRoles: () => z.boolean(),
  allowMemories: () => z.boolean(),
  allowThreadExport: () => z.boolean(),
});

export type SubscriptionTierQuotas = z.infer<typeof subscriptionTierQuotasSelectSchema>;
export type SubscriptionTierQuotasInsert = z.infer<typeof subscriptionTierQuotasInsertSchema>;

// ============================================================================
// Helper Schemas for Usage Tracking
// ============================================================================

/**
 * Schema for quota check response
 */
export const quotaCheckSchema = z.object({
  canCreate: z.boolean(),
  current: z.number(),
  limit: z.number(),
  remaining: z.number(),
  resetDate: z.date(),
  tier: subscriptionTierSchema,
});

export type QuotaCheck = z.infer<typeof quotaCheckSchema>;

/**
 * Schema for usage statistics response
 */
export const usageStatsSchema = z.object({
  threads: z.object({
    used: z.number(),
    limit: z.number(),
    remaining: z.number(),
    percentage: z.number(),
  }),
  messages: z.object({
    used: z.number(),
    limit: z.number(),
    remaining: z.number(),
    percentage: z.number(),
  }),
  memories: z.object({
    used: z.number(),
    limit: z.number(),
    remaining: z.number(),
    percentage: z.number(),
  }),
  customRoles: z.object({
    used: z.number(),
    limit: z.number(),
    remaining: z.number(),
    percentage: z.number(),
  }),
  period: z.object({
    start: z.date(),
    end: z.date(),
    daysRemaining: z.number(),
  }),
  subscription: z.object({
    tier: subscriptionTierSchema,
    isAnnual: z.boolean(),
    pendingTierChange: subscriptionTierSchema.nullable().optional(),
    pendingTierIsAnnual: z.boolean().nullable().optional(),
  }),
});

export type UsageStats = z.infer<typeof usageStatsSchema>;
