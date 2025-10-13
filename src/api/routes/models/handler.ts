/**
 * Models API Handlers
 *
 * Business logic for dynamic OpenRouter models endpoints
 * ✅ PATTERN: Following src/api/routes/{auth,billing}/handler.ts patterns
 */

import type { RouteHandler } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';

import { ErrorContextBuilders } from '@/api/common/error-contexts';
import { createError } from '@/api/common/error-handling';
import { createHandler, Responses } from '@/api/core';
import { openRouterModelsService } from '@/api/services/openrouter-models.service';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import type { SubscriptionTier } from '@/db/config/subscription-tiers';
import * as tables from '@/db/schema';

import type {
  clearCacheRoute,
  getModelRoute,
  listModelsRoute,
  listProvidersRoute,
} from './route';
import { ListModelsQuerySchema, ModelIdParamSchema } from './schema';

// ============================================================================
// Handlers
// ============================================================================

/**
 * List all models with optional filters
 * ✅ SINGLE SOURCE OF TRUTH: All tier grouping and access control computed on backend
 *
 * GET /api/v1/models
 * ✅ PATTERN: Using validateQuery for type-safe query parsing
 * ✅ PATTERN: Explicit RouteHandler type annotation following auth/billing patterns
 */
export const listModelsHandler: RouteHandler<typeof listModelsRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateQuery: ListModelsQuerySchema,
    operationName: 'listModels',
  },
  async (c) => {
    // ✅ PATTERN: Use c.get('user') not c.var.user
    const user = c.get('user');
    if (!user) {
      throw createError.unauthenticated('Authentication required', ErrorContextBuilders.auth('listModels'));
    }

    c.logger.info('Fetching OpenRouter models', {
      logType: 'operation',
      operationName: 'listModels',
      userId: user.id,
    });

    // Get user's subscription tier
    const db = await getDbAsync();
    const usage = await db.query.userChatUsage.findFirst({
      where: eq(tables.userChatUsage.userId, user.id),
    });

    // Default to free tier if no usage record exists
    const userTier: SubscriptionTier = usage?.subscriptionTier || 'free';

    c.logger.info(`User subscription tier: ${userTier}`, {
      logType: 'operation',
      operationName: 'listModels',
      userId: user.id,
    });

    // ✅ PATTERN: Use validated query from c.validated.query (type-safe, no manual parsing)
    const query = c.validated.query;

    // Get top 50 most popular models from OpenRouter based on scoring algorithm
    // Uses provider quality, popularity patterns, capabilities, context length, recency, and pricing diversity
    // Cached for 24 hours to minimize API calls
    let models = await openRouterModelsService.getTop50Models();

    c.logger.info(`Dynamically selected top ${models.length} models from OpenRouter`, {
      logType: 'operation',
      operationName: 'listModels',
    });

    // Apply additional user filters AFTER restricting to top 50
    if (query.provider) {
      models = models.filter(m => m.provider.toLowerCase() === query.provider!.toLowerCase());
    }

    if (query.category) {
      models = models.filter(m => m.category === query.category);
    }

    if (query.freeOnly) {
      models = models.filter(m => m.is_free);
    }

    if (query.search) {
      const searchLower = query.search.toLowerCase();
      models = models.filter(
        m =>
          m.name.toLowerCase().includes(searchLower)
          || m.id.toLowerCase().includes(searchLower)
          || m.description?.toLowerCase().includes(searchLower),
      );
    }

    if (query.supportsVision) {
      models = models.filter(m => m.supports_vision);
    }

    // ✅ SERVER-COMPUTED TIER ACCESS: Compute required tier and accessibility for each model
    const modelsWithTierInfo = models.map((model) => {
      const requiredTier = openRouterModelsService.getRequiredTierForModel(model);
      const isAccessible = openRouterModelsService.canUserAccessModel(userTier, model);

      return {
        ...model,
        required_tier: requiredTier,
        is_accessible_to_user: isAccessible,
      };
    });

    // ✅ MOST POPULAR MODELS GROUP: Take top 10 from dynamically selected models
    // These are the highest-scoring models based on provider quality, popularity, capabilities, and recency
    const popularModels = modelsWithTierInfo.slice(0, 10);

    const popularGroup = popularModels.length > 0
      ? {
          group_name: 'Most Popular',
          models: popularModels,
          model_count: popularModels.length,
        }
      : undefined;

    // Create a Set of popular model IDs to exclude them from tier groups
    // ✅ PATTERN: No type assertions - let TypeScript infer from Zod schemas
    const popularModelIds = new Set(popularModels.map(m => m.id));

    // ✅ SERVER-COMPUTED TIER GROUPING: Group models by their required tier (excluding popular models)
    // Import tier utilities from single source of truth
    const { getTiersInOrder, getTierName, getTierConfig } = await import('@/db/config/subscription-tiers');

    const tierGroups = getTiersInOrder().map((tier) => {
      const tieredModels = modelsWithTierInfo
        .filter(m => m.required_tier === tier && !popularModelIds.has(m.id)) // ✅ Exclude popular models
        .sort((a, b) => {
          // Sort by pricing: cheapest input pricing first (ascending order)
          const aPricing = Number.parseFloat(a.pricing.prompt);
          const bPricing = Number.parseFloat(b.pricing.prompt);

          // If pricing is the same, sort by name
          if (aPricing === bPricing) {
            return a.name.localeCompare(b.name);
          }

          return aPricing - bPricing;
        });

      return {
        tier,
        tier_name: getTierName(tier),
        is_user_tier: tier === userTier,
        models: tieredModels,
        model_count: tieredModels.length,
      };
    }).filter(group => group.model_count > 0); // Only include non-empty groups

    // ✅ SERVER-COMPUTED USER TIER INFO: Include user's current tier and limits
    const userTierConfig = getTierConfig(userTier);

    const userTierInfo = {
      current_tier: userTier,
      tier_name: getTierName(userTier),
      max_models: userTierConfig.maxModels,
      can_upgrade: userTier !== 'power',
    };

    // ✅ COMPUTE DEFAULT MODEL: Find first accessible model from top 10 for user's tier
    // This is pre-selected on the frontend so users immediately have a model ready to use
    const defaultModel = popularModels.find(m => m.is_accessible_to_user);
    const defaultModelId = defaultModel?.id || popularModels[0]?.id || 'anthropic/claude-3-haiku';

    c.logger.info(`Default model selected for user tier (${userTier}): ${defaultModelId}`, {
      logType: 'operation',
      operationName: 'listModels',
      resource: defaultModelId,
    });

    // Optionally filter to accessible models only (backward compatibility)
    // ✅ PATTERN: No type assertions - TypeScript infers from schema
    const finalModels = query.includeAll
      ? modelsWithTierInfo
      : modelsWithTierInfo.filter(m => m.is_accessible_to_user);

    const payload = {
      models: finalModels,
      total: finalModels.length,
      default_model_id: defaultModelId, // ✅ Include default model (computed on backend)
      popular_group: popularGroup, // ✅ Include popular group (optional, may be undefined)
      tier_groups: tierGroups,
      user_tier_info: userTierInfo,
      filters: {
        provider: query.provider,
        category: query.category,
        freeOnly: query.freeOnly,
        search: query.search,
        supportsVision: query.supportsVision,
        includeAll: query.includeAll,
      },
    };

    c.logger.info(`OpenRouter models fetched successfully: ${finalModels.length} models in ${tierGroups.length} tier groups`, {
      logType: 'operation',
      operationName: 'listModels',
      resource: `${finalModels.length}-models`,
    });

    return Responses.ok(c, payload);
  },
);

