/**
 * AI Model Enums
 *
 * Enums for model categorization and filtering.
 */

import { z } from '@hono/zod-openapi';

// ============================================================================
// MODEL CATEGORY
// ============================================================================

export const MODEL_CATEGORIES = ['reasoning', 'general', 'creative', 'research'] as const;

export const ModelCategorySchema = z.enum(MODEL_CATEGORIES).openapi({
  description: 'AI model category classification',
  example: 'reasoning',
});

export type ModelCategory = z.infer<typeof ModelCategorySchema>;

// ============================================================================
// MODEL CATEGORY FILTER (API filter for model listing)
// ============================================================================

export const MODEL_CATEGORY_FILTERS = ['all', 'text', 'vision', 'code', 'function'] as const;

export const DEFAULT_MODEL_CATEGORY_FILTER: ModelCategoryFilter = 'all';

export const ModelCategoryFilterSchema = z.enum(MODEL_CATEGORY_FILTERS).openapi({
  description: 'Filter models by category',
  example: 'all',
});

export type ModelCategoryFilter = z.infer<typeof ModelCategoryFilterSchema>;

export const ModelCategoryFilters = {
  ALL: 'all' as const,
  TEXT: 'text' as const,
  VISION: 'vision' as const,
  CODE: 'code' as const,
  FUNCTION: 'function' as const,
} as const;

// ============================================================================
// STREAMING BEHAVIOR - Chunk normalization requirements by provider
// ============================================================================

/**
 * ✅ STREAMING BEHAVIOR ENUM: Defines how models deliver SSE chunks
 *
 * Some providers (xAI/Grok, DeepSeek, Gemini) buffer responses server-side
 * and send large chunks (sometimes entire paragraphs/responses) instead of
 * streaming token-by-token like OpenAI/Anthropic.
 *
 * This causes UI jumpiness and height changes. smoothStream normalizes
 * chunk delivery at word boundaries for consistent UX across all providers.
 *
 * @see AI SDK v5: https://sdk.vercel.ai/docs/reference/ai-sdk-core/smooth-stream
 */
export const STREAMING_BEHAVIORS = ['token', 'buffered'] as const;

export const StreamingBehaviorSchema = z.enum(STREAMING_BEHAVIORS).openapi({
  description: 'How the model delivers streaming chunks',
  example: 'token',
});

export type StreamingBehavior = z.infer<typeof StreamingBehaviorSchema>;

/**
 * ✅ STREAMING BEHAVIOR CONSTANTS
 * - TOKEN: Streams token-by-token (OpenAI, Anthropic, Mistral) - no normalization needed
 * - BUFFERED: Buffers server-side, sends large chunks (xAI, DeepSeek, Gemini) - needs smoothStream
 */
export const StreamingBehaviors = {
  /** Token-by-token streaming (OpenAI, Anthropic, Mistral) - smooth by default */
  TOKEN: 'token' as const,
  /** Buffered chunks (xAI/Grok, DeepSeek, Gemini) - needs smoothStream normalization */
  BUFFERED: 'buffered' as const,
} as const;

/**
 * ✅ PROVIDER STREAMING BEHAVIOR DEFAULTS
 * Maps provider ID prefix to default streaming behavior.
 * Used as fallback when model-specific behavior isn't defined.
 */
export const PROVIDER_STREAMING_DEFAULTS: Record<string, StreamingBehavior> = {
  'openai': StreamingBehaviors.TOKEN,
  'anthropic': StreamingBehaviors.TOKEN,
  'mistralai': StreamingBehaviors.TOKEN,
  'x-ai': StreamingBehaviors.BUFFERED,
  'deepseek': StreamingBehaviors.BUFFERED,
  'google': StreamingBehaviors.BUFFERED, // Gemini models buffer
} as const;
