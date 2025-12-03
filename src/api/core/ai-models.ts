/**
 * AI Model Constants - Single Source of Truth
 *
 * Centralized AI model IDs for specific system operations.
 * Eliminates hardcoded model strings across the codebase.
 *
 * ✅ PATTERN: Import from here, never hardcode model IDs
 * ✅ SINGLE SOURCE: All model assignments consolidated
 * ✅ TYPE-SAFE: Uses ModelIdEnum from models-config.service.ts
 * ✅ DEV MODE: Uses FREE models for all operations to reduce costs
 *
 * Reference: /docs/backend-patterns.md
 */

import { ModelIdEnum } from '@/api/services/models-config.service';

// ============================================================================
// ENVIRONMENT DETECTION
// ============================================================================

/**
 * Check if we should use dev (free) models
 * Only checks NEXT_PUBLIC_WEBAPP_ENV to avoid NODE_ENV issues in preview/prod
 */
function isDevMode(): boolean {
  return process.env.NEXT_PUBLIC_WEBAPP_ENV === 'local';
}

// ============================================================================
// FREE MODELS FOR DEV MODE
// ============================================================================

/** Free general model - Meta Llama (good for titles, search) */
const FREE_GENERAL_MODEL = ModelIdEnum.enum['meta-llama/llama-3.3-70b-instruct:free'];

// ============================================================================
// ANALYSIS MODELS
// ============================================================================

/**
 * Model for round analysis and moderator analysis
 * ✅ ALWAYS SONNET 3.5: Works reliably with mode:'json' for complex schemas
 * ✅ WHY NOT DEV FALLBACK: Analysis quality is critical, free models unreliable
 * ✅ WHY NOT OPUS: Grammar compilation size limits
 * ✅ WHY NOT GPT-4o: Strict mode rejects optional fields in schema
 */
export const ANALYSIS_MODEL_ID = ModelIdEnum.enum['anthropic/claude-3.5-sonnet'];

// ============================================================================
// TITLE GENERATION MODELS
// ============================================================================

/**
 * Model for conversation title generation
 * ✅ DEV: Uses free Llama (fast, good quality)
 * ✅ PROD: Uses Gemini Flash (fast, cost-efficient)
 */
export const TITLE_GENERATION_MODEL_ID = isDevMode()
  ? FREE_GENERAL_MODEL
  : ModelIdEnum.enum['google/gemini-2.5-flash'];

// ============================================================================
// WEB SEARCH MODELS
// ============================================================================

/**
 * Model for web search query generation
 * ✅ DEV: Uses free Llama (good JSON extraction)
 * ✅ PROD: Uses Claude Sonnet (excellent structured output)
 */
export const WEB_SEARCH_MODEL_ID = isDevMode()
  ? FREE_GENERAL_MODEL
  : ModelIdEnum.enum['anthropic/claude-sonnet-4.5'];

// ============================================================================
// EXPORTS
// ============================================================================

export const AIModels = {
  ANALYSIS: ANALYSIS_MODEL_ID,
  TITLE_GENERATION: TITLE_GENERATION_MODEL_ID,
  WEB_SEARCH: WEB_SEARCH_MODEL_ID,
} as const;