/**
 * Get a specific model by ID
 *
 * GET /api/v1/models/:modelId
 * ✅ PATTERN: Using validateParams for type-safe param parsing
 * ✅ PATTERN: Explicit RouteHandler type annotation following auth/billing patterns
 */
export const getModelHandler: RouteHandler<typeof getModelRoute, ApiEnv> = createHandler(
  {
    auth: 'public',
    validateParams: ModelIdParamSchema,
    operationName: 'getModel',
  },
  async (c) => {
    // ✅ PATTERN: Use validated params from c.validated.params
    const { modelId } = c.validated.params;

    // URL decode the model ID (e.g., "anthropic%2Fclaude-4" -> "anthropic/claude-4")
    const decodedModelId = decodeURIComponent(modelId);

    c.logger.info('Fetching specific OpenRouter model', {
      logType: 'operation',
      operationName: 'getModel',
      resource: decodedModelId,
    });

    const model = await openRouterModelsService.getModelById(decodedModelId);

    if (!model) {
      c.logger.warn('Model not found in OpenRouter', {
        logType: 'operation',
        operationName: 'getModel',
        resource: decodedModelId,
      });

      // ✅ PATTERN: Use structured error contexts
      throw createError.notFound(
        `Model ${decodedModelId} not found in OpenRouter`,
        ErrorContextBuilders.resourceNotFound('model', decodedModelId),
      );
    }

    c.logger.info('Model fetched successfully', {
      logType: 'operation',
      operationName: 'getModel',
      resource: decodedModelId,
    });

    return Responses.ok(c, { model });
  },
);

/**
 * List all available providers with model counts
 *
 * GET /api/v1/models/providers
 * ✅ PATTERN: Following established handler patterns
 * ✅ PATTERN: Explicit RouteHandler type annotation following auth/billing patterns
 */
export const listProvidersHandler: RouteHandler<typeof listProvidersRoute, ApiEnv> = createHandler(
  {
    auth: 'public',
    operationName: 'listProviders',
  },
  async (c) => {
    c.logger.info('Fetching OpenRouter providers', {
      logType: 'operation',
      operationName: 'listProviders',
    });

    const models = await openRouterModelsService.fetchAllModels();

    // Count models per provider
    const providerCounts = new Map<string, number>();
    for (const model of models) {
      const count = providerCounts.get(model.provider) || 0;
      providerCounts.set(model.provider, count + 1);
    }

    // Convert to array and sort by count
    const providers = Array.from(providerCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    c.logger.info('Providers fetched successfully', {
      logType: 'operation',
      operationName: 'listProviders',
      resource: `${providers.length}-providers`,
    });

    return Responses.ok(c, { providers });
  },
);

/**
 * Clear models cache
 *
 * POST /api/v1/models/cache/clear
 * ✅ PATTERN: Following established handler patterns
 * ✅ PATTERN: Explicit RouteHandler type annotation following auth/billing patterns
 */
export const clearCacheHandler: RouteHandler<typeof clearCacheRoute, ApiEnv> = createHandler(
  {
    auth: 'public',
    operationName: 'clearModelsCache',
  },
  async (c) => {
    c.logger.info('Clearing OpenRouter models cache', {
      logType: 'operation',
      operationName: 'clearModelsCache',
    });

    openRouterModelsService.clearCache();

    c.logger.info('Models cache cleared successfully', {
      logType: 'operation',
      operationName: 'clearModelsCache',
    });

    return Responses.ok(c, { cleared: true });
  },
);
