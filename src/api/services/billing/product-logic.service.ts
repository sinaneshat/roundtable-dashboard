/**
 * Product Logic Service
 *
 * Single source of truth for subscription tiers, model pricing, access rules, limits, quotas, and pricing calculations.
 * All tier-specific values defined in TIER_CONFIG with compile-time type safety.
 */

import { z } from 'zod';

import type { ChatMode, ModelPricingTier, SubscriptionTier } from '@/api/core/enums';
import {
  ChatModes,
  getModelTierMultiplier,
  MODEL_PRICING_TIERS,
  MODEL_TIER_THRESHOLDS,
  SUBSCRIPTION_TIERS,
  SubscriptionTiers,
} from '@/api/core/enums';
// Direct import to avoid barrel export pulling in server-only slug-generator.service.ts
import { TITLE_GENERATION_PROMPT } from '@/api/services/prompts/prompts.service';
import { CREDIT_CONFIG } from '@/lib/config/credit-config';

const _ModelForPricingSchema = z.object({
  id: z.string(),
  name: z.string(),
  pricing: z.object({
    prompt: z.string(),
    completion: z.string(),
  }),
  pricing_display: z.object({
    input: z.string().nullable(),
    output: z.string().nullable(),
  }).nullable().optional(),
  context_length: z.number(),
  created: z.number().nullable().optional(),
  provider: z.string().optional(),
  capabilities: z.object({
    vision: z.boolean(),
    reasoning: z.boolean(),
    streaming: z.boolean(),
    tools: z.boolean(),
  }).optional(),
});

export type ModelForPricing = z.infer<typeof _ModelForPricingSchema>;

const _TierConfigurationSchema = z.object({
  name: z.string(),
  maxOutputTokens: z.number(),
  maxModelPricing: z.number().nullable(),
  maxModels: z.number(),
  quotas: z.object({
    threadsPerMonth: z.number(),
    messagesPerMonth: z.number(),
    customRolesPerMonth: z.number(),
    analysisPerMonth: z.number(),
  }),
  upgradeMessage: z.string(),
  monthlyCredits: z.number(),
});

type TierConfiguration = z.infer<typeof _TierConfigurationSchema>;

