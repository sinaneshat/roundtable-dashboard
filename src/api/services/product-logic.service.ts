/**
 * Product Logic Service - SINGLE SOURCE OF TRUTH
 *
 * ✅ THE ONLY PLACE for all product business logic:
 * - Subscription tiers and tier names
 * - Model pricing and access rules
 * - Per-tier limits (models, tokens, quotas)
 * - Model selection logic
 * - Pricing calculations and display
 *
 * ⚠️ DO NOT create duplicate logic elsewhere
 * ⚠️ DO NOT re-export from this file
 * ⚠️ Import directly from this service when needed
 */

import { z } from 'zod';

import type { BaseModelResponse } from '@/api/routes/models/schema';

// ============================================================================
// SUBSCRIPTION TIER CONSTANTS - SINGLE SOURCE OF TRUTH
// ============================================================================

/**
 * ✅ SINGLE SOURCE OF TRUTH: Subscription tier enum values
 * Used across database schema, API validation, and business logic
 */
export const SUBSCRIPTION_TIERS = ['free', 'starter', 'pro', 'power'] as const;

/**
 * ✅ SINGLE SOURCE OF TRUTH: Subscription tier type
 */
export type SubscriptionTier = typeof SUBSCRIPTION_TIERS[number];

/**
 * ✅ SINGLE SOURCE OF TRUTH: Human-readable tier names
 */
export const SUBSCRIPTION_TIER_NAMES: Record<SubscriptionTier, string> = {
  free: 'Free',
  starter: 'Starter',
  pro: 'Pro',
  power: 'Power',
} as const;

/**
 * Zod schema for subscription tier validation
 */
export const subscriptionTierSchema = z.enum(SUBSCRIPTION_TIERS);

/**
 * Maximum output tokens by tier
 * These are AI model limits, not subscription quotas
 */
export const MAX_OUTPUT_TOKENS_BY_TIER: Record<SubscriptionTier, number> = {
  free: 2048,
  starter: 4096,
  pro: 8192,
  power: 16384,
} as const;

/**
 * Maximum model pricing threshold by tier (per 1M tokens input)
 * Used for model access control based on pricing
 */
export const MAX_MODEL_PRICING_BY_TIER: Record<SubscriptionTier, number | null> = {
  free: 0, // Only free models ($0/M tokens)
  starter: 1.0, // Up to $1/M tokens
  pro: 20.0, // Up to $20/M tokens
  power: null, // Unlimited
} as const;

/**
 * Maximum models per conversation by tier
 */
export const MAX_MODELS_BY_TIER: Record<SubscriptionTier, number> = {
  free: 2,
  starter: 3,
  pro: 5,
  power: 10,
} as const;

/**
 * ✅ SINGLE SOURCE OF TRUTH: Tier quotas for subscription limits
 * These are monthly quotas for threads, messages, and custom roles
 * All quota logic comes from this constant - database only stores usage counters
 */
export const TIER_QUOTAS: Record<SubscriptionTier, {
  threadsPerMonth: number;
  messagesPerMonth: number;
  customRolesPerMonth: number;
}> = {
  free: {
    threadsPerMonth: 5,
    messagesPerMonth: 100,
    customRolesPerMonth: 0,
  },
  starter: {
    threadsPerMonth: 20,
    messagesPerMonth: 500,
    customRolesPerMonth: 3,
  },
  pro: {
    threadsPerMonth: 100,
    messagesPerMonth: 2000,
    customRolesPerMonth: 10,
  },
  power: {
    threadsPerMonth: 500,
    messagesPerMonth: 10000,
    customRolesPerMonth: 25,
  },
};

// ============================================================================
// TIER UTILITY FUNCTIONS
// ============================================================================

/**
 * Get tier display name
 */
export function getTierName(tier: SubscriptionTier): string {
  return SUBSCRIPTION_TIER_NAMES[tier];
}

/**
 * Get tiers in order (for tier comparisons)
 */
export function getTiersInOrder(): SubscriptionTier[] {
  return [...SUBSCRIPTION_TIERS];
}

/**
 * Get the maximum output tokens for a given tier
 */
export function getMaxOutputTokensForTier(tier: SubscriptionTier): number {
  return MAX_OUTPUT_TOKENS_BY_TIER[tier];
}

