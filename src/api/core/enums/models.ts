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
