/**
 * Product Logic Service
 *
 * Single source of truth for subscription tiers, model pricing, access rules, limits, quotas, and pricing calculations.
 * All tier-specific values defined in TIER_CONFIG with compile-time type safety.
 */

import { z as zOpenAPI } from '@hono/zod-openapi';

import type { ChatMode, ModelPricingTier, PlanType, SubscriptionTier } from '@/api/core/enums';
import {
  ChatModes,
  getModelTierMultiplier,
  MODEL_PRICING_TIERS,
  MODEL_TIER_THRESHOLDS,
  SUBSCRIPTION_TIERS,
  SubscriptionTiers,
} from '@/api/core/enums';
import { TITLE_GENERATION_PROMPT } from '@/api/services/prompts.service';
import { CREDIT_CONFIG } from '@/lib/config/credit-config';

export type ModelForPricing = {
  id: string;
  pricing: {
    prompt: string;
    completion: string;
  };
  pricing_display?: {
    input: string | null;
    output: string | null;
  } | null;
  context_length: number;
  created?: number | null;
  provider?: string;
  capabilities?: {
    vision: boolean;
    reasoning: boolean;
    streaming: boolean;
    tools: boolean;
  };
};
export type TierConfiguration = {
  name: string;
  maxOutputTokens: number;
  maxModelPricing: number | null;
  maxModels: number;
  quotas: {
    threadsPerMonth: number;
    messagesPerMonth: number;
    customRolesPerMonth: number;
    analysisPerMonth: number;
  };
  upgradeMessage: string;
  monthlyCredits: number;
};
export const TIER_CONFIG: Record<SubscriptionTier, TierConfiguration> = {
  free: {
    name: 'Free',
    maxOutputTokens: 512,
    maxModelPricing: 0.10,
    maxModels: 3,
    quotas: {
      threadsPerMonth: 1,
      messagesPerMonth: 100,
      customRolesPerMonth: 0,
      analysisPerMonth: 10,
    },
    upgradeMessage: 'Upgrade to Pro for unlimited access to all models',
    monthlyCredits: 0,
  },
  pro: {
    name: 'Pro',
    maxOutputTokens: 4096,
    maxModelPricing: null,
    maxModels: 12,
    quotas: {
      threadsPerMonth: 500,
      messagesPerMonth: 10000,
      customRolesPerMonth: 25,
      analysisPerMonth: 1000,
    },
    upgradeMessage: 'You have access to all models',
    monthlyCredits: CREDIT_CONFIG.PLANS.paid.monthlyCredits,
  },
} as const;

function deriveTierRecord<T>(
  extractor: (config: TierConfiguration) => T,
): Record<SubscriptionTier, T> {
  return Object.fromEntries(
    SUBSCRIPTION_TIERS.map(tier => [tier, extractor(TIER_CONFIG[tier])]),
  ) as Record<SubscriptionTier, T>;
}

/**
 * Human-readable tier names
 * @derived from TIER_CONFIG
 */
export const SUBSCRIPTION_TIER_NAMES: Record<SubscriptionTier, string>
  = deriveTierRecord(config => config.name);

/**
 * OpenAPI-enhanced subscription tier schema
 * Use this in route files (schema.ts) for OpenAPI documentation
 * NOTE: For non-OpenAPI contexts, use SubscriptionTierSchema from @/api/core/enums
 */
export const subscriptionTierSchemaOpenAPI = zOpenAPI.enum(SUBSCRIPTION_TIERS);

/**
 * Maximum output tokens by tier (per participant)
 * @derived from TIER_CONFIG
 */
export const MAX_OUTPUT_TOKENS_BY_TIER: Record<SubscriptionTier, number>
  = deriveTierRecord(config => config.maxOutputTokens);

/**
 * Maximum model pricing threshold by tier (per 1M tokens input)
 * null = unlimited access to all models
 * @derived from TIER_CONFIG
 */
export const MAX_MODEL_PRICING_BY_TIER: Record<SubscriptionTier, number | null>
  = deriveTierRecord(config => config.maxModelPricing);

/**
 * Recommended minimum models for best experience
 * NOT enforced - users can choose 1+ models freely
 */
export const MIN_MODELS_REQUIRED = 3;

/**
 * Maximum models per conversation by tier
 * @derived from TIER_CONFIG
 */
export const MAX_MODELS_BY_TIER: Record<SubscriptionTier, number>
  = deriveTierRecord(config => config.maxModels);

/**
 * Monthly quotas by tier
 * @derived from TIER_CONFIG
 */
export const TIER_QUOTAS: Record<
  SubscriptionTier,
  {
    threadsPerMonth: number;
    messagesPerMonth: number;
    customRolesPerMonth: number;
    analysisPerMonth: number;
  }
