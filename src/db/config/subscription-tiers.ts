/**
 * ✅ SINGLE SOURCE OF TRUTH: Subscription Tier Configuration
 *
 * All tier-related constants, schemas, and configuration in ONE place.
 * Shared between backend API, database, and frontend.
 *
 * NO OTHER FILE should define tier names, limits, or pricing thresholds.
 *
 * SCHEMA-FIRST APPROACH:
 * - All types are inferred from Zod schemas
 * - Runtime validation + compile-time type safety
 * - No manual type definitions
 */

import { z } from 'zod';

// ============================================================================
// Tier Enum & Schema (Single Source of Truth)
// ============================================================================

/**
 * Subscription tiers tuple - matches database enum
 * ✅ SINGLE SOURCE: All other files import this constant
 */
export const SUBSCRIPTION_TIERS = ['free', 'starter', 'pro', 'power'] as const;

/**
 * Subscription tier Zod schema - validates tier values
 * ✅ SCHEMA-FIRST: Type is inferred from schema
 */
export const subscriptionTierSchema = z.enum(SUBSCRIPTION_TIERS);

/**
 * Subscription tier TypeScript type
 * ✅ INFERRED: From subscriptionTierSchema
 */
export type SubscriptionTier = z.infer<typeof subscriptionTierSchema>;

// ============================================================================
// Tier Configuration Schema (Zod-First)
// ============================================================================

/**
 * Complete tier configuration with all limits and metadata
 * ✅ SCHEMA-FIRST: Defines structure with validation rules
 */
export const tierConfigSchema = z.object({
  tier: subscriptionTierSchema,
  tierName: z.string().min(1),
  displayOrder: z.number().int().positive(),

  // Model limits
  maxModels: z.number().int().positive(),
  maxModelPricing: z.number().nonnegative().nullable(), // null = unlimited (power tier)

  // Usage quotas
  threadsPerMonth: z.number().int().nonnegative(),
  messagesPerMonth: z.number().int().nonnegative(),
  memoriesPerMonth: z.number().int(), // -1 = unlimited
  customRolesPerMonth: z.number().int(), // -1 = unlimited

  // Feature flags
  allowCustomRoles: z.boolean(),
  allowMemories: z.boolean(),
  allowThreadExport: z.boolean(),
});

/**
 * Tier configuration type
 * ✅ INFERRED: From tierConfigSchema
 */
export type TierConfig = z.infer<typeof tierConfigSchema>;

/**
 * Tier configurations record type
 * ✅ INFERRED: Ensures all tiers have configurations
 */
export type TierConfigsRecord = Record<SubscriptionTier, TierConfig>;

// ============================================================================
// Tier Display Names
// ============================================================================

/**
 * Subscription tier display names
 * ✅ SCHEMA-VALIDATED: Each name is validated
 */
export const SUBSCRIPTION_TIER_NAMES = {
  free: 'Free',
  starter: 'Starter',
  pro: 'Pro',
  power: 'Power',
} as const satisfies Record<SubscriptionTier, string>;

/**
 * Subscription tier name type
 * ✅ INFERRED: From SUBSCRIPTION_TIER_NAMES
 */
export type SubscriptionTierName = (typeof SUBSCRIPTION_TIER_NAMES)[SubscriptionTier];

// ============================================================================
// Tier Configurations (Data-Driven)
// ============================================================================

/**
 * ✅ MASTER TIER CONFIGURATION
 * All tier limits, features, and pricing thresholds defined here
 *
 * Based on pricing page:
 * - Free: 5 models, 20 messages/mo, 2 conversations/mo
 * - Starter: 5 models, 150 messages/mo, 30 conversations/mo ($20/mo)
 * - Pro: 7 models, 400 messages/mo, 75 conversations/mo ($59/mo)
 * - Power: 15 models, 1,800 messages/mo, 300 conversations/mo ($249/mo)
 */
export const TIER_CONFIGS = {
  free: {
    tier: 'free',
    tierName: 'Free',
    displayOrder: 1,
    maxModels: 5,
    maxModelPricing: 0, // Only $0/M tokens models
    threadsPerMonth: 2,
    messagesPerMonth: 20,
    memoriesPerMonth: 5,
    customRolesPerMonth: 0,
    allowCustomRoles: false,
    allowMemories: true,
    allowThreadExport: false,
  },
  starter: {
    tier: 'starter',
    tierName: 'Starter',
    displayOrder: 2,
    maxModels: 5,
    maxModelPricing: 1.0, // Up to $1/M tokens
    threadsPerMonth: 30,
    messagesPerMonth: 150,
    memoriesPerMonth: 50,
    customRolesPerMonth: 5,
    allowCustomRoles: true,
    allowMemories: true,
    allowThreadExport: true,
  },
  pro: {
    tier: 'pro',
    tierName: 'Pro',
    displayOrder: 3,
    maxModels: 7,
    maxModelPricing: 20.0, // Up to $20/M tokens
    threadsPerMonth: 75,
    messagesPerMonth: 400,
    memoriesPerMonth: 200,
    customRolesPerMonth: 20,
    allowCustomRoles: true,
    allowMemories: true,
    allowThreadExport: true,
  },
  power: {
    tier: 'power',
    tierName: 'Power',
    displayOrder: 4,
    maxModels: 15,
    maxModelPricing: null, // All models (unlimited pricing)
    threadsPerMonth: 300,
    messagesPerMonth: 1800,
    memoriesPerMonth: -1, // Unlimited
    customRolesPerMonth: -1, // Unlimited
    allowCustomRoles: true,
    allowMemories: true,
    allowThreadExport: true,
  },
} as const satisfies TierConfigsRecord;

