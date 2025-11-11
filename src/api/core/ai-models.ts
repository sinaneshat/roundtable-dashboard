/**
 * AI Model Constants - Single Source of Truth
 *
 * Centralized AI model IDs for specific system operations.
 * Eliminates hardcoded model strings across the codebase.
 *
 * ✅ PATTERN: Import from here, never hardcode model IDs
 * ✅ SINGLE SOURCE: All model assignments consolidated
 * ✅ TYPE-SAFE: Uses ModelIdEnum from models-config.service.ts
 *
 * Reference: /docs/backend-patterns.md
 */

import { ModelIdEnum } from '@/api/services/models-config.service';

// ============================================================================
// ANALYSIS MODELS
// ============================================================================

/**
 * Default model for round analysis and moderator analysis
 * ✅ SINGLE SOURCE: Used by analysis.handler.ts and mcp/handler.ts
 * ✅ REPLACES: Hardcoded model strings across analysis operations
 * ✅ CURRENT: Claude 3.5 Sonnet for high-quality analysis
 *
 * Used by:
 * - /src/api/routes/chat/handlers/analysis.handler.ts - Round analysis streaming
 * - /src/api/routes/mcp/handler.ts - MCP tool analysis operations
 * - /src/api/services/moderator-analysis.service.ts - Analysis generation
 */
export const ANALYSIS_MODEL_ID = ModelIdEnum.enum['anthropic/claude-3.5-sonnet'];

// ============================================================================
// TITLE GENERATION MODELS
// ============================================================================

/**
 * Default model for conversation title generation
 * ✅ SINGLE SOURCE: Used by title-generator.service.ts
 * ✅ REPLACES: Hardcoded 'google/gemini-2.5-flash' strings
 *
 * Used by:
 * - /src/api/services/title-generator.service.ts - getTitleGenerationModel()
 * - /src/api/services/product-logic.service.ts - Title generation config
 */
export const TITLE_GENERATION_MODEL_ID = ModelIdEnum.enum['google/gemini-2.5-flash'];

// ============================================================================
// WEB SEARCH MODELS
// ============================================================================

/**
 * Default model for web search query generation and processing
 * ✅ SINGLE SOURCE: Used by web-search.service.ts
 * ✅ CURRENT: Claude 3 Opus for high-quality search query generation
 *
 * Used by:
 * - /src/api/services/web-search.service.ts - Query generation
 * - /src/api/routes/chat/handlers/pre-search.handler.ts - Pre-search operations
 */
export const WEB_SEARCH_MODEL_ID = ModelIdEnum.enum['anthropic/claude-3-opus'];

// ============================================================================
// EXPORTS
// ============================================================================

/**
 * All AI model constants exported as object for convenient imports
 *
 * @example
 * import { AIModels } from '@/api/core/ai-models';
 * const modelId = AIModels.ANALYSIS;
 */
export const AIModels = {
  ANALYSIS: ANALYSIS_MODEL_ID,
  TITLE_GENERATION: TITLE_GENERATION_MODEL_ID,
  WEB_SEARCH: WEB_SEARCH_MODEL_ID,
} as const;
