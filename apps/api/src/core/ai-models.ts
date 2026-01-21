/**
 * AI Model Constants - Single Source of Truth
 *
 * Centralized AI model IDs for specific system operations.
 * Eliminates hardcoded model strings across the codebase.
 *
 * ✅ PATTERN: Import from here, never hardcode model IDs
 * ✅ SINGLE SOURCE: All model assignments consolidated
 * ✅ TYPE-SAFE: Uses ModelIds from @/api/core/enums
 * ✅ UNIFIED: Same models used in all environments (local/preview/prod)
 *
 * Reference: /docs/backend-patterns.md
 */

import { ModelIds } from '@roundtable/shared/enums';

// ============================================================================
// COUNCIL MODERATOR MODELS
// ============================================================================

/**
 * Model for council moderator summary generation
 * ✅ GEMINI 2.5 FLASH: Fast, cheap, reliable structured JSON output
 * ⚠️ Anthropic models have schema validation issues (min/max not supported)
 */
export const COUNCIL_MODERATOR_MODEL_ID = ModelIds.GOOGLE_GEMINI_2_5_FLASH;

// ============================================================================
// TITLE GENERATION MODELS
// ============================================================================

/**
 * Model for conversation title generation
 * Uses Gemini 2.5 Flash - fast & reliable ($0.30/M input, $2.50/M output)
 */
export const TITLE_GENERATION_MODEL_ID = ModelIds.GOOGLE_GEMINI_2_5_FLASH;

// ============================================================================
// WEB SEARCH MODELS
// ============================================================================

/**
 * Model for web search query generation
 * ✅ GEMINI 2.5 FLASH: Fast, cheap, reliable structured JSON output
 */
export const WEB_SEARCH_MODEL_ID = ModelIds.GOOGLE_GEMINI_2_5_FLASH;

// ============================================================================
// IMAGE ANALYSIS MODELS
// ============================================================================

/**
 * Model for image content analysis (pre-search context extraction)
 * Uses Gemini 2.5 Flash - fast, vision-capable
 * Used to describe image contents before generating search queries
 */
export const IMAGE_ANALYSIS_MODEL_ID = ModelIds.GOOGLE_GEMINI_2_5_FLASH;

// ============================================================================
// PROMPT ANALYSIS MODELS
// ============================================================================

/**
 * Model for auto mode prompt analysis
 * Analyzes user prompts to recommend optimal model/role/mode configuration
 * ✅ GEMINI 2.5 FLASH: Fast, cheap, reliable structured JSON output
 */
export const PROMPT_ANALYSIS_MODEL_ID = ModelIds.GOOGLE_GEMINI_2_5_FLASH;

// ============================================================================
// EXPORTS
// ============================================================================

export const AIModels = {
  COUNCIL_MODERATOR: COUNCIL_MODERATOR_MODEL_ID,
  TITLE_GENERATION: TITLE_GENERATION_MODEL_ID,
  WEB_SEARCH: WEB_SEARCH_MODEL_ID,
  IMAGE_ANALYSIS: IMAGE_ANALYSIS_MODEL_ID,
  PROMPT_ANALYSIS: PROMPT_ANALYSIS_MODEL_ID,
} as const;
