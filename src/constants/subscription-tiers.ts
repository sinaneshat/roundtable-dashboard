/**
 * Subscription Tier Constants
 *
 * ✅ SINGLE SOURCE OF TRUTH:
 * - Tier enum type and values: @/db/tables/usage (SUBSCRIPTION_TIERS, SubscriptionTier)
 * - Tier limits/quotas: subscriptionTierQuotas table (via usage-tracking.service.ts)
 *
 * This file contains ONLY:
 * - Tier display names (static UI strings)
 * - Max output tokens (model-specific, not stored in DB)
 * - Model pricing thresholds for tier access control
 * - Type guards and utility functions
 *
 * ⚠️ NO RE-EXPORTS: Import SubscriptionTier and SUBSCRIPTION_TIERS directly from @/db/tables/usage
 */

import { z } from 'zod';

import type { SubscriptionTier } from '@/db/tables/usage';
import { SUBSCRIPTION_TIERS } from '@/db/tables/usage';

// ============================================================================
// Static Display Names (UI Only)
// ============================================================================

/**
 * Subscription tier display names
 * These are static UI strings, not configuration data
 */
export const SUBSCRIPTION_TIER_NAMES = {
  free: 'Free',
  starter: 'Starter',
  pro: 'Pro',
  power: 'Power',
} as const satisfies Record<SubscriptionTier, string>;

export type SubscriptionTierName = (typeof SUBSCRIPTION_TIER_NAMES)[SubscriptionTier];

// ============================================================================
// Model-Specific Constants (Not in Database)
// ============================================================================

/**
 * Maximum output tokens by tier
 * These are AI model limits, not subscription quotas
 */
export const MAX_OUTPUT_TOKENS_BY_TIER = {
  free: 2048,
  starter: 4096,
  pro: 8192,
  power: 16384,
} as const satisfies Record<SubscriptionTier, number>;

export type MaxOutputTokens = (typeof MAX_OUTPUT_TOKENS_BY_TIER)[SubscriptionTier];

/**
 * Maximum model pricing by tier (per 1M tokens)
 * Used for model access control based on pricing
 */
export const MAX_MODEL_PRICING_BY_TIER: Record<SubscriptionTier, number | null> = {
  free: 0, // Only free models ($0/M tokens)
  starter: 1.0, // Up to $1/M tokens
  pro: 20.0, // Up to $20/M tokens
  power: null, // Unlimited
} as const;

// ============================================================================
// Tier Validation & Type Guards
// ============================================================================

/**
 * Zod schema for subscription tier validation
 */
export const subscriptionTierSchema = z.enum(SUBSCRIPTION_TIERS);

/**
 * Helper function to validate if a string is a valid subscription tier
 */
export function isValidSubscriptionTier(tier: unknown): tier is SubscriptionTier {
  return subscriptionTierSchema.safeParse(tier).success;
}

/**
 * Parse and validate subscription tier (throws if invalid)
 */
export function parseSubscriptionTier(tier: unknown): SubscriptionTier {
  return subscriptionTierSchema.parse(tier);
}

/**
 * Safely parse subscription tier (returns null if invalid)
 */
export function safeParseSubscriptionTier(tier: unknown): SubscriptionTier | null {
  const result = subscriptionTierSchema.safeParse(tier);
  return result.success ? result.data : null;
}

// ============================================================================
// Tier Utility Functions
// ============================================================================

/**
 * Get tier display name
 */
export function getTierName(tier: SubscriptionTier): SubscriptionTierName {
  return SUBSCRIPTION_TIER_NAMES[tier];
}

/**
 * Get maximum output tokens allowed for a tier
 */
export function getMaxOutputTokens(tier: SubscriptionTier): MaxOutputTokens {
  return MAX_OUTPUT_TOKENS_BY_TIER[tier];
}

/**
 * Get model pricing threshold for tier ($/1M tokens)
 * Returns null for unlimited (power tier)
 */
export function getMaxModelPricing(tier: SubscriptionTier): number | null {
  return MAX_MODEL_PRICING_BY_TIER[tier];
}

/**
 * Get all tiers in display order
 */
export function getTiersInOrder(): readonly SubscriptionTier[] {
  return SUBSCRIPTION_TIERS;
}

/**
 * Get tier index (for comparison)
 */
export function getTierIndex(tier: SubscriptionTier): number {
  return SUBSCRIPTION_TIERS.indexOf(tier);
}

/**
 * Compare tiers (returns true if tier1 >= tier2)
 */
export function isTierAtLeast(tier1: SubscriptionTier, tier2: SubscriptionTier): boolean {
  return getTierIndex(tier1) >= getTierIndex(tier2);
}

/**
 * Check if tier can access model based on pricing
 */
export function canTierAccessModelPricing(
  tier: SubscriptionTier,
  modelPricingPerMillionTokens: number,
): boolean {
  const maxPricing = getMaxModelPricing(tier);

  // Power tier (null) = unlimited access
  if (maxPricing === null) {
    return true;
  }

  // Check if model pricing is within tier's limit
  return modelPricingPerMillionTokens <= maxPricing;
}

/**
 * Get required tier for model pricing
 */
export function getRequiredTierForPricing(modelPricingPerMillionTokens: number): SubscriptionTier {
  // Check tiers in order from lowest to highest
  for (const tier of getTiersInOrder()) {
    if (canTierAccessModelPricing(tier, modelPricingPerMillionTokens)) {
      return tier;
    }
  }

  // Fallback to power tier if pricing exceeds all limits
  return 'power';
}

/**
 * Check if a quota is unlimited
 */
export function isUnlimitedQuota(quota: number): boolean {
  return quota === -1;
}

/**
 * Format quota display (handles unlimited)
 */
export function formatQuotaDisplay(quota: number, type: string): string {
  if (isUnlimitedQuota(quota)) {
    return `Unlimited ${type}`;
  }
  return `${quota} ${type}`;
}

// ============================================================================
// Synchronous Fallback Values (For Frontend Use)
// ============================================================================

/**
 * Maximum models allowed by tier (synchronous fallback)
 *
 * ⚠️ NOTE: This is a fallback for frontend use only
 * Backend should use async getMaxModels() from usage-tracking.service.ts
 * which fetches from subscriptionTierQuotas table
 */
const MAX_MODELS_FALLBACK: Record<SubscriptionTier, number> = {
  free: 5,
  starter: 5,
  pro: 7,
  power: 15,
} as const;

/**
 * Get maximum models allowed for a tier (synchronous)
 *
 * ⚠️ FRONTEND ONLY: Use this in React components for synchronous access
 * For backend/API use: Import getMaxModels() from usage-tracking.service.ts
 */
export function getMaxModelsSync(tier: SubscriptionTier): number {
  return MAX_MODELS_FALLBACK[tier];
}
