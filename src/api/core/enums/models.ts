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

// 1. ARRAY CONSTANT
export const MODEL_CATEGORY_FILTERS = ['all', 'text', 'vision', 'code', 'function'] as const;

// 2. ZOD SCHEMA
export const ModelCategoryFilterSchema = z.enum(MODEL_CATEGORY_FILTERS).openapi({
  description: 'Filter models by category',
  example: 'all',
});

// 3. TYPESCRIPT TYPE
export type ModelCategoryFilter = z.infer<typeof ModelCategoryFilterSchema>;

// 4. DEFAULT VALUE
export const DEFAULT_MODEL_CATEGORY_FILTER: ModelCategoryFilter = 'all';

// 5. CONSTANT OBJECT
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
  return ModelProviderSchema.safeParse(value).success;
}

export const PROVIDER_STREAMING_DEFAULTS: Record<ModelProvider, StreamingBehavior> = {
  [ModelProviders.OPENAI]: StreamingBehaviors.TOKEN,
  [ModelProviders.ANTHROPIC]: StreamingBehaviors.TOKEN,
  [ModelProviders.MISTRALAI]: StreamingBehaviors.TOKEN,
  [ModelProviders.X_AI]: StreamingBehaviors.BUFFERED,
  [ModelProviders.DEEPSEEK]: StreamingBehaviors.BUFFERED,
  [ModelProviders.GOOGLE]: StreamingBehaviors.BUFFERED,
} as const;

// ============================================================================
// MODEL ID - AI model identifiers (hardcoded models from models-config.service.ts)
// ============================================================================

export const MODEL_IDS = [
  'openai/gpt-oss-120b',
  'openai/gpt-5-nano',
  'openai/gpt-4.1-nano',
  'openai/gpt-4o-mini',
  'x-ai/grok-4-fast',
  'x-ai/grok-4.1-fast',
  'x-ai/grok-code-fast-1',
  'deepseek/deepseek-chat-v3-0324',
  'deepseek/deepseek-v3.2',
  'google/gemini-2.5-flash',
  'openai/gpt-5-mini',
  'openai/gpt-4.1-mini',
  'mistralai/mistral-large-2512',
  'google/gemini-3-flash-preview',
  'anthropic/claude-haiku-4.5',
  'openai/o3-mini',
  'openai/o4-mini',
  'google/gemini-2.5-pro',
  'openai/gpt-5',
  'openai/gpt-5.1',
  'openai/gpt-5.2',
  'openai/o3',
  'openai/gpt-4.1',
  'google/gemini-3-pro-preview',
  'x-ai/grok-3',
  'x-ai/grok-4',
  'anthropic/claude-sonnet-4',
  'anthropic/claude-sonnet-4.5',
  'anthropic/claude-opus-4.5',
  'openai/o1',
  'anthropic/claude-opus-4',
] as const;

export const ModelIdSchema = z.enum(MODEL_IDS).openapi({
  description: 'AI model identifier',
  example: 'openai/gpt-4o-mini',
});

export type ModelId = z.infer<typeof ModelIdSchema>;

