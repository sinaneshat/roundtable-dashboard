/**
 * AI Model Utilities - SINGLE SOURCE OF TRUTH
 *
 * ✅ All model data from backend OpenRouter API
 * ✅ All pricing logic from backend service
 * ✅ All tier configuration from backend
 * ✅ Zero hardcoding, zero duplication
 *
 * This file exists ONLY to:
 * 1. Re-export backend utilities for convenience
 * 2. Provide minimal helper functions
 * 3. Define non-model constants (like DEFAULT_ROLES)
 */

// ============================================================================
// RE-EXPORT BACKEND UTILITIES (Single Source of Truth)
// ============================================================================

/**
 * ✅ ALL pricing and tier logic from backend service
 * These are re-exported for frontend convenience
 */
export {
  canAccessModelByPricing,
  getModelCostCategory,
  getModelPricingDisplay,
  getRequiredTierForModel,
  getTierUpgradeMessage,
  isModelFree,
} from '@/api/services/model-pricing-tiers.service';

/**
 * ✅ ALL tier configuration from backend
 */
export {
  getTierConfig,
  getTierName,
  getTiersInOrder,
} from '@/db/config/subscription-tiers';

// ============================================================================
// MODEL VALIDATION (Simple String Validation)
// ============================================================================

/**
 * Validate if a model ID is a non-empty string
 */
export function isValidModelId(modelId: unknown): modelId is string {
  return typeof modelId === 'string' && modelId.length > 0;
}

/**
 * Validate if a model ID follows OpenRouter format: provider/model-name
 */
export function isValidOpenRouterModelId(modelId: string): boolean {
  return typeof modelId === 'string' && modelId.includes('/');
}

// ============================================================================
// ROLE DEFINITIONS (Non-Model Constants)
// ============================================================================

/**
 * Default role options for participants
 * These are UI suggestions and don't affect backend logic
 */
export const DEFAULT_ROLES = [
  'The Ideator',
  'Devil\'s Advocate',
  'Builder',
  'Practical Evaluator',
  'Visionary Thinker',
  'Domain Expert',
  'User Advocate',
  'Implementation Strategist',
  'The Data Analyst',
] as const;

export type DefaultRole = typeof DEFAULT_ROLES[number];

// ============================================================================
// DISPLAY HELPERS (For Avatars/Icons Only)
// ============================================================================

/**
 * Get provider name from model ID
 * e.g., "anthropic/claude-4" → "anthropic"
 */
export function getProviderFromModelId(modelId: string): string {
  return modelId.includes('/') ? (modelId.split('/')[0] || 'unknown') : 'unknown';
}

/**
 * Get display name from model ID
 * e.g., "anthropic/claude-4" → "claude-4"
 */
export function getDisplayNameFromModelId(modelId: string): string {
  return modelId.includes('/') ? modelId.split('/').pop() || modelId : modelId;
}

/**
 * Extract formatted model name from model ID
 * e.g., "anthropic/claude-sonnet-4.5" → "Claude Sonnet 4.5"
 */
export function extractModelName(modelId: string): string {
  const parts = modelId.split('/');
  const modelPart = parts[parts.length - 1] || modelId;

  return modelPart
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
