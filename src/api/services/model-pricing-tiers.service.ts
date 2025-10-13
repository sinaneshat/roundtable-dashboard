/**
 * Model Pricing Tiers Service - Context7 Pattern
 *
 * ✅ DYNAMIC PRICING-BASED ACCESS CONTROL:
 * - Maps OpenRouter model pricing to subscription tiers
 * - Determines model access based on user's subscription level
 * - NO hardcoded model lists - fully dynamic from OpenRouter API
 *
 * ✅ SINGLE SOURCE OF TRUTH: All tier configs from @/db/config/subscription-tiers
 *
 * Official OpenRouter Pricing Structure:
 * - pricing.prompt: Cost per input token (USD)
 * - pricing.completion: Cost per output token (USD)
 * - "0" = Free model
 * - Scientific notation for paid models (e.g., "0.0000003")
 */

import { getMaxModelPricing, getTierName } from '@/constants/subscription-tiers';
import type { SubscriptionTier } from '@/db/tables/usage';

import type { BaseModelResponse } from '../routes/models/schema';

// ============================================================================
// PRICING TIER THRESHOLDS (Based on Single Source of Truth)
// ============================================================================

/**
 * ✅ SINGLE SOURCE OF TRUTH: Pricing thresholds derived from centralized config
 *
 * Converts config maxModelPricing ($/1M tokens) to per-1K-token format for comparisons
 * - Free Tier: $0 per 1M tokens → 0 per 1K
 * - Starter Tier: $1 per 1M tokens → 0.001 per 1K
 * - Pro Tier: $20 per 1M tokens → 0.020 per 1K
 * - Power Tier: null (unlimited) → Infinity per 1K
 */
function getPricingThreshold(tier: SubscriptionTier): {
  maxPromptCostPer1K: number;
  maxCompletionCostPer1K: number;
} {
  const maxPricingPerMillion = getMaxModelPricing(tier);

  // null = unlimited (power tier)
  if (maxPricingPerMillion === null) {
    return {
      maxPromptCostPer1K: Infinity,
      maxCompletionCostPer1K: Infinity,
    };
  }

  // Convert $/1M tokens to $/1K tokens
  const maxPricingPer1K = maxPricingPerMillion / 1000;

  return {
    maxPromptCostPer1K: maxPricingPer1K,
    maxCompletionCostPer1K: maxPricingPer1K,
  };
}

// ============================================================================
// PRICING UTILITY FUNCTIONS (Exported for Reuse)
// ============================================================================

/**
 * Parse OpenRouter pricing string to number
 * Handles scientific notation and "0" for free models
 *
 * ✅ SINGLE SOURCE OF TRUTH: Exported for use across all pricing calculations
 *
 * @example
 * parsePrice("0") => 0
 * parsePrice("0.0000003") => 0.0000003
 * parsePrice("0.003") => 0.003
 */
export function parsePrice(priceStr: string): number {
  const price = Number.parseFloat(priceStr);
  return Number.isNaN(price) ? 0 : price;
}

/**
 * Convert per-token cost to per-1K-token cost
 * OpenRouter prices are per token, we calculate per 1K for easier thresholds
 *
 * @example
 * costPer1K("0.0000003") => 0.0003 (per 1K tokens)
 * costPer1K("0.003") => 3.0 (per 1K tokens)
 */
function costPer1K(priceStr: string): number {
  const perTokenCost = parsePrice(priceStr);
  return perTokenCost * 1000;
}

/**
 * Convert per-token cost to per-million-token cost
 * OpenRouter prices are per token, we calculate per million for display purposes
 *
 * ✅ SINGLE SOURCE OF TRUTH: Exported for use in pricing display calculations
 *
 * @example
 * costPerMillion("0.0000003") => 0.3 (per 1M tokens = $0.30)
 * costPerMillion("0.000003") => 3.0 (per 1M tokens = $3.00)
 */
export function costPerMillion(priceStr: string): number {
  const perTokenCost = parsePrice(priceStr);
  return perTokenCost * 1_000_000;
}

/**
 * Determine if a model is completely free
 * Free models have both prompt and completion costs = 0 OR have "free" in their name/id
 *
 * ✅ IMPROVED: Now checks both pricing and model name for "free" prefix
 * ✅ PATTERN: Uses BaseModelResponse - only needs base fields, not tier info
 */
export function isModelFree(model: BaseModelResponse): boolean {
  const promptCost = parsePrice(model.pricing.prompt);
  const completionCost = parsePrice(model.pricing.completion);

  // Check if pricing is $0
  const isFreeByPricing = promptCost === 0 && completionCost === 0;

  // Check if model name/id contains "free" (case-insensitive)
  const isFreeByName = model.name.toLowerCase().includes('free') || model.id.toLowerCase().includes('free');

  return isFreeByPricing || isFreeByName;
}