// 5. CONSTANT OBJECT - Define before DEFAULT_MODEL_ID so it can be referenced
export const ModelIds = {
  OPENAI_GPT_OSS_120B: 'openai/gpt-oss-120b' as const,
  OPENAI_GPT_5_NANO: 'openai/gpt-5-nano' as const,
  OPENAI_GPT_4_1_NANO: 'openai/gpt-4.1-nano' as const,
  OPENAI_GPT_4O_MINI: 'openai/gpt-4o-mini' as const,
  X_AI_GROK_4_FAST: 'x-ai/grok-4-fast' as const,
  X_AI_GROK_4_1_FAST: 'x-ai/grok-4.1-fast' as const,
  X_AI_GROK_CODE_FAST_1: 'x-ai/grok-code-fast-1' as const,
  DEEPSEEK_DEEPSEEK_CHAT_V3_0324: 'deepseek/deepseek-chat-v3-0324' as const,
  DEEPSEEK_DEEPSEEK_V3_2: 'deepseek/deepseek-v3.2' as const,
  GOOGLE_GEMINI_2_5_FLASH: 'google/gemini-2.5-flash' as const,
  OPENAI_GPT_5_MINI: 'openai/gpt-5-mini' as const,
  OPENAI_GPT_4_1_MINI: 'openai/gpt-4.1-mini' as const,
  MISTRALAI_MISTRAL_LARGE_2512: 'mistralai/mistral-large-2512' as const,
  GOOGLE_GEMINI_3_FLASH_PREVIEW: 'google/gemini-3-flash-preview' as const,
  ANTHROPIC_CLAUDE_HAIKU_4_5: 'anthropic/claude-haiku-4.5' as const,
  OPENAI_O3_MINI: 'openai/o3-mini' as const,
  OPENAI_O4_MINI: 'openai/o4-mini' as const,
  GOOGLE_GEMINI_2_5_PRO: 'google/gemini-2.5-pro' as const,
  OPENAI_GPT_5: 'openai/gpt-5' as const,
  OPENAI_GPT_5_1: 'openai/gpt-5.1' as const,
  OPENAI_GPT_5_2: 'openai/gpt-5.2' as const,
  OPENAI_O3: 'openai/o3' as const,
  OPENAI_GPT_4_1: 'openai/gpt-4.1' as const,
  GOOGLE_GEMINI_3_PRO_PREVIEW: 'google/gemini-3-pro-preview' as const,
  X_AI_GROK_3: 'x-ai/grok-3' as const,
  X_AI_GROK_4: 'x-ai/grok-4' as const,
  X_AI_GROK_4_1: 'x-ai/grok-4.1' as const,
  ANTHROPIC_CLAUDE_SONNET_4: 'anthropic/claude-sonnet-4' as const,
  ANTHROPIC_CLAUDE_SONNET_4_5: 'anthropic/claude-sonnet-4.5' as const,
  ANTHROPIC_CLAUDE_OPUS_4_5: 'anthropic/claude-opus-4.5' as const,
  OPENAI_O1: 'openai/o1' as const,
  ANTHROPIC_CLAUDE_OPUS_4: 'anthropic/claude-opus-4' as const,
} as const;

// 4. DEFAULT VALUE - Uses ModelIds for single source of truth
export const DEFAULT_MODEL_ID: ModelId = ModelIds.OPENAI_GPT_4O_MINI;

// ============================================================================
// MODEL CAPABILITY TAGS - User-facing filter tags for model selection
// ============================================================================

// 1. ARRAY CONSTANT - Source of truth for tag values
export const MODEL_CAPABILITY_TAGS = ['fast', 'vision', 'reasoning', 'pdf'] as const;

// 2. ZOD SCHEMA - Runtime validation + OpenAPI docs
export const ModelCapabilityTagSchema = z.enum(MODEL_CAPABILITY_TAGS).openapi({
  description: 'User-facing model capability tag for filtering',
  example: 'vision',
});

// 3. TYPESCRIPT TYPE - Inferred from Zod schema
export type ModelCapabilityTag = z.infer<typeof ModelCapabilityTagSchema>;

// 4. DEFAULT VALUE
export const DEFAULT_MODEL_CAPABILITY_TAGS: ModelCapabilityTag[] = [];

// 5. CONSTANT OBJECT - For usage in code (prevents typos)
export const ModelCapabilityTags = {
  FAST: 'fast' as const, // Quick response, lower cost models
  VISION: 'vision' as const, // Supports image/visual input
  REASONING: 'reasoning' as const, // Enhanced reasoning/thinking
  PDF: 'pdf' as const, // Supports PDF/document processing
} as const;

// Tag display labels for UI
export const MODEL_CAPABILITY_TAG_LABELS: Record<ModelCapabilityTag, string> = {
  [ModelCapabilityTags.FAST]: 'Fast',
  [ModelCapabilityTags.VISION]: 'Vision',
  [ModelCapabilityTags.REASONING]: 'Reasoning',
  [ModelCapabilityTags.PDF]: 'PDF',
} as const;

// Tag icons for UI (Lucide icon names)
export const MODEL_CAPABILITY_TAG_ICONS: Record<ModelCapabilityTag, string> = {
  [ModelCapabilityTags.FAST]: 'zap',
  [ModelCapabilityTags.VISION]: 'eye',
  [ModelCapabilityTags.REASONING]: 'brain',
  [ModelCapabilityTags.PDF]: 'fileText',
} as const;