/**
 * Get the maximum model pricing threshold for a given tier
 */
export function getMaxModelPricingForTier(tier: SubscriptionTier): number | null {
  return MAX_MODEL_PRICING_BY_TIER[tier];
}

/**
 * Get the maximum number of models allowed for a given tier
 */
export function getMaxModelsForTier(tier: SubscriptionTier): number {
  return MAX_MODELS_BY_TIER[tier];
}

/**
 * Get the subscription tier from a product ID
 */
export function getTierFromProductId(productId: string): SubscriptionTier {
  if (productId.includes('starter'))
    return 'starter';
  if (productId.includes('pro'))
    return 'pro';
  if (productId.includes('power'))
    return 'power';
  return 'free';
}

// ============================================================================
// PRICING CALCULATIONS
// ============================================================================

/**
 * Parse a price string or number into a number
 */
export function parsePrice(priceStr: string | number | null | undefined): number {
  if (priceStr === null || priceStr === undefined) {
    return 0;
  }

  if (typeof priceStr === 'number') {
    return priceStr;
  }

  const match = priceStr.match(/\$?([\d.]+)/);
  return match ? Number.parseFloat(match[1] || '0') : 0;
}

/**
 * Calculate cost per million tokens
 */
export function costPerMillion(pricePerToken: string | number): number {
  const perToken = typeof pricePerToken === 'number' ? pricePerToken : Number.parseFloat(pricePerToken);
  return perToken * 1_000_000;
}

// ============================================================================
// MODEL ACCESS & PRICING LOGIC
// ============================================================================

/**
 * Check if a model is free (accessible to all tiers)
 */
export function isModelFree(model: BaseModelResponse): boolean {
  const promptPrice = Number.parseFloat(model.pricing.prompt);
  const completionPrice = Number.parseFloat(model.pricing.completion);
  return promptPrice === 0 && completionPrice === 0;
}

/**
 * Get model cost category based on pricing
 */
export function getModelCostCategory(model: BaseModelResponse): 'free' | 'low' | 'medium' | 'high' {
  if (isModelFree(model))
    return 'free';

  const inputPrice = parsePrice(model.pricing_display?.input || 0);

  if (inputPrice <= 1.0)
    return 'low';
  if (inputPrice <= 10.0)
    return 'medium';
  return 'high';
}

/**
 * Get formatted pricing display for a model
 */
export function getModelPricingDisplay(model: BaseModelResponse): string {
  if (isModelFree(model))
    return 'Free';

  const inputPrice = parsePrice(model.pricing_display?.input || 0);
  const outputPrice = parsePrice(model.pricing_display?.output || 0);

  return `$${inputPrice.toFixed(2)}/$${outputPrice.toFixed(2)} per 1M tokens`;
}

/**
 * Get upgrade message for a specific tier
 */
export function getTierUpgradeMessage(tier: SubscriptionTier): string {
  const tierName = SUBSCRIPTION_TIER_NAMES[tier];

  switch (tier) {
    case 'starter':
      return `Upgrade to ${tierName} for more models and higher limits`;
    case 'pro':
      return `Upgrade to ${tierName} for premium models and advanced features`;
    case 'power':
      return `Upgrade to ${tierName} for unlimited access to all models`;
    default:
      return `Upgrade your subscription for more features`;
  }
}

/**
 * Get the required tier for a model based on pricing
 */
export function getRequiredTierForModel(model: BaseModelResponse): SubscriptionTier {
  if (isModelFree(model)) {
    return 'free';
  }

  // Get input pricing per million tokens
  const inputPricePerMillion = costPerMillion(model.pricing.prompt);

  // Determine tier based on pricing thresholds
  if (inputPricePerMillion <= (MAX_MODEL_PRICING_BY_TIER.free || 0)) {
    return 'free';
  }
  if (inputPricePerMillion <= (MAX_MODEL_PRICING_BY_TIER.starter || 0)) {
    return 'starter';
  }
  if (inputPricePerMillion <= (MAX_MODEL_PRICING_BY_TIER.pro || 0)) {
    return 'pro';
  }
  return 'power';
}

/**
 * Determine if a model is accessible based on user tier and model pricing
 */
