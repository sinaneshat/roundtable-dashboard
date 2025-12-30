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

export const DEFAULT_MODEL_CATEGORY: ModelCategory = 'general';

export const ModelCategories = {
  REASONING: 'reasoning' as const,
  GENERAL: 'general' as const,
  CREATIVE: 'creative' as const,
  RESEARCH: 'research' as const,
} as const;

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

export const STREAMING_BEHAVIORS = ['token', 'buffered'] as const;

export const StreamingBehaviorSchema = z.enum(STREAMING_BEHAVIORS).openapi({
  description: 'How the model delivers streaming chunks',
  example: 'token',
});

export type StreamingBehavior = z.infer<typeof StreamingBehaviorSchema>;

export const DEFAULT_STREAMING_BEHAVIOR: StreamingBehavior = 'token';

export const StreamingBehaviors = {
  TOKEN: 'token' as const,
  BUFFERED: 'buffered' as const,
} as const;

export const PROVIDER_STREAMING_DEFAULTS: Record<string, StreamingBehavior> = {
  'openai': StreamingBehaviors.TOKEN,
  'anthropic': StreamingBehaviors.TOKEN,
  'mistralai': StreamingBehaviors.TOKEN,
  'x-ai': StreamingBehaviors.BUFFERED,
  'deepseek': StreamingBehaviors.BUFFERED,
  'google': StreamingBehaviors.BUFFERED,
} as const;

// ============================================================================
// JSON MODE QUALITY - Structured output capability quality ratings
// ============================================================================

export const JSON_MODE_QUALITIES = ['excellent', 'good', 'fair', 'poor'] as const;

export const JsonModeQualitySchema = z.enum(JSON_MODE_QUALITIES).openapi({
  description: 'Quality rating for structured JSON output capability',
  example: 'excellent',
});

export type JsonModeQuality = z.infer<typeof JsonModeQualitySchema>;

export const DEFAULT_JSON_MODE_QUALITY: JsonModeQuality = 'good';

export const JsonModeQualities = {
  EXCELLENT: 'excellent' as const,
  GOOD: 'good' as const,
  FAIR: 'fair' as const,
  POOR: 'poor' as const,
} as const;

// ============================================================================
// MODEL PROVIDER - AI model provider identification
// ============================================================================

export const MODEL_PROVIDERS = ['x-ai', 'anthropic', 'google', 'deepseek', 'openai', 'mistralai'] as const;

export const ModelProviderSchema = z.enum(MODEL_PROVIDERS).openapi({
  description: 'AI model provider identifier',
  example: 'openai',
});

export type ModelProvider = z.infer<typeof ModelProviderSchema>;

export const DEFAULT_MODEL_PROVIDER: ModelProvider = 'openai';

export const ModelProviders = {
  X_AI: 'x-ai' as const,
  ANTHROPIC: 'anthropic' as const,
  GOOGLE: 'google' as const,
  DEEPSEEK: 'deepseek' as const,
  OPENAI: 'openai' as const,
  MISTRALAI: 'mistralai' as const,
} as const;

export function isModelProvider(value: unknown): value is ModelProvider {
  return typeof value === 'string' && MODEL_PROVIDERS.includes(value as ModelProvider);
}
