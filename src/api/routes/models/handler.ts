/**
 * Models API Handlers
 *
 * ✅ HARDCODED TOP 20 MODELS - SINGLE SOURCE OF TRUTH:
 * - Top 20 models from LLM leaderboards (Oct 2025)
 * - Zod-based enums for type safety
 * - In dev mode: dynamically fetches ALL free models from OpenRouter
 * - Simplified logic with curated model list
 *
 * ✅ TEXT & MULTIMODAL: Includes best models with text/vision capabilities
 * ✅ PRICING TIERS: Balanced distribution with clear upgrade value
 *   - Free: $0.10/M (2 models - Gemini Flash)
 *   - Starter: $0.50/M (6 models - DeepSeek + fast models)
 *   - Pro: $3.00/M (8 models - Claude, GPT-4o, flagships) ← MAIN TARGET
 *   - Power: Unlimited (4 models - GPT-5, Claude Opus, ultra-premium)
 *
 * ✅ DEV MODE: Fetches ALL free models from OpenRouter for testing
 *
 * Pattern: Following src/api/routes/{auth,billing}/handler.ts patterns
 */

import type { RouteHandler } from '@hono/zod-openapi';

import { createHandler, Responses } from '@/api/core';
import { isLocalDevMode } from '@/api/services/model-validation.service';
import { getAllModels } from '@/api/services/models-config.service';
import type { SubscriptionTier } from '@/api/services/product-logic.service';
import { canAccessModelByPricing, getFlagshipScore, getMaxModelsForTier, getRequiredTierForModel, getTierName, SUBSCRIPTION_TIER_NAMES } from '@/api/services/product-logic.service';
import { getUserTier } from '@/api/services/usage-tracking.service';
import type { ApiEnv } from '@/api/types';

import type { listModelsRoute } from './route';

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
    // ✅ HARDCODED MODEL SELECTION: All models from single source of truth
    // ============================================================================
    const isDevMode = isLocalDevMode();

    // Get all hardcoded models including free models for dev mode
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
    // ✅ SIMPLIFIED ORDERING: In dev mode, free models first; otherwise accessible first
    // ============================================================================
    const sortedModels = modelsWithTierInfo.sort((a, b) => {
      // ✅ DEV MODE: Free models (is_free: true) always come first to reduce costs
      if (isDevMode) {
        if (a.is_free !== b.is_free) {
          return a.is_free ? -1 : 1;
        }
      }

      // Accessible models always come before inaccessible
      if (a.is_accessible_to_user !== b.is_accessible_to_user) {
        return a.is_accessible_to_user ? -1 : 1;
      }

      // Within accessible models, sort by flagship score (higher is better)
      if (a.is_accessible_to_user && b.is_accessible_to_user) {
        return getFlagshipScore(b) - getFlagshipScore(a);
      }

      // Within inaccessible models, sort by required tier (lower tier first)
      const tierOrder: SubscriptionTier[] = ['free', 'starter', 'pro', 'power'];
      return tierOrder.indexOf(a.required_tier) - tierOrder.indexOf(b.required_tier);
    });

    // ============================================================================
    // ✅ DEFAULT MODEL: In dev mode use FREE models, otherwise best accessible
    // ============================================================================
    let defaultModelId: string;
    if (isDevMode) {
      // In local dev, prefer FREE models (is_free: true) to eliminate API costs
      // These are actual free-tier models like deepseek-r1:free and llama-3.3:free
      const freeModel = sortedModels.find(m => m.is_free && m.is_accessible_to_user);
      defaultModelId = freeModel?.id || sortedModels.find(m => m.is_accessible_to_user)?.id || sortedModels[0]!.id;
    } else {
      // In preview/prod, use best accessible model (sorted by flagship score)
      defaultModelId = sortedModels.find(m => m.is_accessible_to_user)?.id || sortedModels[0]!.id;
    }

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
    // 3. Server-side: getUserTier (5min cache), OpenRouter models (24h cache)
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