export function canAccessModelByPricing(
  userTier: SubscriptionTier,
  model: BaseModelResponse,
): boolean {
  const requiredTier = getRequiredTierForModel(model);

  // Get the tier indices for comparison
  const userTierIndex = SUBSCRIPTION_TIERS.indexOf(userTier);
  const requiredTierIndex = SUBSCRIPTION_TIERS.indexOf(requiredTier);

  // User can access if their tier is equal or higher than required
  return userTierIndex >= requiredTierIndex;
}

// ============================================================================
// MODEL SELECTION LOGIC
// ============================================================================

/**
 * Get a selection of models appropriate for quick start suggestions based on user tier
 *
 * @param models All available models
 * @param tier User's subscription tier
 * @param count Maximum number of models to return
 * @returns Array of model IDs suitable for the given tier
 */
export function getQuickStartModelsByTier(
  models: BaseModelResponse[],
  tier: SubscriptionTier,
  count: number = 4,
): string[] {
  // Filter models accessible to the user's tier
  const accessibleModels = models.filter((model) => {
    return canAccessModelByPricing(tier, model);
  });

  // If no models are accessible, return empty array
  if (accessibleModels.length === 0) {
    return [];
  }

  // Sort by context window size (descending) to prioritize more capable models
  const sortedModels = [...accessibleModels].sort((a, b) => {
    return (b.context_length || 0) - (a.context_length || 0);
  });

  // Return the top N model IDs
  return sortedModels.slice(0, count).map(model => model.id);
}

/**
 * Get the default model for a given subscription tier
 *
 * @param models All available models
 * @param tier User's subscription tier
 * @returns Model ID of the default model for the tier
 */
export function getDefaultModelForTier(
  models: BaseModelResponse[],
  tier: SubscriptionTier,
): string | undefined {
  const tierModels = getQuickStartModelsByTier(models, tier, 1);
  return tierModels.length > 0 ? tierModels[0] : undefined;
}

// ============================================================================
// AI PARAMETERS CONFIGURATION
// ============================================================================

/**
 * Default AI parameters used across all modes unless overridden
 */
export const DEFAULT_AI_PARAMS = {
  temperature: 0.7,
  maxTokens: 4096,
  topP: 0.9,
} as const;

/**
 * Mode-specific AI parameters for maximum stability and consistency
 * Import ChatModeId type to properly type this configuration
 */
export const MODE_SPECIFIC_AI_PARAMS: Record<string, { temperature: number; topP: number; maxTokens: number }> = {
  analyzing: {
    temperature: 0.3,
    topP: 0.7,
    maxTokens: 4096,
  },
  brainstorming: {
    temperature: 0.6,
    topP: 0.85,
    maxTokens: 4096,
  },
  debating: {
    temperature: 0.5,
    topP: 0.8,
    maxTokens: 4096,
  },
  solving: {
    temperature: 0.4,
    topP: 0.75,
    maxTokens: 4096,
  },
} as const;

/**
 * Get AI parameters for a specific mode
 */
export function getAIParamsForMode(mode: string): { temperature: number; topP: number; maxTokens: number } {
  return MODE_SPECIFIC_AI_PARAMS[mode] || DEFAULT_AI_PARAMS;
}

/**
 * Title generation configuration
 *
 * ✅ FULLY DYNAMIC: No hard-coded model preferences
 * Model selection is handled dynamically by openRouterModelsService.getCheapestAvailableModel()
 */
export const TITLE_GENERATION_CONFIG = {
  temperature: 0.3,
  maxTokens: 15,
  topP: 0.7,
  systemPrompt: 'Generate a concise, descriptive title (5 words max) for this conversation. Output only the title, no quotes or extra text.',
} as const;

/**
 * AI timeout configuration
 */
export const AI_TIMEOUT_CONFIG = {
  default: 30000, // 30 seconds
  titleGeneration: 10000, // 10 seconds
  perAttemptMs: 30000, // 30 seconds per retry attempt
  moderatorAnalysisMs: 45000, // 45 seconds for moderator analysis
} as const;

/**
 * AI retry configuration
 */
export const AI_RETRY_CONFIG = {
  maxAttempts: 10,
  baseDelay: 500,
} as const;
