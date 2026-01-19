/**
 * Models API Handlers
 *
 * Returns all available models with tier-based access control.
 * Each model includes pricing, capabilities, and user accessibility info.
 *
 * Pattern: Following src/api/routes/{auth,billing}/handler.ts patterns
 */

import type { RouteHandler } from '@hono/zod-openapi';
import { SubscriptionTiers } from '@roundtable/shared/enums';

import { createHandler, Responses } from '@/core';
import { enrichModelWithTierAccessGeneric, getMaxModelsForTier, getTierName } from '@/services/billing';
import { getAllModels } from '@/services/models';
import { getUserTier } from '@/services/usage';
import type { ApiEnv } from '@/types';

import type { listModelsRoute } from './route';
import type { BaseModelResponse } from './schema';

// ============================================================================
// Helper Functions (DRY pattern)
// ============================================================================

/**
 * Convert HardcodedModel to API response format
 * ✅ Returns BaseModelResponse - Zod-inferred type from schema.ts
 */
function toModelForApi(model: ReturnType<typeof getAllModels>[number]): BaseModelResponse {
  return {
    id: model.id,
    name: model.name,
    description: model.description,
    pricing: model.pricing,
    context_length: model.context_length,
    pricing_display: model.pricing_display,
    created: model.created,
    provider: model.provider,
    category: model.category,
    capabilities: model.capabilities,
    is_free: model.is_free,
    supports_vision: model.supports_vision,
    supports_file: model.supports_file,
    is_reasoning_model: model.is_reasoning_model,
    tags: model.tags,
    architecture: model.architecture,
    top_provider: model.top_provider,
    per_request_limits: model.per_request_limits,
  };
}

// ============================================================================
// Handlers
// ============================================================================

/**
 * List all available models with tier-based access control
 *
 * GET /api/v1/models
 *
 * Returns all models from HARDCODED_MODELS with tier access info.
 * Uses subscription tier logic from product-logic.service.ts
 *
 * Returns:
 * - Tier information (required_tier, is_accessible_to_user)
 * - Models sorted by accessibility and price
 * - Default model selection based on user's tier
 * - Client-side caching via TanStack Query
 */
export const listModelsHandler: RouteHandler<typeof listModelsRoute, ApiEnv> = createHandler(
  {
    auth: 'session-optional',
    operationName: 'listModels',
  },
  async (c) => {
    // Get user if authenticated, otherwise null for free tier
    const user = c.var.user || null;

    // ✅ SINGLE SOURCE: Get user's subscription tier from centralized service
    // Cached for 5 minutes per user to reduce database load
    // Default to FREE tier for unauthenticated users
    const userTier = user ? await getUserTier(user.id) : SubscriptionTiers.FREE;

    // ============================================================================
    // ✅ ALL MODELS: Show all available models for user selection
    // ============================================================================
    const allModels = getAllModels();

    // ============================================================================
    // ✅ SERVER-COMPUTED TIER ACCESS: Use existing pricing-based tier detection
    // ============================================================================
    // ✅ DRY: Uses generic enrichment helper that preserves full model type
    // Convert HardcodedModel to API response format before enriching
    const modelsWithTierInfo = allModels.map(model =>
      enrichModelWithTierAccessGeneric(toModelForApi(model), userTier),
    );

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
    const accessibleModel = sortedModels.find(m => m.is_accessible_to_user);
    const firstModel = sortedModels[0];
    const defaultModelId = accessibleModel?.id ?? firstModel?.id ?? '';

    // ============================================================================
    // ✅ USER TIER CONFIG: All limits and metadata for frontend
    // ============================================================================
    // Computed from product-logic.service.ts - single source of truth
    const maxModels = getMaxModelsForTier(userTier);
    const tierName = getTierName(userTier);
    const canUpgrade = userTier !== SubscriptionTiers.PRO;

    const userTierConfig = {
      tier: userTier,
      tier_name: tierName,
      max_models: maxModels,
      can_upgrade: canUpgrade,
      upgrade_message: canUpgrade ? 'Upgrade to Pro for unlimited model access' : null,
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