export const TIER_CONFIG: Record<SubscriptionTier, TierConfiguration> = {
  free: {
    name: 'Free',
    maxOutputTokens: 512,
    maxModelPricing: 0.20, // 5 budget models: 3 OpenAI + 1 DeepSeek + 1 X-AI (<= $0.20/1M tokens)
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

export const SUBSCRIPTION_TIER_NAMES: Record<SubscriptionTier, string>
  = deriveTierRecord(config => config.name);

export const MAX_OUTPUT_TOKENS_BY_TIER: Record<SubscriptionTier, number>
  = deriveTierRecord(config => config.maxOutputTokens);

export const MAX_MODEL_PRICING_BY_TIER: Record<SubscriptionTier, number | null>
  = deriveTierRecord(config => config.maxModelPricing);

export const MIN_PARTICIPANTS_REQUIRED = 2;

export const MAX_MODELS_BY_TIER: Record<SubscriptionTier, number>
  = deriveTierRecord(config => config.maxModels);

/**
 * Absolute maximum participants allowed across all tiers.
 * Derived from pro tier's maxModels limit.
 * Used as literal value in Zod schemas that require compile-time constants.
 */
export const MAX_PARTICIPANTS_LIMIT = 12;

export const TIER_QUOTAS: Record<
  SubscriptionTier,
  {
    threadsPerMonth: number;
    messagesPerMonth: number;
    customRolesPerMonth: number;
    analysisPerMonth: number;
  }
> = deriveTierRecord(config => config.quotas);

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

export function getPlanConfig(planType: 'paid') {
  return CREDIT_CONFIG.PLANS[planType];
}

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

export function getTierName(tier: SubscriptionTier): string {
  return TIER_CONFIG[tier].name;
}

export function getTiersInOrder(): SubscriptionTier[] {
  return [...SUBSCRIPTION_TIERS];
}

export function getMaxOutputTokensForTier(tier: SubscriptionTier): number {
  return MAX_OUTPUT_TOKENS_BY_TIER[tier];
}

/**
 * Calculate safe max output tokens based on model context and tier limits
 *
 * @param modelContextLength - Model's total context window
 * @param estimatedInputTokens - Estimated tokens used by input (system prompt + messages)
 * @param tier - User's subscription tier
 * @returns Safe max output tokens that won't exceed context or tier limits
 */
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

const _TierAccessInfoSchema = z.object({
  is_accessible_to_user: z.boolean(),
  required_tier_name: z.string().nullable(),
});

export type TierAccessInfo = z.infer<typeof _TierAccessInfoSchema>;

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

export function getFlagshipScore(model: ModelForPricing): number {
  let score = 0;

  const inputPrice = Number.parseFloat(model.pricing.prompt) * 1_000_000;

  if (inputPrice >= 5 && inputPrice <= 20) {
    score += 35;
  } else if (inputPrice > 20 && inputPrice <= 100) {
    score += 30;
  } else if (inputPrice >= 1 && inputPrice < 5) {
    score += 20;
  } else if (inputPrice > 100) {
    score += 15;
  }

  if (model.context_length >= 200000) {
    score += 30;
  } else if (model.context_length >= 128000) {
    score += 25;
  } else if (model.context_length >= 64000) {
    score += 15;
  }

  if (model.created) {
    const ageInDays = (Date.now() / 1000 - model.created) / (60 * 60 * 24);
    if (ageInDays < 180) {
      score += 20;
    } else if (ageInDays < 365) {
      score += 15;
    } else {
      score += 5;
    }
  } else {
    score += 10;
  }

  if (model.capabilities?.vision)
    score += 5;
  if (model.capabilities?.reasoning)
    score += 5;
  if (model.capabilities?.tools)
    score += 5;

  return score;
}

export function isFlagshipModel(model: ModelForPricing): boolean {
  const score = getFlagshipScore(model);
  return score >= 70;
}

export function getFlagshipModels(
  models: ModelForPricing[],
): ModelForPricing[] {
  const flagshipCandidates = models
    .map(model => ({ model, score: getFlagshipScore(model) }))
    .filter(item => item.score >= 70)
    .sort((a, b) => b.score - a.score);

  const modelsByProvider = new Map<string, ModelForPricing[]>();

  for (const { model } of flagshipCandidates) {
    const provider = model.provider || model.id.split('/')[0] || 'unknown';
    if (!modelsByProvider.has(provider)) {
      modelsByProvider.set(provider, []);
    }

    const providerModels = modelsByProvider.get(provider);
    if (!providerModels) {
      continue;
    }

    if (providerModels.length < 2) {
      providerModels.push(model);
    }
  }

  const diverseFlagshipModels: ModelForPricing[] = [];
  for (const providerModels of modelsByProvider.values()) {
    diverseFlagshipModels.push(...providerModels);
  }

  return diverseFlagshipModels
    .sort((a, b) => {
      const scoreA = getFlagshipScore(a);
      const scoreB = getFlagshipScore(b);
      return scoreB - scoreA;
    })
    .slice(0, 10);
}

export const DEFAULT_AI_PARAMS = {
  temperature: 0.7,
  maxTokens: 1024,
  topP: 0.9,
} as const;

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

export const TITLE_GENERATION_CONFIG = {
  temperature: 0.3,
  maxTokens: 15,
  topP: 0.7,
  systemPrompt: TITLE_GENERATION_PROMPT,
} as const;

/**
 * AI Provider Timeout Configuration
 *
 * ✅ CLOUDFLARE WORKERS LIMITS:
 * - CPU time: 300,000ms (5 min) - paid plan max
 * - Wall-clock: UNLIMITED - continues as long as client connected
 * - IDLE timeout: 100s - Cloudflare returns HTTP 524 if no data sent
 *
 * These timeouts control AbortSignal.timeout() for AI SDK streamText/generateText.
 * Set generously since actual constraint is Cloudflare's idle timeout.
 * Active SSE streams sending data are NOT affected by idle timeout.
 *
 * @see https://developers.cloudflare.com/workers/platform/limits/
 */
export const AI_TIMEOUT_CONFIG = {
  /** Default timeout for AI operations (10 min) */
  default: 600_000,

  /** Title generation timeout (10s) - quick operation */
  titleGeneration: 10_000,

  /** Per-attempt timeout for streaming (10 min) - max allowed per AI SDK call */
  perAttemptMs: 600_000,

  /** Moderator/council analysis timeout (5 min) - complex multi-response synthesis */
  moderatorAnalysisMs: 300_000,
} as const;

export const AI_RETRY_CONFIG = {
  maxAttempts: 10,
  baseDelay: 500,
} as const;

export const INFINITE_RETRY_CONFIG = {
  maxInitialAttempts: 10,
  initialDelay: 2000,
  maxDelay: 60000,
  extendedDelay: 120000,
} as const;

export function getExponentialBackoff(attempt: number): number {
  if (attempt <= 0)
    return 0;

  if (attempt > INFINITE_RETRY_CONFIG.maxInitialAttempts) {
    return INFINITE_RETRY_CONFIG.extendedDelay;
  }

  const delay = INFINITE_RETRY_CONFIG.initialDelay * 2 ** (attempt - 1);
  return Math.min(delay, INFINITE_RETRY_CONFIG.maxDelay);
}
