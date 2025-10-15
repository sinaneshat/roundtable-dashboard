/**
 * Models API Handlers
 *
 * Handler for OpenRouter models endpoint with tier-based access control
 * ✅ PATTERN: Following src/api/routes/{auth,billing}/handler.ts patterns
 */

import type { RouteHandler } from '@hono/zod-openapi';

import { createHandler, Responses } from '@/api/core';
import { openRouterModelsService } from '@/api/services/openrouter-models.service';
import { canAccessModelByPricing, getFlagshipModels, getMaxModelsForTier, getRequiredTierForModel, getTierName, getTiersInOrder, SUBSCRIPTION_TIER_NAMES } from '@/api/services/product-logic.service';
import { getUserTier } from '@/api/services/usage-tracking.service';
import type { ApiEnv } from '@/api/types';

import type { listModelsRoute } from './route';
import type { TierGroup } from './schema';

// ============================================================================
// Handlers
// ============================================================================

/**
 * List top 50 models with tier-based access control
 *
 * GET /api/v1/models
 * Returns top 50 most popular OpenRouter models with:
 * - Tier information (required_tier, is_accessible_to_user)
 * - Default model selection based on user's tier and popularity
 */
export const listModelsHandler: RouteHandler<typeof listModelsRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'listModels',
  },
  async (c) => {
    const { user } = c.auth();

    // Get user's subscription tier
    // ✅ DRY: Using centralized getUserTier utility with 5-minute caching
    const userTier = await getUserTier(user.id);

    // Get top 100 most popular models from OpenRouter based on scoring algorithm
    // Uses provider quality, popularity patterns, capabilities, context length, recency, and pricing diversity
    // Cached for 24 hours to minimize API calls
    const models = await openRouterModelsService.getTop100Models();

    // ✅ SERVER-COMPUTED TIER ACCESS: Use existing pricing-based tier detection
    // Uses proven model-pricing-tiers.service.ts logic
    const modelsWithTierInfo = models.map((model) => {
      const requiredTier = getRequiredTierForModel(model);
      const requiredTierName = SUBSCRIPTION_TIER_NAMES[requiredTier];
      const isAccessible = canAccessModelByPricing(userTier, model);

      return {
        ...model,
        required_tier: requiredTier,
        required_tier_name: requiredTierName, // ✅ Human-readable tier name
        is_accessible_to_user: isAccessible,
      };
    });

    // ✅ COMPUTE DEFAULT MODEL: Find first accessible model from top 10 for user's tier
    // This is pre-selected on the frontend so users immediately have a model ready to use
    const defaultModelId = await openRouterModelsService.getDefaultModelForTier(userTier);

    // ✅ FLAGSHIP MODELS: Most popular models shown first (separate from tier groups)
    // Following established pattern: separate display preference from access control
    const flagshipModels = getFlagshipModels(models);
    const flagshipModelsWithTierInfo = flagshipModels.map((model) => {
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

    // ✅ TIER GROUPS: Group remaining models by subscription tier
    // Exclude flagship models to avoid duplication in tier groups
    const flagshipModelIds = new Set(flagshipModels.map(m => m.id));
    const nonFlagshipModels = modelsWithTierInfo.filter(m => !flagshipModelIds.has(m.id));

    const tierGroups: TierGroup[] = getTiersInOrder().map((tier) => {
      const tierModels = nonFlagshipModels.filter(m => m.required_tier === tier);
      return {
        tier,
        tier_name: SUBSCRIPTION_TIER_NAMES[tier],
        models: tierModels,
        is_user_tier: tier === userTier,
      };
    }).filter(group => group.models.length > 0); // Only include tiers that have models

    // ✅ COMPUTE USER TIER CONFIG: All limits and metadata for frontend
    const maxModels = getMaxModelsForTier(userTier);
    const tierName = getTierName(userTier);
    const canUpgrade = userTier !== 'power'; // Power tier is the highest

    const userTierConfig = {
      tier: userTier,
      tier_name: tierName,
      max_models: maxModels,
      can_upgrade: canUpgrade,
    };

    return Responses.collection(c, modelsWithTierInfo, {
      total: modelsWithTierInfo.length,
      default_model_id: defaultModelId,
      flagship_models: flagshipModelsWithTierInfo,
      tier_groups: tierGroups,
      user_tier_config: userTierConfig,
    });
  },
);
