/**
 * AI Model Constants - Single Source of Truth
 *
 * Centralized AI model IDs for specific system operations.
 * Eliminates hardcoded model strings across the codebase.
 *
 * ✅ PATTERN: Import from here, never hardcode model IDs
 * ✅ SINGLE SOURCE: All model assignments consolidated
 * ✅ TYPE-SAFE: Uses ModelIdEnum from models-config.service.ts
 * ✅ UNIFIED: Same models used in all environments (local/preview/prod)
 *
 * Reference: /docs/backend-patterns.md
 */

import { ModelIdEnum } from '@/api/services/models-config.service';

// ============================================================================
// ANALYSIS MODELS
// ============================================================================

/**
 * Model for round analysis and moderator analysis
 * ✅ ALWAYS CLAUDE 3.5 SONNET: Tested & works reliably with mode:'json' for complex schemas
 * ⚠️ DO NOT CHANGE: Claude Sonnet 4 has issues with streamObject mode:'json' - returns empty responses
 */
export const ANALYSIS_MODEL_ID = ModelIdEnum.enum['anthropic/claude-3.5-sonnet'];

// ============================================================================
// TITLE GENERATION MODELS
// ============================================================================

/**
 * Model for conversation title generation
 * Uses Gemini 2.0 Flash - cheapest & fastest ($0.10/M input, $0.40/M output)
 */
export const TITLE_GENERATION_MODEL_ID = ModelIdEnum.enum['google/gemini-2.0-flash-001'];

// ============================================================================
// WEB SEARCH MODELS
// ============================================================================

/**
 * Model for web search query generation
 * Uses Claude 3.5 Sonnet - reliable structured output, same as analysis
 */
export const WEB_SEARCH_MODEL_ID = ModelIdEnum.enum['anthropic/claude-3.5-sonnet'];

// ============================================================================
// EXPORTS
// ============================================================================

export const AIModels = {
  ANALYSIS: ANALYSIS_MODEL_ID,
  TITLE_GENERATION: TITLE_GENERATION_MODEL_ID,
  WEB_SEARCH: WEB_SEARCH_MODEL_ID,
} as const;