// ============================================================================
// Output Tokens Configuration
// ============================================================================

/**
 * Maximum output tokens by tier
 * Conservative defaults based on tier level
 */
export const MAX_OUTPUT_TOKENS_BY_TIER = {
  free: 2048,
  starter: 4096,
  pro: 8192,
  power: 16384,
} as const satisfies Record<SubscriptionTier, number>;

/**
 * Max output tokens type
 * ✅ INFERRED: From MAX_OUTPUT_TOKENS_BY_TIER
 */
export type MaxOutputTokens = (typeof MAX_OUTPUT_TOKENS_BY_TIER)[SubscriptionTier];

// ============================================================================
// Validation Schemas
// ============================================================================

/**
 * Schema to validate tier configuration objects
 * Use this for runtime validation when loading tier configs
 */
export const tierConfigsRecordSchema = z.object({
  free: tierConfigSchema,
  starter: tierConfigSchema,
  pro: tierConfigSchema,
  power: tierConfigSchema,
});

/**
 * Helper function to validate if a string is a valid subscription tier
 * ✅ SCHEMA-VALIDATED: Uses Zod for runtime validation
 */
export function isValidSubscriptionTier(tier: unknown): tier is SubscriptionTier {
  return subscriptionTierSchema.safeParse(tier).success;
}

/**
 * Helper function to parse and validate subscription tier
 * Throws if invalid
 */
export function parseSubscriptionTier(tier: unknown): SubscriptionTier {
  return subscriptionTierSchema.parse(tier);
}

/**
 * Helper function to safely parse subscription tier
 * Returns null if invalid
 */
export function safeParseSubscriptionTier(tier: unknown): SubscriptionTier | null {
  const result = subscriptionTierSchema.safeParse(tier);
  return result.success ? result.data : null;
}

// ============================================================================
// Tier Configuration Accessors (Type-Safe)
// ============================================================================

/**
 * Get tier configuration by tier enum
 * ✅ TYPE-SAFE: Return type is inferred
 */
export function getTierConfig(tier: SubscriptionTier): TierConfig {
  return TIER_CONFIGS[tier];
}

/**
 * Get tier display name
 * ✅ TYPE-SAFE: Return type is SubscriptionTierName
 */
export function getTierName(tier: SubscriptionTier): SubscriptionTierName {
  return SUBSCRIPTION_TIER_NAMES[tier];
}

/**
 * Get max models allowed for tier
 */
export function getMaxModels(tier: SubscriptionTier): number {
  return TIER_CONFIGS[tier].maxModels;
}

/**
 * Get model pricing threshold for tier ($/1M tokens)
 * Returns null for unlimited (power tier)
 */
export function getMaxModelPricing(tier: SubscriptionTier): number | null {
  return TIER_CONFIGS[tier].maxModelPricing;
}

/**
 * Get maximum output tokens allowed for a tier
 */
export function getMaxOutputTokens(tier: SubscriptionTier): MaxOutputTokens {
  return MAX_OUTPUT_TOKENS_BY_TIER[tier];
}

/**
 * Get all tier configurations in display order
 */
export function getTierConfigsInOrder(): TierConfig[] {
  return SUBSCRIPTION_TIERS.map(tier => TIER_CONFIGS[tier]);
}

// ============================================================================
// Tier Comparison & Validation
// ============================================================================

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
 * @param tier User's subscription tier
 * @param modelPricingPerMillionTokens Model's input pricing ($/1M tokens)
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
 * @param modelPricingPerMillionTokens Model's input pricing ($/1M tokens)
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

// ============================================================================
// Model Limit Helpers
// ============================================================================

/**
 * Check if user can add more models based on current count
 */
export function canAddMoreModels(currentCount: number, tier: SubscriptionTier): boolean {
  const config = getTierConfig(tier);
  return currentCount < config.maxModels;
}

/**
 * Get error message when max models limit is reached
 */
export function getMaxModelsErrorMessage(tier: SubscriptionTier): string {
  const config = getTierConfig(tier);
  return `You've reached the maximum of ${config.maxModels} models for the ${config.tierName} tier. Upgrade to add more models.`;
}

// ============================================================================
// Quota Helpers
// ============================================================================

/**
 * Check if a quota is unlimited
 * @param quota The quota value (-1 indicates unlimited)
 */
export function isUnlimitedQuota(quota: number): boolean {
  return quota === -1;
}

/**
 * Format quota display (handles unlimited)
 * @param quota The quota value
 * @param type The type of quota for display
 */
export function formatQuotaDisplay(quota: number, type: string): string {
  if (isUnlimitedQuota(quota)) {
    return `Unlimited ${type}`;
  }
  return `${quota} ${type}`;
}