> = deriveTierRecord(config => config.quotas);

// ============================================================================
// CREDIT UTILITY FUNCTIONS
// ============================================================================

export function tokensToCredits(tokens: number): number {
  return Math.ceil(tokens / CREDIT_CONFIG.TOKENS_PER_CREDIT);
}

export function creditsToTokens(credits: number): number {
  return credits * CREDIT_CONFIG.TOKENS_PER_CREDIT;
}

export function getActionCreditCost(action: keyof typeof CREDIT_CONFIG.ACTION_COSTS): number {
  const tokens = CREDIT_CONFIG.ACTION_COSTS[action];
  return tokensToCredits(tokens);
}

export function estimateStreamingCredits(
  participantCount: number,
  estimatedInputTokens: number = 500,
): number {
  const estimatedOutputTokens = CREDIT_CONFIG.DEFAULT_ESTIMATED_TOKENS_PER_RESPONSE * participantCount;
  const totalTokens = estimatedInputTokens + estimatedOutputTokens;
  const reservedTokens = Math.ceil(totalTokens * CREDIT_CONFIG.RESERVATION_MULTIPLIER);
  return tokensToCredits(reservedTokens);
}

export function calculateBaseCredits(inputTokens: number, outputTokens: number): number {
  return tokensToCredits(inputTokens + outputTokens);
}

export function getPlanConfig(planType: Exclude<PlanType, 'free'>) {
  return CREDIT_CONFIG.PLANS[planType];
}

// ============================================================================
// MODEL PRICING TIER FUNCTIONS
// ============================================================================

export function getModelPricingTier(model: ModelForPricing): ModelPricingTier {
  const inputPricePerMillion = costPerMillion(model.pricing.prompt);

  for (const tier of MODEL_PRICING_TIERS) {
    const { min, max } = MODEL_TIER_THRESHOLDS[tier];
    if (inputPricePerMillion >= min && inputPricePerMillion < max) {
      return tier;
    }
  }

  return CREDIT_CONFIG.DEFAULT_MODEL_TIER;
}

export function getModelPricingTierById(
  modelId: string,
  getModel: (id: string) => ModelForPricing | undefined,
): ModelPricingTier {
  const model = getModel(modelId);
  if (!model) {
    return CREDIT_CONFIG.DEFAULT_MODEL_TIER;
  }
  return getModelPricingTier(model);
}

export function getModelCreditMultiplier(model: ModelForPricing): number {
  const tier = getModelPricingTier(model);
  return getModelTierMultiplier(tier);
}

export function getModelCreditMultiplierById(
  modelId: string,
  getModel: (id: string) => ModelForPricing | undefined,
): number {
  const tier = getModelPricingTierById(modelId, getModel);
  return getModelTierMultiplier(tier);
}

export function calculateWeightedCredits(
  inputTokens: number,
  outputTokens: number,
  modelId: string,
  getModel: (id: string) => ModelForPricing | undefined,
): number {
  const baseCredits = calculateBaseCredits(inputTokens, outputTokens);
  const multiplier = getModelCreditMultiplierById(modelId, getModel);
  return Math.ceil(baseCredits * multiplier);
}

export function estimateWeightedCredits(
  participantCount: number,
  modelId: string,
  getModel: (id: string) => ModelForPricing | undefined,
  estimatedInputTokens: number = CREDIT_CONFIG.DEFAULT_ESTIMATED_INPUT_TOKENS,
): number {
  const baseEstimate = estimateStreamingCredits(participantCount, estimatedInputTokens);
  const multiplier = getModelCreditMultiplierById(modelId, getModel);
  return Math.ceil(baseEstimate * multiplier);
}

// ============================================================================
// TIER UTILITY FUNCTIONS
// ============================================================================

export function getTierName(tier: SubscriptionTier): string {
  return TIER_CONFIG[tier].name;
}

export function getTiersInOrder(): SubscriptionTier[] {
  return [...SUBSCRIPTION_TIERS];
}

export function getMaxOutputTokensForTier(tier: SubscriptionTier): number {
  return MAX_OUTPUT_TOKENS_BY_TIER[tier];
}

export function getSafeMaxOutputTokens(
  modelContextLength: number,
  estimatedInputTokens: number,
  tier: SubscriptionTier,
): number {
  const tierMaxOutput = getMaxOutputTokensForTier(tier);
  const safetyBuffer = Math.floor(modelContextLength * 0.2);
  const availableTokens = modelContextLength - estimatedInputTokens - safetyBuffer;
  return Math.max(512, Math.min(tierMaxOutput, availableTokens));
}

export function getMaxModelPricingForTier(tier: SubscriptionTier): number | null {
  return MAX_MODEL_PRICING_BY_TIER[tier];
}

