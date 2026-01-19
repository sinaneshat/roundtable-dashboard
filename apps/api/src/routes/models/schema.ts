/**
 * Models API Schemas
 *
 * Simplified schemas for OpenRouter models endpoint
 */

import { z } from '@hono/zod-openapi';
import { ModelCapabilityTagSchema, ModelCategorySchema, SubscriptionTierSchema } from '@roundtable/shared/enums';

import { createApiResponseSchema } from '@/core/schemas';

// ============================================================================
// Response Schemas
// ============================================================================

/**
 * ✅ RAW OPENROUTER API RESPONSE SCHEMA
 * This schema validates the raw response from OpenRouter API before enhancement
 * The enhanced fields (provider, category, capabilities, etc.) are added by enhanceModel()
 *
 * ✅ PATTERN: Schemas defined in schema.ts, not in service files
 * Reference: backend-patterns.md - Service files should import schemas, not define them
 */
export const RawOpenRouterModelSchema = z.object({
  // Core OpenRouter fields
  id: z.string().openapi({
    description: 'OpenRouter model ID (e.g., anthropic/claude-4)',
    example: 'anthropic/claude-sonnet-4.5',
  }),
  name: z.string().openapi({
    description: 'Human-readable model name',
    example: 'Claude Sonnet 4.5',
  }),
  description: z.string().optional().openapi({
    description: 'Model description from OpenRouter',
    example: 'Anthropic\'s most powerful model for complex tasks',
  }),
  context_length: z.number().openapi({
    description: 'Maximum context window in tokens',
    example: 200000,
  }),
  created: z.number().optional().openapi({
    description: 'Unix timestamp for model creation date',
    example: 1704067200,
  }),
  pricing: z.object({
    prompt: z.string().openapi({
      description: 'Price per input token',
      example: '0.000003',
    }),
    completion: z.string().openapi({
      description: 'Price per output token',
      example: '0.000015',
    }),
  }).openapi({
    description: 'Pricing information from OpenRouter',
  }),
  top_provider: z
    .object({
      context_length: z.number().nullable().optional(),
      max_completion_tokens: z.number().nullable().optional(),
      is_moderated: z.boolean().nullable().optional(),
    })
    .nullable()
    .optional()
    .openapi({
      description: 'Top provider metadata',
    }),
  per_request_limits: z
    .object({
      prompt_tokens: z.number().nullable().optional(),
      completion_tokens: z.number().nullable().optional(),
    })
    .nullable()
    .optional()
    .openapi({
      description: 'Per-request token limits',
    }),
  architecture: z
    .object({
      modality: z.string().nullable().optional(),
      tokenizer: z.string().nullable().optional(),
      instruct_type: z.string().nullable().optional(),
    })
    .nullable()
    .optional()
    .openapi({
      description: 'Model architecture metadata',
    }),
}).openapi('RawOpenRouterModel');

export type RawOpenRouterModel = z.infer<typeof RawOpenRouterModelSchema>;

/**
 * OpenRouter API Response Schema - wraps the raw model schema
 * Used for validating the complete API response from OpenRouter
 *
 * ✅ PATTERN: API response wrappers defined in schema.ts
 */
export const OpenRouterModelsResponseSchema = z.object({
  data: z.array(RawOpenRouterModelSchema).openapi({
    description: 'Array of models from OpenRouter API',
  }),
}).openapi('OpenRouterModelsResponse');

export type OpenRouterModelsResponse = z.infer<typeof OpenRouterModelsResponseSchema>;

/**
 * Base OpenRouter Model Schema (without tier access info)
 * ✅ REUSE: Extends RawOpenRouterModelSchema with computed enhancement fields
 * Used for public endpoints and by services
 * This is the ENHANCED version with computed fields added to raw OpenRouter data
 */
export const BaseModelSchema = RawOpenRouterModelSchema.extend({
  // ✅ COMPUTED ENHANCEMENT FIELDS: Defined in models-config.service.ts
  provider: z.string(),
  category: ModelCategorySchema,
  capabilities: z.object({
    vision: z.boolean(),
    file: z.boolean(), // ✅ Whether model supports file/document inputs (PDFs, DOC, etc.)
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
  supports_file: z.boolean(), // ✅ Whether model supports file content types (PDFs) - derived from modality
  is_reasoning_model: z.boolean(),
  tags: z.array(ModelCapabilityTagSchema).openapi({
    description: 'User-facing capability filter tags (fast, vision, reasoning, pdf)',
    example: ['vision', 'reasoning'],
  }),
});

export type BaseModelResponse = z.infer<typeof BaseModelSchema>;

/**
 * Enhanced OpenRouter Model Schema with server-computed tier access
 * ✅ PATTERN: Extends base schema with authentication-specific fields
 * Used for authenticated endpoints where user tier context is available
 */
export const EnhancedModelSchema = BaseModelSchema.extend({
  // ✅ SERVER-COMPUTED TIER ACCESS (Single Source of Truth)
  required_tier: SubscriptionTierSchema,
  required_tier_name: z.string(), // Human-readable tier name (e.g., "Pro")
  is_accessible_to_user: z.boolean(),
});

export type EnhancedModelResponse = z.infer<typeof EnhancedModelSchema>;

/**
 * User Tier Configuration Schema
 * ✅ SERVER-COMPUTED: All tier limits and metadata from backend
 * Provides everything frontend needs to enforce tier restrictions without business logic
 */
export const UserTierConfigSchema = z.object({
  tier: SubscriptionTierSchema,
  tier_name: z.string(), // Human-readable tier name (e.g., "Free", "Pro")
  max_models: z.number(), // Maximum models allowed per conversation for this tier
  can_upgrade: z.boolean(), // Whether user can upgrade to a higher tier
});

export type UserTierConfig = z.infer<typeof UserTierConfigSchema>;

/**
 * List models response - simplified single sorted list
 * Models are sorted by accessibility: accessible models first (by quality), then inaccessible (by tier)
 */
export const ListModelsResponseSchema = createApiResponseSchema(
  z.object({
    items: z.array(EnhancedModelSchema),
    count: z.number(),
    total: z.number(),
    default_model_id: z.string(), // Default model selected based on user's tier
    user_tier_config: UserTierConfigSchema, // User's tier configuration with limits
  }).openapi('ListModelsPayload'),
).openapi('ListModelsResponse');

export type ListModelsResponse = z.infer<typeof ListModelsResponseSchema>;
