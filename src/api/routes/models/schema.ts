/**
 * Models API Schemas
 *
 * Type-safe request/response schemas for dynamic OpenRouter models endpoints
 */

import { z } from 'zod';

import { createApiResponseSchema } from '@/api/core/schemas';

// ============================================================================
// Request Schemas
// ============================================================================

/**
 * Query params for listing models with filters
 * ✅ PATTERN: Transform query string booleans to actual booleans
 */
export const ListModelsQuerySchema = z.object({
  provider: z.string().optional().openapi({
    description: 'Filter by provider name (e.g., anthropic, openai)',
    example: 'anthropic',
  }),
  category: z.enum(['reasoning', 'general', 'creative', 'research']).optional().openapi({
    description: 'Filter by model category',
    example: 'reasoning',
  }),
  freeOnly: z
    .string()
    .optional()
    .transform(val => val === 'true')
    .openapi({
      description: 'Show only free models',
      example: 'false',
    }),
  search: z.string().optional().openapi({
    description: 'Search models by name, ID, or description',
    example: 'claude',
  }),
  supportsVision: z
    .string()
    .optional()
    .transform(val => val === 'true')
    .openapi({
      description: 'Filter models that support vision capabilities',
      example: 'false',
    }),
  includeAll: z
    .string()
    .optional()
    .transform(val => val === 'true')
    .openapi({
      description: 'Include models not accessible to user (for tier comparison)',
      example: 'false',
    }),
}).openapi('ListModelsQuery');

export type ListModelsQuery = z.infer<typeof ListModelsQuerySchema>;

/**
 * Model ID param schema
 * ✅ PATTERN: All param schemas in schema.ts, not inline in route.ts
 */
export const ModelIdParamSchema = z.object({
  modelId: z.string().min(1).openapi({
    param: {
      name: 'modelId',
      in: 'path',
    },
    example: 'anthropic%2Fclaude-sonnet-4.5',
    description: 'URL-encoded model ID from OpenRouter (e.g., anthropic/claude-4 becomes anthropic%2Fclaude-4)',
  }),
}).openapi('ModelIdParam');

export type ModelIdParam = z.infer<typeof ModelIdParamSchema>;

// ============================================================================
// Response Schemas
// ============================================================================

/**
 * Base OpenRouter Model Schema (without tier access info)
 * Used for public endpoints and by services
 */
export const BaseModelSchema = z.object({
  // Core OpenRouter fields
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  context_length: z.number(),
  created: z.number().optional(), // Unix timestamp for model creation date (used for recency scoring)
  pricing: z.object({
    prompt: z.string(),
    completion: z.string(),
  }),
  top_provider: z
    .object({
      context_length: z.number().nullable().optional(),
      max_completion_tokens: z.number().nullable().optional(),
      is_moderated: z.boolean().nullable().optional(),
    })
    .nullable()
    .optional(),
  per_request_limits: z
    .object({
      prompt_tokens: z.number().nullable().optional(),
      completion_tokens: z.number().nullable().optional(),
    })
    .nullable()
    .optional(),
  architecture: z
    .object({
      modality: z.string().nullable().optional(),
      tokenizer: z.string().nullable().optional(),
      instruct_type: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),

  // Enhanced fields
  provider: z.string(),
  category: z.enum(['reasoning', 'general', 'creative', 'research']),
  capabilities: z.object({
    vision: z.boolean(),
    reasoning: z.boolean(),
    streaming: z.boolean(),
    tools: z.boolean(),
  }),
  pricing_display: z.object({
    input: z.string(),
    output: z.string(),
  }),
  is_free: z.boolean(),
  supports_vision: z.boolean(),
  is_reasoning_model: z.boolean(),
});

export type BaseModelResponse = z.infer<typeof BaseModelSchema>;

/**
 * Enhanced OpenRouter Model Schema with server-computed tier access
 * ✅ PATTERN: Extends base schema with authentication-specific fields
 * Used for authenticated endpoints where user tier context is available
 */
export const EnhancedModelSchema = BaseModelSchema.extend({
  // ✅ SERVER-COMPUTED TIER ACCESS (Single Source of Truth)
  required_tier: z.enum(['free', 'starter', 'pro', 'power']),
  is_accessible_to_user: z.boolean(),
});

export type EnhancedModelResponse = z.infer<typeof EnhancedModelSchema>;

/**
 * Tier group schema - models grouped by subscription tier
 */
export const TierGroupSchema = z.object({
  tier: z.enum(['free', 'starter', 'pro', 'power']),
  tier_name: z.string(),
  is_user_tier: z.boolean(),
  models: z.array(EnhancedModelSchema),
  model_count: z.number(),
});

export type TierGroup = z.infer<typeof TierGroupSchema>;

/**
 * Popular group schema - most popular models regardless of tier
 */
export const PopularGroupSchema = z.object({
  group_name: z.string(),
  models: z.array(EnhancedModelSchema),
  model_count: z.number(),
});

export type PopularGroup = z.infer<typeof PopularGroupSchema>;

/**
 * User tier info schema
 */
export const UserTierInfoSchema = z.object({
  current_tier: z.enum(['free', 'starter', 'pro', 'power']),
  tier_name: z.string(),
  max_models: z.number(),
  can_upgrade: z.boolean(),
});

export type UserTierInfo = z.infer<typeof UserTierInfoSchema>;

/**
 * List models response schema with server-computed tier grouping
 */
export const ListModelsResponseSchema = createApiResponseSchema(
  z.object({
    models: z.array(EnhancedModelSchema),
    total: z.number(),
    // ✅ DEFAULT MODEL FOR USER'S TIER (computed on backend, pre-selected on frontend)
    default_model_id: z.string(),
    // ✅ MOST POPULAR MODELS GROUP (appears first, includes models from all tiers)
    popular_group: PopularGroupSchema.optional(),
    // ✅ SERVER-COMPUTED TIER GROUPING (Single Source of Truth)
    tier_groups: z.array(TierGroupSchema),
    user_tier_info: UserTierInfoSchema,
    filters: z.object({
      provider: z.string().optional(),
      category: z.enum(['reasoning', 'general', 'creative', 'research']).optional(),
      freeOnly: z.boolean().optional(),
      search: z.string().optional(),
      supportsVision: z.boolean().optional(),
      includeAll: z.boolean().optional(),
    }),
  }),
);

export type ListModelsResponse = z.infer<typeof ListModelsResponseSchema>;

/**
 * Single model response schema (public endpoint - no tier info)
 * ✅ PATTERN: Public endpoints use base schema without tier access info
 */
export const GetModelResponseSchema = createApiResponseSchema(
  z.object({
    model: BaseModelSchema,
  }),
);

export type GetModelResponse = z.infer<typeof GetModelResponseSchema>;

/**
 * Model providers response schema
 */
export const ListProvidersResponseSchema = createApiResponseSchema(
  z.object({
    providers: z.array(
      z.object({
        name: z.string(),
        count: z.number(),
      }),
    ),
  }),
);

export type ListProvidersResponse = z.infer<typeof ListProvidersResponseSchema>;

/**
 * Clear cache response schema
 */
export const ClearCacheResponseSchema = createApiResponseSchema(
  z.object({
    cleared: z.boolean().openapi({
      description: 'Whether cache was cleared successfully',
      example: true,
    }),
  }),
);

export type ClearCacheResponse = z.infer<typeof ClearCacheResponseSchema>;