export function getMaxModelsForTier(tier: SubscriptionTier): number {
  return MAX_MODELS_BY_TIER[tier];
}

export function getMonthlyCreditsForTier(tier: SubscriptionTier): number {
  return TIER_CONFIG[tier].monthlyCredits;
}

export function getTierFromProductId(productId: string): SubscriptionTier {
  if (productId === CREDIT_CONFIG.PLANS.paid.stripeProductId) {
    return SubscriptionTiers.PRO;
  }

  const normalized = productId.toLowerCase();

  if (
    normalized.includes('_pro_')
    || normalized.endsWith('_pro')
    || normalized.includes('-pro-')
    || normalized.endsWith('-pro')
    || /(?:^|[^a-z])pro(?:$|[^a-z])/.test(normalized)
  ) {
    return SubscriptionTiers.PRO;
  }

  return SubscriptionTiers.FREE;
}

// ============================================================================
// PRICING CALCULATIONS
// ============================================================================

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

export function costPerMillion(pricePerToken: string | number): number {
  const perToken = typeof pricePerToken === 'number' ? pricePerToken : Number.parseFloat(pricePerToken);
  return perToken * 1_000_000;
}

// ============================================================================
// MODEL ACCESS & PRICING LOGIC
// ============================================================================

export function isModelFree(model: ModelForPricing): boolean {
  const inputPricePerMillion = costPerMillion(model.pricing.prompt);
  const freeLimit = MAX_MODEL_PRICING_BY_TIER.free;
  return freeLimit !== null && inputPricePerMillion <= freeLimit;
}

export function getModelCostCategory(model: ModelForPricing): 'free' | 'low' | 'medium' | 'high' {
  if (isModelFree(model))
    return 'free';

  const inputPrice = parsePrice(model.pricing_display?.input || 0);

  if (inputPrice <= 1.0)
    return 'low';
  if (inputPrice <= 10.0)
    return 'medium';
  return 'high';
}

export function getModelPricingDisplay(model: ModelForPricing): string {
  if (isModelFree(model))
    return 'Free';

  const inputPrice = parsePrice(model.pricing_display?.input || 0);
  const outputPrice = parsePrice(model.pricing_display?.output || 0);

  return `$${inputPrice.toFixed(2)}/$${outputPrice.toFixed(2)} per 1M tokens`;
}

export function getTierUpgradeMessage(tier: SubscriptionTier): string {
  return TIER_CONFIG[tier].upgradeMessage;
}

export function getRequiredTierForModel(model: ModelForPricing): SubscriptionTier {
  const inputPricePerMillion = costPerMillion(model.pricing.prompt);
  const freeLimit = MAX_MODEL_PRICING_BY_TIER[SubscriptionTiers.FREE];
  if (freeLimit !== null && inputPricePerMillion <= freeLimit) {
    return SubscriptionTiers.FREE;
  }
  return SubscriptionTiers.PRO;
}

export function canAccessModelByPricing(userTier: SubscriptionTier, model: ModelForPricing): boolean {
  const requiredTier = getRequiredTierForModel(model);
  const userTierIndex = SUBSCRIPTION_TIERS.indexOf(userTier);
  const requiredTierIndex = SUBSCRIPTION_TIERS.indexOf(requiredTier);
  return userTierIndex >= requiredTierIndex;
}

export type TierAccessInfo = {
  is_accessible_to_user: boolean;
  required_tier_name: string | null;
};

export function enrichWithTierAccess(
  modelId: string,
  userTier: SubscriptionTier,
  getModel: (id: string) => ModelForPricing | undefined,
): TierAccessInfo {
  const model = getModel(modelId);
  if (!model) {
    return {
      is_accessible_to_user: false,
      required_tier_name: null,
    };
  }

  const requiredTier = getRequiredTierForModel(model);
  const requiredTierName = SUBSCRIPTION_TIER_NAMES[requiredTier];
  const isAccessible = canAccessModelByPricing(userTier, model);

  return {
    is_accessible_to_user: isAccessible,
    required_tier_name: requiredTierName,
  };
}

export function canAccessByTier(userTier: SubscriptionTier, requiredTier: SubscriptionTier): boolean {
  const userTierIndex = SUBSCRIPTION_TIERS.indexOf(userTier);
  const requiredTierIndex = SUBSCRIPTION_TIERS.indexOf(requiredTier);
  return userTierIndex >= requiredTierIndex;
}

// ============================================================================
// MODEL SELECTION LOGIC
// ============================================================================

export function getQuickStartModelsByTier(
  models: ModelForPricing[],
  tier: SubscriptionTier,
  count: number = 4,
): string[] {
  const accessibleModels = models.filter(model => canAccessModelByPricing(tier, model));

  if (accessibleModels.length === 0) {
    return [];
  }

  const sortedModels = [...accessibleModels].sort((a, b) => (b.context_length || 0) - (a.context_length || 0));
  return sortedModels.slice(0, count).map(model => model.id);
}

