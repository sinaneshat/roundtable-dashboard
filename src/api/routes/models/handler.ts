/**
 * Models API Handlers
 *
 * ✅ DYNAMIC MODE: Fetches models from OpenRouter API
 * ✅ TEXT-ONLY: Filters to text/chat/reasoning models (no audio/image/video generation)
 * ✅ USES EXISTING TIER LOGIC: product-logic.service.ts for all grouping
 *
 * Pattern: Following src/api/routes/{auth,billing}/handler.ts patterns
 */

import type { RouteHandler } from '@hono/zod-openapi';

import { createHandler, Responses } from '@/api/core';
import { openRouterModelsService } from '@/api/services/openrouter-models.service';
import { canAccessModelByPricing, getFlagshipScore, getMaxModelsForTier, getRequiredTierForModel, getTierName, getTiersInOrder, SUBSCRIPTION_TIER_NAMES } from '@/api/services/product-logic.service';
import { getUserTier } from '@/api/services/usage-tracking.service';
import type { ApiEnv } from '@/api/types';

import type { listModelsRoute } from './route';
import type { TierGroup } from './schema';

// ============================================================================
// Handlers
// ============================================================================

/**
 * List top 100 dynamically fetched models with tier-based access control
 *
 * GET /api/v1/models
 *
 * ✅ DYNAMIC MODE: Fetches top 100 smartest models from OpenRouter API
 * ✅ TEXT-ONLY: Automatically filters to text/chat/reasoning models (no audio/image/video)
 * Uses existing subscription tier logic from product-logic.service.ts
 *
 * Returns:
 * - Tier information (required_tier, is_accessible_to_user)
 * - Top 10 flagship models in separate section
 * - Models grouped by subscription tier
 * - Default model selection based on user's tier
 * - Cached for 24 hours to minimize API calls
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
    // ✅ DYNAMIC FETCHING: Get top 100 models from OpenRouter API
    // ============================================================================

    // Get top 100 most popular models from OpenRouter based on scoring algorithm
    // - Text-only models (filters out audio/image/video generation)
    // - Uses provider quality, capabilities, context length, and recency
    // - Cached for 24 hours to minimize API calls
    const enhancedModels = await openRouterModelsService.getTop100Models();

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
    // ✅ DEFAULT MODEL: Get dynamic default from OpenRouter
    // ============================================================================
    // Selects the best default model based on user's tier
    const defaultModelId = await openRouterModelsService.getDefaultModelForTier(userTier);

    // ============================================================================
    // ✅ FLAGSHIP MODELS: Top 10 most popular models shown first
    // ============================================================================
    // Uses dynamic flagship scoring algorithm (getFlagshipScore)
    // Models with score >= 70 are considered flagship
    // Based on provider quality, context length, recency, and capabilities
    const flagshipModels = modelsWithTierInfo.filter(m => getFlagshipScore(m) >= 70);

    // Sort flagship models by their flagship score (highest first)
    flagshipModels.sort((a, b) => {
      const scoreA = getFlagshipScore(a);
      const scoreB = getFlagshipScore(b);
      return scoreB - scoreA;
    });

    // Limit to top 10 flagship models
    const top10Flagship = flagshipModels.slice(0, 10);

    // ============================================================================
    // ✅ TIER GROUPS: Group remaining models by subscription tier
    // ============================================================================
    // Exclude flagship models to avoid duplication
    // Uses existing getTiersInOrder() for consistent tier ordering
    const flagshipModelIds = new Set(top10Flagship.map(m => m.id));
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
      flagship_models: top10Flagship,
      tier_groups: tierGroups,
      user_tier_config: userTierConfig,
    });
  },
);
