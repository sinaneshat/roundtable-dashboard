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
// ENVIRONMENT DETECTION
// ============================================================================

/**
 * Check if we should use dev (cheap) models
 */
function isDevMode(): boolean {
  return process.env.NEXT_PUBLIC_WEBAPP_ENV === 'local';
}

// ============================================================================
// CHEAP MODELS FOR DEV/SYSTEM OPERATIONS
// ============================================================================

/** Cheapest model - Gemini 2.0 Flash ($0.10/1M) */
const CHEAP_FAST_MODEL = ModelIdEnum.enum['google/gemini-2.0-flash-001'];

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
 * ✅ DEV: Uses Gemini 2.0 Flash (cheapest)
 * ✅ PROD: Uses Gemini 2.5 Flash (fast, cost-efficient)
 */
export const TITLE_GENERATION_MODEL_ID = isDevMode()
  ? CHEAP_FAST_MODEL
  : ModelIdEnum.enum['google/gemini-2.5-flash'];

// ============================================================================
// WEB SEARCH MODELS
// ============================================================================

/**
 * Model for web search query generation
 * ✅ DEV: Uses Gemini 2.0 Flash (ultra-fast)
 * ✅ PROD: Uses Claude Sonnet 4 (excellent structured output)
 */
export const WEB_SEARCH_MODEL_ID = isDevMode()
  ? CHEAP_FAST_MODEL
  : ModelIdEnum.enum['anthropic/claude-sonnet-4'];

// ============================================================================
// EXPORTS
// ============================================================================

export const AIModels = {
  ANALYSIS: ANALYSIS_MODEL_ID,
  TITLE_GENERATION: TITLE_GENERATION_MODEL_ID,
  WEB_SEARCH: WEB_SEARCH_MODEL_ID,
} as const;
