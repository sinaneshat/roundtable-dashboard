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
 *
 * ✅ ADJUSTED LIMITS: Wider ranges to better categorize models across tiers
 * - free: Only truly free models
 * - starter: Budget models suitable for light usage
 * - pro: Mid-range to premium models (most popular flagships fall here)
 * - power: Ultra-premium and specialized models
 */
export const MAX_MODEL_PRICING_BY_TIER: Record<SubscriptionTier, number | null> = {
  free: 0, // Only free models ($0/M tokens)
  starter: 2.0, // Up to $2/M tokens (increased from $1 for better budget model selection)
  pro: 100.0, // Up to $100/M tokens (increased from $20 to include most flagship models)
  power: null, // Unlimited (ultra-premium models like GPT-4, Claude Opus, etc.)
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

/**
 * ✅ 100% DYNAMIC FLAGSHIP SCORING: No hard-coded model names
 *
 * Calculates flagship score using data-driven signals from OpenRouter API.
 * Based on observable characteristics that correlate with global popularity.
 *
 * Scoring factors:
 * - Provider quality (40pts): Based on 2025 OpenRouter token usage rankings
 * - Context window (25pts): Large contexts indicate flagship capability
 * - Recency (20pts): Recently released = actively maintained
 * - Capabilities (15pts): Vision, reasoning, tools = advanced features
 *
 * @param model The model to score
 * @returns Flagship score (0-100, higher = more likely flagship)
 */
export function getFlagshipScore(model: BaseModelResponse): number {
  let score = 0;

  // ✅ PROVIDER QUALITY (40 points max) - Based on 2025 OpenRouter token usage
  const providerLower = model.provider.toLowerCase();
  if (providerLower.includes('x-ai') || providerLower.includes('xai')) {
    score += 40; // #1 most popular (31.2% token share)
  } else if (providerLower.includes('google')) {
    score += 38; // #2 most popular (18.1% token share)
  } else if (providerLower.includes('anthropic')) {
    score += 36; // #3 most popular (14.1% token share)
  } else if (providerLower.includes('openai')) {
    score += 34; // #4 most popular (13.1% token share)
  } else if (providerLower.includes('deepseek')) {
    score += 32; // #5 most popular (6.9% token share)
  } else if (providerLower.includes('qwen')) {
    score += 30; // #6 most popular (6.3% token share)
  } else if (
    providerLower.includes('meta')
    || providerLower.includes('mistral')
    || providerLower.includes('cohere')
  ) {
    score += 20; // Other major providers
  } else {
    return 0; // Not from top-tier provider = not flagship
  }

  // ✅ CONTEXT WINDOW (25 points max) - Flagship models have large contexts
  if (model.context_length >= 200000) {
    score += 25; // Ultra-large (200K+) = cutting-edge flagship
  } else if (model.context_length >= 128000) {
    score += 20; // Large (128K-200K) = typical flagship
  } else if (model.context_length >= 64000) {
    score += 10; // Medium (64K-128K) = mid-tier
  } else {
    score += 0; // Small context = not flagship
  }

  // ✅ RECENCY (20 points max) - Recent models = actively maintained
  if (model.created) {
    const ageInDays = (Date.now() / 1000 - model.created) / (60 * 60 * 24);
    if (ageInDays < 180) {
      score += 20; // Last 6 months = cutting-edge
    } else if (ageInDays < 365) {
      score += 15; // Last year = recent
    } else {
      score += 5; // Older = less likely flagship
    }
  } else {
    score += 10; // No timestamp = neutral
  }

  // ✅ CAPABILITIES (15 points max) - Advanced features = flagship
  if (model.capabilities.vision)
    score += 5;
  if (model.capabilities.reasoning)
    score += 5;
  if (model.capabilities.tools)
    score += 5;

  return score;
}

/**
 * ✅ DYNAMIC FLAGSHIP DETECTION: Based purely on model characteristics
 * NO hard-coded model names - entirely data-driven from OpenRouter API
 *
 * @param model The model to check
 * @returns True if model scores above flagship threshold (70+)
 */
export function isFlagshipModel(model: BaseModelResponse): boolean {
  const score = getFlagshipScore(model);

  // ✅ THRESHOLD: Models scoring 70+ are flagships
  // This captures: Top-tier provider (30-40pts) + Large context (10-25pts) + Recent (15-20pts) + Capabilities (10-15pts)
  return score >= 70;
}

/**
 * ✅ GET FLAGSHIP MODELS: Extract and rank models dynamically
 *
 * 100% data-driven flagship detection based on OpenRouter API data.
 * NO hard-coded model names - scores based on observable characteristics.
 *
 * Returns top 10 flagship models sorted by score (highest first).
 * Shown in "Most Popular" section at top of model list.
 *
 * @param models All available models
 * @returns Top 10 flagship models sorted by flagship score (descending)
 */
export function getFlagshipModels(models: BaseModelResponse[]): BaseModelResponse[] {
  // Score all models and filter flagships
  const scoredModels = models
    .map(model => ({ model, score: getFlagshipScore(model) }))
    .filter(item => item.score >= 70) // Flagship threshold
    .sort((a, b) => b.score - a.score) // Sort by score descending
    .slice(0, 10); // Limit to top 10 models

  return scoredModels.map(item => item.model);
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
// ✅ AI SDK v5 PATTERN: Reasoning models need extended timeouts
// Reference: https://sdk.vercel.ai/docs/providers/community-providers/claude-code#extended-thinking
// DeepSeek-R1, Claude 4, Gemini 2.0 reasoning models can take 5-10 minutes
export const AI_TIMEOUT_CONFIG = {
  default: 600000, // 10 minutes - reasoning models (DeepSeek-R1, Claude 4) need extended time
  titleGeneration: 10000, // 10 seconds - title generation is fast
  perAttemptMs: 600000, // 10 minutes per retry attempt - matches frontend timeout
  moderatorAnalysisMs: 120000, // 2 minutes for moderator analysis (non-reasoning)
} as const;

/**
 * AI retry configuration
 */
export const AI_RETRY_CONFIG = {
  maxAttempts: 10,
  baseDelay: 500,
} as const;