export function getDefaultModelForTier(models: ModelForPricing[], tier: SubscriptionTier): string | undefined {
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
export function getFlagshipScore(model: ModelForPricing): number {
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
  }
  // Budget/free tier: score += 0 (no-op)

  // ═══════════════════════════════════════════════════════════════
  // CONTEXT WINDOW (30 points) - Large context = flagship capability
  // ═══════════════════════════════════════════════════════════════
  if (model.context_length >= 200000) {
    score += 30; // Ultra-large (200K+) = cutting-edge
  } else if (model.context_length >= 128000) {
    score += 25; // Large (128K-200K) = flagship tier
  } else if (model.context_length >= 64000) {
    score += 15; // Medium-large (64K-128K)
  }
  // Small context: score += 0 (no-op)

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
      score += 5; // Older = less likely flagship
    }
  } else {
    score += 10; // No timestamp = neutral
  }

  // ═══════════════════════════════════════════════════════════════
  // CAPABILITIES (15 points) - Advanced features = flagship
  // ═══════════════════════════════════════════════════════════════
  if (model.capabilities?.vision)
    score += 5;
  if (model.capabilities?.reasoning)
    score += 5;
  if (model.capabilities?.tools)
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
export function isFlagshipModel(model: ModelForPricing): boolean {
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
export function getFlagshipModels(
  models: ModelForPricing[],
): ModelForPricing[] {
  // Score all models and filter flagships
  const flagshipCandidates = models
    .map(model => ({ model, score: getFlagshipScore(model) }))
    .filter(item => item.score >= 70) // Flagship threshold
    .sort((a, b) => b.score - a.score); // Sort by score descending

  // Group by provider and take max 2 from each
  const modelsByProvider = new Map<string, ModelForPricing[]>();

  for (const { model } of flagshipCandidates) {
    // Extract provider from model or infer from model ID
    const provider = model.provider ?? model.id.split('/')[0] ?? 'unknown';
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
  const diverseFlagshipModels: ModelForPricing[] = [];
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
  maxTokens: 1024,
  topP: 0.9,
} as const;

/**
 * Mode-specific AI parameters for maximum stability and consistency
 * Import ChatModeId type to properly type this configuration
 */
export const MODE_SPECIFIC_AI_PARAMS: Record<
  ChatMode,
  { temperature: number; topP: number; maxTokens: number }
> = {
  [ChatModes.ANALYZING]: {
    temperature: 0.3,
    topP: 0.7,
    maxTokens: 1024,
  },
  [ChatModes.BRAINSTORMING]: {
    temperature: 0.6,
    topP: 0.85,
    maxTokens: 1024,
  },
  [ChatModes.DEBATING]: {
    temperature: 0.5,
    topP: 0.8,
    maxTokens: 1024,
  },
  [ChatModes.SOLVING]: {
    temperature: 0.4,
    topP: 0.75,
    maxTokens: 1024,
  },
} as const;

/**
 * Get AI parameters for a specific mode
 */
export function getAIParamsForMode(mode: ChatMode): {
  temperature: number;
  topP: number;
  maxTokens: number;
} {
  const params = MODE_SPECIFIC_AI_PARAMS[mode];
  if (!params) {
    throw new Error(`Invalid chat mode: ${mode}`);
  }
  return params;
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
 *
 * ✅ IMPORTANT: These are WALL TIME timeouts (includes I/O wait), not CPU time.
 *
 * Cloudflare Workers limits (wrangler.jsonc):
 * - CPU time: 30,000ms (30s of actual compute) - set via limits.cpu_ms
 * - Memory: 128MB (fixed, can't be increased)
 *
 * During streaming, most time is I/O wait (waiting for AI provider response),
 * not CPU compute. The 10-minute wall time allows for slow reasoning models
 * while staying within the 30s CPU limit since actual compute is minimal.
 *
 * ✅ AI SDK v6 PATTERN: Reasoning models need extended timeouts
 * @see https://sdk.vercel.ai/docs/providers/community-providers/claude-code#extended-thinking
 */
export const AI_TIMEOUT_CONFIG = {
  /** 10 min wall time - reasoning models need extended I/O wait, not CPU */
  default: 600000,
  /** 10 sec - title generation is fast, minimal compute */
  titleGeneration: 10000,
  /** 10 min per attempt - matches frontend timeout, mostly I/O wait */
  perAttemptMs: 600000,
  /** 2 min for moderator analysis - non-reasoning, more compute-intensive */
  moderatorAnalysisMs: 120000,
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
