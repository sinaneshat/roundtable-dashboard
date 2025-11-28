/**
 * AI Model Constants - Single Source of Truth
 *
 * Model IDs for internal system operations (title gen, analysis, search).
 * In local dev, uses cheap models to reduce costs.
 */

import { isLocalDevMode } from '@/api/services/model-validation.service';
import { ModelIdEnum } from '@/api/services/models-config.service';

// ============================================================================
// SYSTEM OPERATION MODELS
// ============================================================================

/** Analysis model - uses premium for quality */
export const ANALYSIS_MODEL_ID = ModelIdEnum.enum['anthropic/claude-3.5-sonnet'];

/** Title generation - cheap model in local, gemini flash in prod */
export const TITLE_GENERATION_MODEL_ID = isLocalDevMode()
  ? ModelIdEnum.enum['deepseek/deepseek-chat-v3-0324:free']
  : ModelIdEnum.enum['google/gemini-2.5-flash'];

/** Web search - uses premium for reliable JSON */
export const WEB_SEARCH_MODEL_ID = ModelIdEnum.enum['anthropic/claude-sonnet-4.5'];

// ============================================================================
// EXPORTS
// ============================================================================

export const AIModels = {
  ANALYSIS: ANALYSIS_MODEL_ID,
  TITLE_GENERATION: TITLE_GENERATION_MODEL_ID,
  WEB_SEARCH: WEB_SEARCH_MODEL_ID,
} as const;
