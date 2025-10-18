/**
 * Models API Handlers
 *
 * ✅ 100% DYNAMIC ARCHITECTURE WITH PROVIDER DIVERSITY:
 * - 250 top models selected by quality scoring (NO hard-coded providers)
 * - Max 5 models per provider (ensures diversity across OpenAI, Anthropic, Google, etc.)
 * - Scoring based on: context length, recency, capabilities, pricing tier
 * - Fully adaptive to new models and providers from OpenRouter
 * - Uses ONLY OpenRouter API data fields (no pattern matching)
 *
 * ✅ TEXT-CAPABLE: Includes text and multimodal models (excludes pure image/audio/video generation)
 * ✅ PAID MODELS ONLY: Excludes OpenRouter free tier (pricing = "0")
 * ✅ AGGRESSIVE PRICING TIERS: Optimized for Pro tier upselling
 *   - Free: $0.05/M (~15 models) - VERY LIMITED
 *   - Starter: $0.20/M (~35 models)
 *   - Pro: $2.50/M (~180 models) ← MAIN UPSELL TARGET
 *   - Power: Unlimited (~250 models)
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
 * List top 50 dynamically fetched models with tier-based access control
 *
 * GET /api/v1/models
 *
 * ✅ REFACTORED ALGORITHM:
 * - Top 5 models from each major provider (Anthropic, OpenAI, Google, DeepSeek, etc.)
 * - Limited to 50 total models across all providers
 * - Provider diversity ensures users see best options from each ecosystem
 * - Models scored within provider by: context length, recency, capabilities
 *
 * ✅ TEXT-ONLY: Automatically filters to text/chat models (no audio/image/video/reasoning)
 * ✅ SOLID PRINCIPLES: Clean separation of concerns, single responsibility
 * Uses existing subscription tier logic from product-logic.service.ts
 *
 * Returns:
 * - Tier information (required_tier, is_accessible_to_user)
 * - Top 10 flagship models in separate section
 * - Models grouped by subscription tier (Free, Starter, Pro, Power)
 * - Default model selection based on user's tier
 * - Client-side caching via TanStack Query
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
    // ✅ 100% DYNAMIC MODEL SELECTION: Top 250 with provider diversity
    // ============================================================================

    // FULLY DYNAMIC ALGORITHM (no hard-coded providers or model names):
    // 1. Fetch all paid, text-capable models from OpenRouter API
    // 2. Score each model based on:
    //    - Context length (35 points)
    //    - Recency (25 points)
    //    - Capabilities from API (20 points)
    //    - Pricing tier (20 points)
    // 3. Sort by score and apply provider diversity (max 5 per provider)
    // 4. Return top 250 models total
    //
    // Benefits:
    // - Automatically adapts to new models and providers
    // - Uses only OpenRouter API data fields
    // - No pattern matching or hard-coded preferences
    // - Provider diversity: Max 5 models from any provider
    // - Ensures coverage across all pricing tiers
    //
    // Filtering:
    // - Text-capable: Uses architecture.modality from API (output must be pure "text")
    // - Paid only: Excludes models with pricing = "0" (OpenRouter free tier)
    //
    // Pricing Tiers (AGGRESSIVE UPSELLING):
    // - Free: $0.05/M (~15 models) - Very limited for testing
    // - Starter: $0.20/M (~35 models) - Budget tier
    // - Pro: $2.50/M (~180 models) - Flagship models ← MAIN UPSELL
    // - Power: Unlimited (~250 models) - All ultra-premium
    //
    // TanStack Query handles client-side caching
    const enhancedModels = await openRouterModelsService.getTopModelsAcrossProviders();

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
    // ✅ FLAGSHIP MODELS: Top 10 most popular with max 2 per provider
    // ============================================================================
    // Ensures provider diversity in "Most Popular" section
    // Algorithm:
    // 1. Filter models with flagship score >= 70
    // 2. Group by provider
    // 3. Take max 2 highest-scored models from each provider
    // 4. Sort all selected models by score
    // 5. Take top 10 overall
    const flagshipCandidates = modelsWithTierInfo.filter(m => getFlagshipScore(m) >= 70);

    // Sort by flagship score first
    flagshipCandidates.sort((a, b) => {
      const scoreA = getFlagshipScore(a);
      const scoreB = getFlagshipScore(b);
      return scoreB - scoreA;
    });

    // Group by provider and take max 2 from each
    const modelsByProvider = new Map<string, typeof modelsWithTierInfo>();

    for (const model of flagshipCandidates) {
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
    const diverseFlagshipModels: typeof modelsWithTierInfo = [];
    for (const providerModels of modelsByProvider.values()) {
      diverseFlagshipModels.push(...providerModels);
    }

    diverseFlagshipModels.sort((a, b) => {
      const scoreA = getFlagshipScore(a);
      const scoreB = getFlagshipScore(b);
      return scoreB - scoreA;
    });

    // Limit to top 10 flagship models (max 2 per provider)
    const top10Flagship = diverseFlagshipModels.slice(0, 10);

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
    // ✅ RETURN RESPONSE: Standard collection response format with cache headers
    // ============================================================================
    const response = Responses.collection(c, modelsWithTierInfo, {
      total: modelsWithTierInfo.length,
      default_model_id: defaultModelId,
      flagship_models: top10Flagship,
      tier_groups: tierGroups,
      user_tier_config: userTierConfig,
    });

    // ✅ CLOUDFLARE CACHE HEADERS: Enable edge caching and provide cache tag for invalidation
    // Cache for 1 hour with revalidation, allow stale content for 24 hours while revalidating
    // Cache tag 'models' allows purging all model data when needed via Cloudflare API
    response.headers.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    response.headers.set('Cache-Tag', 'models');

    return response;
  },
);