/**
 * Get the cost category for a model
 * Categorizes models by their pricing level for UI display
 * ✅ PATTERN: Uses BaseModelResponse - only needs base fields
 */
export function getModelCostCategory(
  model: BaseModelResponse,
): 'free' | 'budget' | 'standard' | 'premium' {
  if (isModelFree(model)) {
    return 'free';
  }

  const promptCostPer1K = costPer1K(model.pricing.prompt);
  const completionCostPer1K = costPer1K(model.pricing.completion);
  const maxCost = Math.max(promptCostPer1K, completionCostPer1K);

  if (maxCost <= 0.01) {
    return 'budget';
  } else if (maxCost <= 0.10) {
    return 'standard';
  } else {
    return 'premium';
  }
}

// ============================================================================
// TIER ACCESS CONTROL
// ============================================================================

/**
 * ✅ DYNAMIC MODEL ACCESS: Check if user's subscription tier can access a model
 *
 * ✅ SINGLE SOURCE OF TRUTH: Uses centralized tier config from @/db/config/subscription-tiers
 *
 * Access is determined by OpenRouter pricing, not hardcoded model lists:
 * - Free tier: Only free models ($0/1M tokens)
 * - Starter tier: Free + budget models (up to $1/1M tokens)
 * - Pro tier: Free + budget + standard models (up to $20/1M tokens)
 * - Power tier: All models (no restrictions)
 *
 * ✅ PATTERN: Uses BaseModelResponse - only needs pricing to determine access
 *
 * @param userTier - User's subscription tier from database
 * @param model - Base OpenRouter model with pricing
 * @returns true if user can access the model
 */
export function canAccessModelByPricing(
  userTier: SubscriptionTier,
  model: BaseModelResponse,
): boolean {
  const threshold = getPricingThreshold(userTier);

  // Convert OpenRouter per-token pricing to per-1K-token for comparison
  const promptCostPer1K = costPer1K(model.pricing.prompt);
  const completionCostPer1K = costPer1K(model.pricing.completion);

  // Model is accessible if both prompt and completion costs are within tier limits
  return (
    promptCostPer1K <= threshold.maxPromptCostPer1K
    && completionCostPer1K <= threshold.maxCompletionCostPer1K
  );
}

/**
 * Get pricing display string for UI
 * Formats OpenRouter pricing for user-friendly display
 *
 * ✅ PATTERN: Uses BaseModelResponse - only needs pricing fields
 *
 * @example
 * getModelPricingDisplay(model) => "$0.30/M in • $1.20/M out"
 * getModelPricingDisplay(freeModel) => "Free"
 */
export function getModelPricingDisplay(model: BaseModelResponse): string {
  if (isModelFree(model)) {
    return 'Free';
  }

  // Convert to per-million tokens for readability
  const promptCostPerMillion = parsePrice(model.pricing.prompt) * 1_000_000;
  const completionCostPerMillion = parsePrice(model.pricing.completion) * 1_000_000;

  // Format with appropriate precision
  const formatCost = (cost: number) => {
    if (cost < 0.01)
      return cost.toFixed(4);
    if (cost < 1)
      return cost.toFixed(2);
    return cost.toFixed(2);
  };

  return `$${formatCost(promptCostPerMillion)}/M in • $${formatCost(completionCostPerMillion)}/M out`;
}

/**
 * Get the minimum tier required to access a model
 * Determines which subscription level is needed for a model
 *
 * ✅ PATTERN: Uses BaseModelResponse - only needs pricing to determine required tier
 *
 * @returns The lowest tier that can access this model
 */
export function getRequiredTierForModel(model: BaseModelResponse): SubscriptionTier {
  if (canAccessModelByPricing('free', model))
    return 'free';
  if (canAccessModelByPricing('starter', model))
    return 'starter';
  if (canAccessModelByPricing('pro', model))
    return 'pro';
  return 'power';
}

/**
 * Get tier upgrade message for model access
 * Generates user-friendly message explaining which tier is needed
 *
 * ✅ SINGLE SOURCE OF TRUTH: Uses getTierName from centralized config
 * ✅ PATTERN: Uses BaseModelResponse - only needs pricing and name
 */
export function getTierUpgradeMessage(
  model: BaseModelResponse,
  currentTier: SubscriptionTier,
): string {
  const requiredTier = getRequiredTierForModel(model);
  const costCategory = getModelCostCategory(model);

  if (requiredTier === currentTier) {
    return 'You have access to this model';
  }

  return `This ${costCategory} model requires ${getTierName(requiredTier)} tier or higher`;
}
