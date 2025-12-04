/**
 * Models API Handlers
 *
 * ✅ USER-FACING MODELS: Curated 6 best multimodal models for UI selection
 * - Gemini 2.5 Flash ($0.30/M) - Fast, affordable multimodal
 * - Gemini 2.5 Pro ($1.25/M) - #1 on LMArena, flagship
 * - GPT-5.1 ($1.25/M) - OpenAI latest flagship, multimodal
 * - Gemini 3 Pro Preview ($2/M) - Gemini 3 flagship (preview)
 * - Claude Sonnet 4.5 ($3/M) - Agent-optimized, 1M context
 * - Claude Opus 4.5 ($5/M) - 80.9% SWE-bench, best reasoning
 *
 * Pattern: Following src/api/routes/{auth,billing}/handler.ts patterns
 */

import type { RouteHandler } from '@hono/zod-openapi';

import { createHandler, Responses } from '@/api/core';
import { getUserFacingModels } from '@/api/services/models-config.service';
import { canAccessModelByPricing, getMaxModelsForTier, getRequiredTierForModel, getTierName, SUBSCRIPTION_TIER_NAMES } from '@/api/services/product-logic.service';
import { getUserTier } from '@/api/services/usage-tracking.service';
import type { ApiEnv } from '@/api/types';

import type { listModelsRoute } from './route';

// ============================================================================
// Handlers
// ============================================================================

/**
 * List curated 6 best multimodal models with tier-based access control
 *
 * GET /api/v1/models
 *
 * ✅ USER-FACING APPROACH:
 * - 6 best multimodal models for perfect results
 * - Google (3): Gemini 2.5 Flash, Pro, 3 Pro Preview
 * - OpenAI (1): GPT-5.1
 * - Anthropic (2): Claude Sonnet 4.5, Opus 4.5
 *
 * ✅ MULTIMODAL FOCUS: All models support vision + text
 * Uses existing subscription tier logic from product-logic.service.ts
 *
 * Returns:
 * - Tier information (required_tier, is_accessible_to_user)
 * - Models sorted by accessibility and price
 * - Default model selection based on user's tier
 * - Client-side caching via TanStack Query
 */
export const listModelsHandler: RouteHandler<typeof listModelsRoute, ApiEnv> = createHandler(
  {
    auth: 'public',
    operationName: 'listModels',
  },
  async (c) => {
    // Get user if authenticated, otherwise null for free tier
    const user = c.var.user || null;

    // ✅ SINGLE SOURCE: Get user's subscription tier from centralized service
    // Cached for 5 minutes per user to reduce database load
    // Default to 'free' tier for unauthenticated users
    const userTier = user ? await getUserTier(user.id) : 'free';

    // ============================================================================
    // ✅ USER-FACING MODELS: Curated 6 best multimodal models for UI selection
    // ============================================================================
    const allModels = getUserFacingModels();

    // ============================================================================
    // ✅ SERVER-COMPUTED TIER ACCESS: Use existing pricing-based tier detection
    // ============================================================================
    // Uses proven model-pricing logic from product-logic.service.ts

    const modelsWithTierInfo = allModels.map((model) => {
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
    // ✅ ORDERING: Accessible first, then by price (cheapest first)
    // ============================================================================
    const sortedModels = modelsWithTierInfo.sort((a, b) => {
      // Accessible models always come before inaccessible
      if (a.is_accessible_to_user !== b.is_accessible_to_user) {
        return a.is_accessible_to_user ? -1 : 1;
      }

      // Within both groups, sort by input price (cheapest first)
      const priceA = Number.parseFloat(a.pricing.prompt);
      const priceB = Number.parseFloat(b.pricing.prompt);
      return priceA - priceB;
    });

    // ============================================================================
    // ✅ DEFAULT MODEL: First accessible model (cheapest)
    // ============================================================================
    const defaultModelId = sortedModels.find(m => m.is_accessible_to_user)?.id || sortedModels[0]!.id;

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
    // ✅ RETURN RESPONSE: Simplified single sorted list
    // ============================================================================
    const response = Responses.collection(c, sortedModels, {
      total: sortedModels.length,
      default_model_id: defaultModelId,
      user_tier_config: userTierConfig,
    });

    // ✅ AGGRESSIVE CACHING: Models data rarely changes, use long cache times
    // Strategy:
    // 1. HTTP Cache: 1 hour client cache, 24 hours CDN cache
    // 2. Vary by auth state (Cookie header) to serve different versions
    // 3. Server-side: getUserTier (5min cache)
    // 4. Client-side: TanStack Query (staleTime: Infinity with manual invalidation)
    //
    // Cache invalidation triggers:
    // - Subscription changes → TanStack Query invalidation (checkout.ts, subscription-management.ts)
    // - New model deployments → Manual cache clear or wait for TTL
    //
    // Security: Vary header ensures auth/unauth users get correct cached versions
    response.headers.set('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600');
    response.headers.set('Vary', 'Cookie'); // Cache different versions for auth state
    response.headers.set('CDN-Cache-Control', 'max-age=86400'); // 24h Cloudflare cache

    return response;
  },
);
