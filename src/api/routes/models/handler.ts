/**
 * Models API Handlers
 *
 * ✅ ENVIRONMENT-BASED MODEL SELECTION:
 * - Local dev: FREE models only (:free suffix) - costless for development
 * - Preview/prod: PAID models - ordered by price (cheapest first)
 *
 * ✅ PAID MODELS (preview/prod) - 15 models ordered by price:
 * - Free tier: ≤$0.35/M (8 models - cheap paid models for free users)
 * - Starter: ≤$1.00/M (9 models - +Claude Haiku)
 * - Pro: ≤$3.50/M (14 models - +GPT-4o, Sonnet, flagships) ← MAIN TARGET
 * - Power: Unlimited (15 models - +Claude 3.5 Sonnet)
 *
 * ✅ DEV FREE MODELS (local) - 10 costless models:
 * - Google (2): Gemini 2.0 Flash Exp, Gemma 3 27B
 * - Meta (2): Llama 4 Maverick, Llama 3.3 70B
 * - DeepSeek (2): R1 0528, V3
 * - Mistral (1): Small 3.1
 * - Qwen (2): Qwen3 235B, Qwen 2.5 72B
 * - Microsoft (1): Phi-4
 *
 * Pattern: Following src/api/routes/{auth,billing}/handler.ts patterns
 */

import type { RouteHandler } from '@hono/zod-openapi';

import { createHandler, Responses } from '@/api/core';
import { getAllModels } from '@/api/services/models-config.service';
import { canAccessModelByPricing, getMaxModelsForTier, getRequiredTierForModel, getTierName, SUBSCRIPTION_TIER_NAMES } from '@/api/services/product-logic.service';
import { getUserTier } from '@/api/services/usage-tracking.service';
import type { ApiEnv } from '@/api/types';

import type { listModelsRoute } from './route';

// ============================================================================
// Handlers
// ============================================================================

/**
 * List top 15 curated models with tier-based access control
 *
 * GET /api/v1/models
 *
 * ✅ CURATED APPROACH:
 * - Top 15 models from Dec 2025 OpenRouter rankings
 * - 3 models per major provider (Google, OpenAI, Anthropic, xAI)
 * - 2 from DeepSeek, 1 from Meta
 * - Simplified logic with single source of truth
 *
 * ✅ TEXT & MULTIMODAL: Includes best text and vision models
 * ✅ SOLID PRINCIPLES: Clean separation of concerns
 * Uses existing subscription tier logic from product-logic.service.ts
 *
 * Returns:
 * - Tier information (required_tier, is_accessible_to_user)
 * - Models sorted by accessibility and flagship score
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
    // ✅ CURATED MODEL SELECTION: All 15 models from single source of truth
    // ============================================================================
    const allModels = getAllModels();

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
