/**
 * Models API Handlers
 *
 * ✅ HARDCODED TOP 20 MODELS - SINGLE SOURCE OF TRUTH:
 * - Top 20 models from LLM leaderboards (Oct 2025)
 * - Zod-based enums for type safety
 * - NO dynamic OpenRouter API calls
 * - Simplified logic with curated model list
 *
 * ✅ TEXT & MULTIMODAL: Includes best models with text/vision capabilities
 * ✅ PRICING TIERS: Optimized for Pro tier upselling
 *   - Free: $0.05/M (~2-3 models) - VERY LIMITED
 *   - Starter: $0.20/M (~5-6 models)
 *   - Pro: $2.50/M (~15 models) ← MAIN UPSELL TARGET
 *   - Power: Unlimited (all 20 models)
 *
 * Pattern: Following src/api/routes/{auth,billing}/handler.ts patterns
 */

import type { RouteHandler } from '@hono/zod-openapi';

import { createHandler, Responses } from '@/api/core';
import { getAllModels } from '@/api/services/models-config.service';
import { canAccessModelByPricing, getFlagshipScore, getMaxModelsForTier, getRequiredTierForModel, getTierName, getTiersInOrder, SUBSCRIPTION_TIER_NAMES } from '@/api/services/product-logic.service';
import { getUserTier } from '@/api/services/usage-tracking.service';
import type { ApiEnv } from '@/api/types';

import type { listModelsRoute } from './route';
import type { TierGroup } from './schema';

// ============================================================================
// Handlers
// ============================================================================

/**
 * List top 20 hardcoded models with tier-based access control
 *
 * GET /api/v1/models
 *
 * ✅ HARDCODED APPROACH:
 * - Top 20 models from LLM leaderboards (Oct 2025)
 * - Curated selection of best performing models
 * - Provider diversity: Google, OpenAI, Anthropic, xAI, DeepSeek, Qwen, Meta
 * - Simplified logic with single source of truth
 *
 * ✅ TEXT & MULTIMODAL: Includes best text and vision models
 * ✅ SOLID PRINCIPLES: Clean separation of concerns
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
    // ✅ HARDCODED MODEL SELECTION: Top 20 from single source of truth
    // ============================================================================

    // Get all 20 hardcoded models from the single source of truth
    // These are the top-performing models as of October 2025:
    // 1. Gemini 2.5 Pro (#1 on Chatbot Arena)
    // 2. GPT-5 (OpenAI flagship)
    // 3. Claude 4.5 Sonnet (best coding)
    // 4. Grok 4 (xAI)
    // 5. DeepSeek V3 (best open-weight)
    // ... and 15 more top models
    //
    // Benefits:
    // - Simplified, maintainable code
    // - No dynamic API calls or complex filtering
    // - Curated list of proven, high-quality models
    // - Single source of truth with Zod validation
    //
    // Pricing Tiers:
    // - Free: $0.05/M (~2-3 models) - Very limited
    // - Starter: $0.20/M (~5-6 models) - Budget tier
    // - Pro: $2.50/M (~15 models) - Flagship models ← MAIN UPSELL
    // - Power: Unlimited (all 20 models) - Premium
    const enhancedModels = getAllModels();

    // ============================================================================
    // ✅ SERVER-COMPUTED TIER ACCESS: Use existing pricing-based tier detection
    // ============================================================================
    // Uses proven model-pricing logic from product-logic.service.ts

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
    // ✅ DEFAULT MODEL: Select best model for user's tier
    // ============================================================================
    // Priority: highest quality accessible model for user's tier
    const accessibleModels = modelsWithTierInfo.filter(m => m.is_accessible_to_user);
    const defaultModelId = accessibleModels.length > 0
      ? accessibleModels[0]!.id // First model (Gemini 2.5 Pro) or best accessible
      : modelsWithTierInfo[0]!.id; // Fallback to first model (always exists)

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
    // ✅ RETURN RESPONSE: Standard collection response format
    // ============================================================================
    const response = Responses.collection(c, modelsWithTierInfo, {
      total: modelsWithTierInfo.length,
      default_model_id: defaultModelId,
      flagship_models: top10Flagship,
      tier_groups: tierGroups,
      user_tier_config: userTierConfig,
    });

    // ✅ NO EDGE CACHING: Models endpoint returns user-specific data (tier-based access)
    // User A (free tier) and User B (pro tier) get different `is_accessible_to_user` values
    // Cloudflare edge cache would serve stale data to wrong users after subscription changes
    // Instead, rely on:
    // - Backend Drizzle ORM caching (getUserTier cached 5 min per user)
    // - OpenRouter service caching (24h model list cache)
    // - Client-side TanStack Query caching (staleTime: Infinity with invalidation)
    // Cache is invalidated via query invalidation on subscription changes (checkout.ts, subscription-management.ts)
    response.headers.set('Cache-Control', 'private, no-cache, must-revalidate');

    return response;
  },
);
