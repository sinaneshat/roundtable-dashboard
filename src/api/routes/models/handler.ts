/**
 * Models API Handlers
 *
 * ✅ TESTING MODE: Uses hardcoded top 50+ models (October 2025)
 * ✅ USES EXISTING TIER LOGIC: product-logic.service.ts for all grouping
 * ✅ NO OPENROUTER API CALLS: Eliminates "data policy restrictions" errors
 *
 * Pattern: Following src/api/routes/{auth,billing}/handler.ts patterns
 */

import type { RouteHandler } from '@hono/zod-openapi';

import { createHandler, Responses } from '@/api/core';
import { canAccessModelByPricing, getFlagshipScore, getMaxModelsForTier, getRequiredTierForModel, getTierName, getTiersInOrder, SUBSCRIPTION_TIER_NAMES } from '@/api/services/product-logic.service';
import { getUserTier } from '@/api/services/usage-tracking.service';
import type { ApiEnv } from '@/api/types';
import { DEFAULT_MODEL_ID, FLAGSHIP_MODEL_IDS, HARDCODED_TOP_MODELS } from '@/lib/config/hardcoded-models';

import type { listModelsRoute } from './route';
import type { BaseModelResponse, TierGroup } from './schema';

// ============================================================================
// COMMENTED OUT - OpenRouter Service (for future dynamic fetching)
// ============================================================================

/**
 * ⚠️ TEMPORARILY DISABLED FOR TESTING
 *
 * This code will fetch models dynamically from OpenRouter when re-enabled.
 * Currently commented out to use hardcoded models for testing purposes.
 *
 * To re-enable:
 * 1. Uncomment the import: import { openRouterModelsService } from '@/api/services/openrouter-models.service';
 * 2. Uncomment the getTop100Models call in listModelsHandler
 * 3. Comment out HARDCODED_TOP_MODELS usage
 */

// import { openRouterModelsService } from '@/api/services/openrouter-models.service';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Enhance raw model with computed fields
 * Matches the structure expected by frontend (BaseModelSchema)
 */
function enhanceModel(model: typeof HARDCODED_TOP_MODELS[number]): BaseModelResponse {
  // Extract provider from model ID (e.g., "openai/gpt-5" -> "openai")
  const provider = model.id.split('/')[0] || 'unknown';

  // Determine category based on model characteristics
  let category: 'reasoning' | 'general' | 'creative' | 'research' = 'general';
  const nameLower = model.name.toLowerCase();
  const descLower = (model.description || '').toLowerCase();

  if (nameLower.includes('coder') || nameLower.includes('code') || descLower.includes('coding')) {
    category = 'reasoning';
  } else if (nameLower.includes('sonnet') || nameLower.includes('opus') || nameLower.includes('claude')) {
    category = 'creative';
  } else if (nameLower.includes('gemini') || descLower.includes('research')) {
    category = 'research';
  }

  // Determine capabilities
  const modality = model.architecture?.modality?.toLowerCase() || '';
  const capabilities = {
    vision: modality.includes('vision') || modality.includes('image'),
    reasoning: model.context_length >= 100000,
    streaming: true, // All models support streaming
    tools: true, // All modern models support tools
  };

  // Format pricing for display
  const inputPrice = Number.parseFloat(model.pricing.prompt);
  const outputPrice = Number.parseFloat(model.pricing.completion);
  const pricing_display = {
    input: inputPrice === 0 ? 'Free' : `$${(inputPrice * 1000000).toFixed(2)}/M`,
    output: outputPrice === 0 ? 'Free' : `$${(outputPrice * 1000000).toFixed(2)}/M`,
  };

  // Determine if model is free
  const is_free = inputPrice === 0 && outputPrice === 0;

  return {
    ...model,
    provider,
    category,
    capabilities,
    pricing_display,
    is_free,
    supports_vision: capabilities.vision,
    is_reasoning_model: false, // No reasoning models in this list
  };
}

// ============================================================================
// Handlers
// ============================================================================

/**
 * List top 50+ hardcoded models with tier-based access control
 *
 * GET /api/v1/models
 *
 * ⚠️ TESTING MODE: Returns hardcoded top 50+ smartest models (October 2025)
 * Uses existing subscription tier logic from product-logic.service.ts
 *
 * Returns:
 * - Tier information (required_tier, is_accessible_to_user)
 * - Top 10 flagship models in separate section
 * - Models grouped by subscription tier
 * - Default model selection based on user's tier
 * - No OpenRouter API calls (eliminates data policy errors)
 */
