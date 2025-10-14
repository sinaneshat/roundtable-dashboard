/**
 * Models API Handlers
 *
 * Handler for OpenRouter models endpoint with tier-based access control
 * ✅ PATTERN: Following src/api/routes/{auth,billing}/handler.ts patterns
 */

import type { RouteHandler } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';

import { ErrorContextBuilders } from '@/api/common/error-contexts';
import { createError } from '@/api/common/error-handling';
import { createHandler, Responses } from '@/api/core';
import { openRouterModelsService } from '@/api/services/openrouter-models.service';
import type { SubscriptionTier } from '@/api/services/product-logic.service';
import { canAccessModelByPricing, getMaxModelsForTier, getRequiredTierForModel, getTierName, getTiersInOrder, SUBSCRIPTION_TIER_NAMES, SUBSCRIPTION_TIERS } from '@/api/services/product-logic.service';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import * as tables from '@/db/schema';

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
    // ✅ PATTERN: Use c.get('user') not c.var.user
    const user = c.get('user');
    if (!user) {
      throw createError.unauthenticated('Authentication required', ErrorContextBuilders.auth('listModels'));
    }

    c.logger.info('Fetching top 50 OpenRouter models with tier access', {
      logType: 'operation',
      operationName: 'listModels',
      userId: user.id,
    });

    // Get user's subscription tier
    // ✅ CACHING ENABLED: Query builder API with 5-minute TTL for user tier lookup
    // Subscription tier changes infrequently (only on plan upgrades/downgrades)
    // Cache automatically invalidates when userChatUsage is updated
    // @see https://orm.drizzle.team/docs/cache
    const db = await getDbAsync();
    const usageResults = await db
      .select()
      .from(tables.userChatUsage)
      .where(eq(tables.userChatUsage.userId, user.id))
      .limit(1)
      .$withCache({
        config: { ex: 300 }, // 5 minutes - tier data stable
        tag: `user-tier-${user.id}`,
      });

    const usage = usageResults[0];

    // Default to free tier if no usage record exists
    const userTier: SubscriptionTier = usage?.subscriptionTier || SUBSCRIPTION_TIERS[0];

    c.logger.info(`User subscription tier: ${userTier}`, {
      logType: 'operation',
      operationName: 'listModels',
      userId: user.id,
    });

    // Get top 100 most popular models from OpenRouter based on scoring algorithm
    // Uses provider quality, popularity patterns, capabilities, context length, recency, and pricing diversity
    // Cached for 24 hours to minimize API calls
    const models = await openRouterModelsService.getTop100Models();

    c.logger.info(`Dynamically selected top ${models.length} models from OpenRouter`, {
      logType: 'operation',
      operationName: 'listModels',
    });

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

    c.logger.info(`Default model selected for user tier (${userTier}): ${defaultModelId}`, {
      logType: 'operation',
      operationName: 'listModels',
      resource: defaultModelId,
    });

    // ✅ COMPUTE TIER GROUPS: Group models by required tier for UI display
    const tierGroups: TierGroup[] = getTiersInOrder().map((tier) => {
      const tierModels = modelsWithTierInfo.filter(m => m.required_tier === tier);
      return {
        tier,
        tier_name: SUBSCRIPTION_TIER_NAMES[tier],
        models: tierModels,
        is_user_tier: tier === userTier,
      };
    }).filter(group => group.models.length > 0); // Only include tiers that have models

    c.logger.info(`Models grouped into ${tierGroups.length} tiers`, {
      logType: 'operation',
      operationName: 'listModels',
      resource: 'tier-groups',
    });

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

    c.logger.info(`User tier config computed: ${tierName} (max ${maxModels} models)`, {
      logType: 'operation',
      operationName: 'listModels',
      resource: 'user-tier-config',
    });

    c.logger.info(`OpenRouter models fetched successfully: ${modelsWithTierInfo.length} models`, {
      logType: 'operation',
      operationName: 'listModels',
      resource: `${modelsWithTierInfo.length}-models`,
    });

    return Responses.collection(c, modelsWithTierInfo, {
      total: modelsWithTierInfo.length,
      default_model_id: defaultModelId,
      tier_groups: tierGroups,
      user_tier_config: userTierConfig,
    });
  },
);
