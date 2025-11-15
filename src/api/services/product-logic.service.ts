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

import { z as zOpenAPI } from '@hono/zod-openapi';
import { z } from 'zod';

import type { BaseModelResponse } from '@/api/routes/models/schema';
import { TITLE_GENERATION_PROMPT } from '@/api/services/prompts.service';
import { isTransientErrorFromObject } from '@/lib/utils/error-metadata-builders';

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
 * Re-export SubscriptionChangeType from core enums for convenience
 */
export type { SubscriptionChangeType } from '@/api/core/enums';

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
 * Use this in service layer and non-OpenAPI contexts
 */
export const subscriptionTierSchema = z.enum(SUBSCRIPTION_TIERS);

/**
 * OpenAPI-enhanced subscription tier schema
 * Use this in route files (schema.ts) for OpenAPI documentation
 *
 * @example
 * ```ts
 * // In route schema files
 * import { subscriptionTierSchemaOpenAPI } from '@/api/services/product-logic.service';
 *
 * const UserSchema = z.object({
 *   tier: subscriptionTierSchemaOpenAPI.openapi({
 *     description: 'User subscription tier',
 *     example: 'pro',
 *   }),
 * });
 * ```
 */
export const subscriptionTierSchemaOpenAPI = zOpenAPI.enum(SUBSCRIPTION_TIERS);

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
 * ✅ BALANCED UPSELLING STRATEGY: Clear value at each tier with fair differentiation
 *
 * Current distribution (20 hardcoded models):
 * - Free: 2 models (Gemini Flash - fast, efficient)
 * - Starter: 6 models (DeepSeek V3 + fast specialized models)
 * - Pro: 8 models (Claude 4.x, GPT-4o, Grok-4, Gemini Pro, Qwen Max)
 * - Power: 4 models (GPT-5, Claude Opus, o1-pro, GPT-4 Turbo)
 *
 * Business Logic - Clear Upgrade Funnel:
 * 1. **Free Tier (≤$0.10/M)**: 2 models - Gemini Flash only
 *    - Gemini 2.5 Flash, Gemini 2.0 Flash (fast, multimodal)
 *    - Purpose: Test platform with efficient models
 *    - Upsell: "Upgrade to Starter for 6 more models including DeepSeek V3 (best open-weight)"
 *
 * 2. **Starter Tier (≤$0.50/M)**: 6 models - Excellent value
 *    - DeepSeek V3 series (top open-weight, $0.14/M)
 *    - Fast specialized: Grok Code Fast, Qwen3 Coder, Grok-4 Fast ($0.50/M)
 *    - Llama 4 Scout (strong open-source, $0.20/M)
 *    - Purpose: Budget-conscious users needing quality models
 *    - Upsell: "Upgrade to Pro for Claude 4, GPT-4o, and flagship models"
 *
 * 3. **Pro Tier (≤$3.00/M)**: 8 models - Flagship tier ← MAIN TARGET
 *    - Industry leaders: Claude 4.x series (best coding, $3/M)
 *    - Most popular: GPT-4o ($2.50/M), Grok-4 ($2.50/M)
 *    - Top performers: Gemini 2.5 Pro (#1 on Arena, $1.25/M), Qwen Max ($2/M)
 *    - Premium reasoning: o3-mini ($1.10/M)
 *    - Purpose: Best value for most users - all flagship models
 *    - Upsell: "Upgrade to Power for ultra-premium models (GPT-5, Claude Opus, o1-pro)"
 *
 * 4. **Power Tier (Unlimited)**: 4 models - Ultra-premium
 *    - Ultimate models: GPT-5 ($15/M), Claude Opus ($15/M)
 *    - Advanced reasoning: o1-pro ($15/M) with extended thinking
 *    - GPT-4 Turbo ($10/M) for reliability
 *    - Purpose: Power users needing cutting-edge performance
 *
 * This creates a fair upgrade path with clear value at each tier:
 * Free (2) → Starter (6) → Pro (8) ← MAIN TARGET → Power (4)
 */
export const MAX_MODEL_PRICING_BY_TIER: Record<SubscriptionTier, number | null> = {
  free: 0.10, // Up to $0.10/M tokens - 2 models (Gemini Flash only)
  starter: 0.50, // Up to $0.50/M tokens - 6 models (DeepSeek + fast models)
  pro: 3.00, // Up to $3.00/M tokens - 8 models (Claude, GPT-4o, flagships) ← MAIN UPSELL
  power: null, // Unlimited - 4 models (GPT-5, Claude Opus, ultra-premium)
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
 * These are monthly quotas for threads, messages, custom roles, and analysis
 * All quota logic comes from this constant - database only stores usage counters
 *
 * Analysis Quota Logic:
 * - Analysis is only generated when there are 2+ participants (multi-participant conversations)
 * - Single participant conversations do not trigger analysis (no financial sense)
 * - Each analysis generation counts as a message equivalent in terms of cost
 */
export const TIER_QUOTAS: Record<SubscriptionTier, {
  threadsPerMonth: number;
  messagesPerMonth: number;
  customRolesPerMonth: number;
  analysisPerMonth: number;
}> = {
  free: {
    threadsPerMonth: 5,
    messagesPerMonth: 100,
    customRolesPerMonth: 0,
    analysisPerMonth: 10, // Limited analysis for free tier
  },
  starter: {
    threadsPerMonth: 20,
    messagesPerMonth: 500,
    customRolesPerMonth: 3,
    analysisPerMonth: 50, // More analysis for starter
  },
  pro: {
    threadsPerMonth: 100,
    messagesPerMonth: 2000,
    customRolesPerMonth: 10,
    analysisPerMonth: 200, // Generous analysis for pro
  },
  power: {
    threadsPerMonth: 500,
    messagesPerMonth: 10000,
    customRolesPerMonth: 25,
    analysisPerMonth: 1000, // High analysis limit for power users
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
 * Calculate safe max output tokens based on model's context length and tier limits
 *
 * This prevents the error: "maximum context length is X tokens, but you requested Y tokens"
 *
 * @param modelContextLength - The model's maximum context length (from OpenRouter API)
 * @param estimatedInputTokens - Estimated input tokens (system + messages)
 * @param tier - User's subscription tier
 * @returns Safe maxOutputTokens value that won't exceed model limits
 *
 * @example
 * // gpt-3.5-turbo has 16385 context length, user has 21 input tokens
 * getSafeMaxOutputTokens(16385, 21, 'power')
 * // Returns: 14000 (safe buffer below 16385 - 21 = 16364)
 */
export function getSafeMaxOutputTokens(
  modelContextLength: number,
  estimatedInputTokens: number,
  tier: SubscriptionTier,
): number {
  // Get the tier's maximum allowed output tokens
  const tierMaxOutput = getMaxOutputTokensForTier(tier);

  // Calculate available space in model's context window
  // Leave 20% buffer for safety (token estimation can be off)
  const safetyBuffer = Math.floor(modelContextLength * 0.2);
  const availableTokens = modelContextLength - estimatedInputTokens - safetyBuffer;

  // Use the minimum of:
  // 1. Tier's max output tokens (subscription limit)
  // 2. Available tokens in model's context window (model limit)
  // 3. Ensure at least 512 tokens for meaningful responses
  return Math.max(512, Math.min(tierMaxOutput, availableTokens));
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
 *
 * ✅ FIX: Case-insensitive matching and correct tier detection order
 *
 * Common Stripe product ID patterns:
 * - prod_starter_monthly → starter
 * - prod_pro_annual → pro
 * - prod_power_tier → power
 * - prod-pro-tier → pro (hyphen delimiter)
 * - prod_QxRpbPJ8pro → pro (random suffix)
 * - prod_unknown → free (default)
 *
 * Bug fixes:
 * 1. Case-insensitive: handles prod_STARTER, prod_Pro, etc.
 * 2. Order matters: Check "power" before "pro" (power > pro in specificity)
 * 3. Avoid "prod_" and "prod-" prefixes: Use word boundaries
 */
export function getTierFromProductId(productId: string): SubscriptionTier {
  const normalized = productId.toLowerCase();

  // Check in order of specificity
  // "starter" is most specific - check first
  if (normalized.includes('starter'))
    return 'starter';

  // "power" must be checked BEFORE "pro" to avoid false matches
  // Example: "prod_power_tier" should be "power", not "pro"
  if (normalized.includes('power'))
    return 'power';

  // "pro" matching: Match with delimiters (_, -, or word boundaries)
  // Avoid matching "pro" from "prod_", "prod-" prefix, or words like "product", "professional"
  // Support patterns:
  // - prod_pro_annual → _pro_
  // - prod_pro → _pro (end)
  // - prod-pro-tier → -pro-
  // - prod-pro → -pro (end)
  // - prod_QxRpbPJ8pro456 → [0-9]pro[0-9] - number before "pro", number/end after
  //
  // Regex pattern explanation:
  // - (^|[^a-z]) - Start of string OR non-letter before "pro"
  // - pro - The tier keyword
  // - ($|[^a-z]) - End of string OR non-letter after "pro"
  // This avoids matching "pro" inside words like "product" (which would have letter after "pro")
  if (
    normalized.includes('_pro_') // Middle with underscore: prod_pro_annual
    || normalized.endsWith('_pro') // End with underscore: prod_pro (NOT includes to avoid "_product_id")
    || normalized.includes('-pro-') // Middle with hyphen: prod-pro-tier
    || normalized.endsWith('-pro') // End with hyphen: prod-pro (NOT includes to avoid false matches)
    || /(?:^|[^a-z])pro(?:$|[^a-z])/.test(normalized) // Word boundary match: avoids "product", "professional"
  ) {
    return 'pro';
  }

  // Default to free tier for unknown or invalid product IDs
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
 * Check if a model is accessible to free tier users
 *
 * Free tier has access to models up to $0.30/M tokens (input pricing).
 * This is NOT the same as OpenRouter free tier (which we exclude).
 * These are paid models that are cheap enough for our free tier users.
 */
export function isModelFree(model: BaseModelResponse): boolean {
  const inputPricePerMillion = costPerMillion(model.pricing.prompt);
  const freeLimit = MAX_MODEL_PRICING_BY_TIER.free;
  return freeLimit !== null && inputPricePerMillion <= freeLimit;
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
 *
 * Determines minimum subscription tier needed to access a model.
 * Based on input pricing per million tokens.
 */
export function getRequiredTierForModel(model: BaseModelResponse): SubscriptionTier {
  // Get input pricing per million tokens
  const inputPricePerMillion = costPerMillion(model.pricing.prompt);

  // Check each tier threshold in order (free -> starter -> pro -> power)
  const freeLimit = MAX_MODEL_PRICING_BY_TIER.free;
  if (freeLimit !== null && inputPricePerMillion <= freeLimit) {
    return 'free';
  }

  const starterLimit = MAX_MODEL_PRICING_BY_TIER.starter;
  if (starterLimit !== null && inputPricePerMillion <= starterLimit) {
    return 'starter';
  }

  const proLimit = MAX_MODEL_PRICING_BY_TIER.pro;
  if (proLimit !== null && inputPricePerMillion <= proLimit) {
    return 'pro';
  }

  // Everything above pro limit requires power tier
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
 * ✅ 100% DYNAMIC FLAGSHIP SCORING: No hard-coded provider names or model IDs
 *
 * Calculates flagship score using ONLY data from OpenRouter API.
 * Based on observable characteristics that indicate quality and popularity.
 *
 * Scoring factors (all from API data):
 * - Pricing tier (35pts): Premium pricing indicates demand/quality
 * - Context window (30pts): Large contexts = more capable
 * - Recency (20pts): Recently released = actively maintained
 * - Capabilities (15pts): Vision, reasoning, tools = advanced features
 *
 * @param model The model to score
 * @returns Flagship score (0-100, higher = more likely flagship)
 */
export function getFlagshipScore(model: BaseModelResponse): number {
  let score = 0;

  // ═══════════════════════════════════════════════════════════════
  // PRICING TIER (35 points) - Premium pricing indicates flagship quality
  // ═══════════════════════════════════════════════════════════════
  const inputPrice = Number.parseFloat(model.pricing.prompt) * 1_000_000;

  if (inputPrice >= 5 && inputPrice <= 20) {
    score += 35; // Flagship pricing tier ($5-$20/M tokens)
  } else if (inputPrice > 20 && inputPrice <= 100) {
    score += 30; // Premium pricing tier ($20-$100/M tokens)
  } else if (inputPrice >= 1 && inputPrice < 5) {
    score += 20; // Mid-tier pricing ($1-$5/M tokens)
  } else if (inputPrice > 100) {
    score += 15; // Ultra-premium (>$100/M tokens)
  } else {
    // Intentionally empty
    score += 0; // Budget/free tier
  }

  // ═══════════════════════════════════════════════════════════════
  // CONTEXT WINDOW (30 points) - Large context = flagship capability
  // ═══════════════════════════════════════════════════════════════
  if (model.context_length >= 200000) {
    score += 30; // Ultra-large (200K+) = cutting-edge
  } else if (model.context_length >= 128000) {
    score += 25; // Large (128K-200K) = flagship tier
  } else if (model.context_length >= 64000) {
    score += 15; // Medium-large (64K-128K)
  } else {
    // Intentionally empty
    score += 0; // Small context
  }

  // ═══════════════════════════════════════════════════════════════
  // RECENCY (20 points) - Recent models = actively maintained
  // ═══════════════════════════════════════════════════════════════
  if (model.created) {
    const ageInDays = (Date.now() / 1000 - model.created) / (60 * 60 * 24);
    if (ageInDays < 180) {
      score += 20; // Last 6 months = cutting-edge
    } else if (ageInDays < 365) {
      score += 15; // Last year = recent
    } else {
    // Intentionally empty
      score += 5; // Older = less likely flagship
    }
  } else {
    // Intentionally empty
    score += 10; // No timestamp = neutral
  }

  // ═══════════════════════════════════════════════════════════════
  // CAPABILITIES (15 points) - Advanced features = flagship
  // ═══════════════════════════════════════════════════════════════
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
 * ✅ GET FLAGSHIP MODELS: Extract and rank models dynamically with provider diversity
 *
 * 100% data-driven flagship detection based on OpenRouter API data.
 * NO hard-coded model names - scores based on observable characteristics.
 *
 * Returns top 10 flagship models with maximum 2 models per provider.
 * This ensures provider diversity in "Most Popular" section.
 *
 * Algorithm:
 * 1. Filter models with flagship score >= 70
 * 2. Group by provider
 * 3. Take max 2 highest-scored models from each provider
 * 4. Sort all selected models by score
 * 5. Return top 10 overall
 *
 * @param models All available models
 * @returns Top 10 flagship models (max 2 per provider) sorted by flagship score
 */
export function getFlagshipModels(models: BaseModelResponse[]): BaseModelResponse[] {
  // Score all models and filter flagships
  const flagshipCandidates = models
    .map(model => ({ model, score: getFlagshipScore(model) }))
    .filter(item => item.score >= 70) // Flagship threshold
    .sort((a, b) => b.score - a.score); // Sort by score descending

  // Group by provider and take max 2 from each
  const modelsByProvider = new Map<string, BaseModelResponse[]>();

  for (const { model } of flagshipCandidates) {
    const provider = model.provider;
    if (!modelsByProvider.has(provider)) {
      modelsByProvider.set(provider, []);
    }

    const providerModels = modelsByProvider.get(provider)!;
    // Only add if this provider has less than 2 models already
    if (providerModels.length < 2) {
      providerModels.push(model);
    }
  }

  // Flatten and sort by flagship score again
  const diverseFlagshipModels: BaseModelResponse[] = [];
  for (const providerModels of modelsByProvider.values()) {
    diverseFlagshipModels.push(...providerModels);
  }

  // Sort by flagship score and limit to top 10
  return diverseFlagshipModels
    .sort((a, b) => {
      const scoreA = getFlagshipScore(a);
      const scoreB = getFlagshipScore(b);
      return scoreB - scoreA;
    })
    .slice(0, 10);
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
 * ✅ MODEL SELECTION: Uses cheapest available model from models-config.service.ts
 * ✅ PROMPT: Uses centralized prompt from lib/ai/prompts.ts
 * Model selection based on user tier and pricing from the configured model list
 */
export const TITLE_GENERATION_CONFIG = {
  temperature: 0.3,
  maxTokens: 15,
  topP: 0.7,
  systemPrompt: TITLE_GENERATION_PROMPT,
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

/**
 * Infinite retry configuration for multi-participant chat
 *
 * Retry Strategy:
 * - Attempts 1-10: Fast retries with exponential backoff (2s → 60s)
 * - Attempts 11+: Extended retries with 2-minute intervals
 * - Never gives up until valid response or manual abort
 */
export const INFINITE_RETRY_CONFIG = {
  maxInitialAttempts: 10, // Fast retries before switching to extended mode
  initialDelay: 2000, // 2 seconds - start delay
  maxDelay: 60000, // 60 seconds - cap for exponential backoff
  extendedDelay: 120000, // 2 minutes - extended retry interval
} as const;

/**
 * Calculate exponential backoff delay for infinite retry
 *
 * @param attempt Current retry attempt number (1-based)
 * @returns Delay in milliseconds
 */
export function getExponentialBackoff(attempt: number): number {
  if (attempt <= 0)
    return 0;

  // Extended retry mode (attempts 11+)
  if (attempt > INFINITE_RETRY_CONFIG.maxInitialAttempts) {
    return INFINITE_RETRY_CONFIG.extendedDelay; // 120s
  }

  // Exponential backoff (attempts 1-10)
  const delay = INFINITE_RETRY_CONFIG.initialDelay * 2 ** (attempt - 1);
  return Math.min(delay, INFINITE_RETRY_CONFIG.maxDelay);
}

/**
 * Check if error is transient (should retry) or permanent (skip to next participant)
 *
 * Permanent errors require user action (e.g., fix OpenRouter settings, upgrade plan)
 * Transient errors can be resolved by retrying (e.g., network issues, rate limits)
 *
 * @param error Error to check
 * @returns True if error is transient and should be retried
 * @see isTransientErrorFromObject in error-metadata-builders (consolidated implementation)
 */
export function isTransientError(error: unknown): boolean {
  return isTransientErrorFromObject(error);
}