export const listModelsHandler: RouteHandler<typeof listModelsRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'listModels',
  },
  async (c) => {
    const { user } = c.auth();

    // ✅ SINGLE SOURCE: Get user's subscription tier from centralized service
    // Cached for 5 minutes per user to reduce database load
    const userTier = await getUserTier(user.id);

    // ============================================================================
    // ⚠️ TESTING MODE: Use hardcoded models
    // ============================================================================

    // ✅ USE HARDCODED MODELS: Top 50+ smartest models (October 2025)
    // No OpenRouter API calls - eliminates "data policy restrictions" errors
    const enhancedModels = HARDCODED_TOP_MODELS.map(enhanceModel);

    // ============================================================================
    // ⚠️ FUTURE: Uncomment to use dynamic OpenRouter fetching
    // ============================================================================

    // Get top 100 most popular models from OpenRouter based on scoring algorithm
    // Uses provider quality, popularity patterns, capabilities, context length, recency, and pricing diversity
    // Cached for 24 hours to minimize API calls
    // const models = await openRouterModelsService.getTop100Models();

    // ============================================================================
    // ✅ SERVER-COMPUTED TIER ACCESS: Use existing pricing-based tier detection
    // ============================================================================
    // Uses proven model-pricing logic from product-logic.service.ts
    // Tiers: free ($0/M), starter (up to $2/M), pro (up to $100/M), power (unlimited)

    const modelsWithTierInfo = enhancedModels.map((model) => {
      const requiredTier = getRequiredTierForModel(model);
      const requiredTierName = SUBSCRIPTION_TIER_NAMES[requiredTier];
      const isAccessible = canAccessModelByPricing(userTier, model);

      return {
        ...model,
        required_tier: requiredTier,
        required_tier_name: requiredTierName,
        is_accessible_to_user: isAccessible,
      };
    });

    // ============================================================================
    // ✅ DEFAULT MODEL: Use hardcoded default (DeepSeek V3 - free tier)
    // ============================================================================
    // DeepSeek V3: 685B MoE, completely free, 131K context, strong reasoning
    const defaultModelId = DEFAULT_MODEL_ID;

    // ============================================================================
    // ✅ FLAGSHIP MODELS: Top 10 most popular models shown first
    // ============================================================================
    // Uses FLAGSHIP_MODEL_IDS from hardcoded config
    // These models will automatically score 70+ in the dynamic flagship scoring algorithm
    // when OpenRouter is re-enabled
    const flagshipModels = modelsWithTierInfo.filter(m => FLAGSHIP_MODEL_IDS.includes(m.id));

    // Sort flagship models by their flagship score (highest first)
    // This ensures consistent ordering even when using hardcoded models
    flagshipModels.sort((a, b) => {
      const scoreA = getFlagshipScore(a);
      const scoreB = getFlagshipScore(b);
      return scoreB - scoreA;
    });

    // ============================================================================
    // ✅ TIER GROUPS: Group remaining models by subscription tier
    // ============================================================================
    // Exclude flagship models to avoid duplication
    // Uses existing getTiersInOrder() for consistent tier ordering
    const flagshipModelIds = new Set(FLAGSHIP_MODEL_IDS);
    const nonFlagshipModels = modelsWithTierInfo.filter(m => !flagshipModelIds.has(m.id));

    const tierGroups: TierGroup[] = getTiersInOrder().map((tier) => {
      const tierModels = nonFlagshipModels.filter(m => m.required_tier === tier);

      // Sort models within tier by context window size (descending)
      // Larger context = more capable for most use cases
      tierModels.sort((a, b) => (b.context_length || 0) - (a.context_length || 0));

      return {
        tier,
        tier_name: SUBSCRIPTION_TIER_NAMES[tier],
        models: tierModels,
        is_user_tier: tier === userTier,
      };
    }).filter(group => group.models.length > 0); // Only include tiers that have models

    // ============================================================================
    // ✅ USER TIER CONFIG: All limits and metadata for frontend
    // ============================================================================
    // Computed from product-logic.service.ts - single source of truth
    const maxModels = getMaxModelsForTier(userTier);
    const tierName = getTierName(userTier);
    const canUpgrade = userTier !== 'power'; // Power tier is the highest

    const userTierConfig = {
      tier: userTier,
      tier_name: tierName,
      max_models: maxModels,
      can_upgrade: canUpgrade,
    };

    // ============================================================================
    // ✅ RETURN RESPONSE: Standard collection response format
    // ============================================================================
    return Responses.collection(c, modelsWithTierInfo, {
      total: modelsWithTierInfo.length,
      default_model_id: defaultModelId,
      flagship_models: flagshipModels,
      tier_groups: tierGroups,
      user_tier_config: userTierConfig,
    });
  },
);
