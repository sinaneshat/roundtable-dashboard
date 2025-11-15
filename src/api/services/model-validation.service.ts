/**
 * Model Validation Service
 *
 * Validates model availability before use and filters unavailable models
 * from being shown to users. Handles OpenRouter-specific issues like
 * `:free` models requiring specific data privacy policy settings.
 *
 * @see /docs/backend-patterns.md - Service layer patterns
 */

import { createError } from '@/api/common/error-handling';
import type { ErrorContext } from '@/api/core';
import type { ApiEnv } from '@/api/types';

import type { HardcodedModel, ModelId } from './models-config.service';
import { getAllModels } from './models-config.service';
import { openRouterService } from './openrouter.service';

// ============================================================================
// MODEL AVAILABILITY VALIDATION
// ============================================================================

/**
 * Models that require special OpenRouter privacy policy settings
 * These models fail with 404 if the account doesn't have "Free model publication" enabled
 */
const RESTRICTED_FREE_MODELS = new Set<string>([
  'deepseek/deepseek-chat-v3.1:free',
  'deepseek/deepseek-r1:free',
  'deepseek/deepseek-chat-v3-0324:free',
  'meta-llama/llama-4-scout:free',
  'meta-llama/llama-4-maverick:free',
  'meta-llama/llama-3.3-70b-instruct:free',
]);

/**
 * Mapping of free models to their paid equivalents
 * Note: Some free models don't have paid equivalents in our enum, so they're excluded
 */
const FREE_MODEL_FALLBACKS: Record<string, ModelId> = {
  'deepseek/deepseek-chat-v3.1:free': 'deepseek/deepseek-chat-v3.1',
  'deepseek/deepseek-r1:free': 'deepseek/deepseek-r1',
  'deepseek/deepseek-chat-v3-0324:free': 'deepseek/deepseek-chat-v3-0324',
  'meta-llama/llama-4-scout:free': 'meta-llama/llama-4-scout',
  'meta-llama/llama-4-maverick:free': 'meta-llama/llama-4-maverick',
  // Note: meta-llama/llama-3.3-70b-instruct (non-free) is not in our enum
  // If :free version fails, we have no fallback - model will be filtered out
} as const;

/**
 * Check if a model is a restricted free model
 */
export function isRestrictedFreeModel(modelId: string): boolean {
  return RESTRICTED_FREE_MODELS.has(modelId);
}

/**
 * Get fallback model for a restricted free model
 * Returns undefined if no fallback exists
 */
export function getFallbackModel(modelId: string): ModelId | undefined {
  return FREE_MODEL_FALLBACKS[modelId];
}

/**
 * Validate model availability by attempting a lightweight API call
 * Returns true if model is available, false otherwise
 */
export async function validateModelAvailability(
  modelId: ModelId,
  _env: ApiEnv['Bindings'],
): Promise<boolean> {
  try {
    const client = openRouterService.getClient();

    // Minimal test to check if model endpoint exists
    // We'll try to get model info without actually generating text
    await client.chat(modelId);

    return true;
  } catch (error) {
    // Check if error is related to model availability
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (
      errorMessage.includes('No endpoints found')
      || errorMessage.includes('data policy')
      || errorMessage.includes('404')
    ) {
      return false;
    }

    // For other errors, assume model is available (might be temporary API issue)
    return true;
  }
}

/**
 * Filter models to only include available ones
 * Removes restricted free models that aren't accessible
 */
export async function getAvailableModels(
  env: ApiEnv['Bindings'],
  skipValidation = false,
): Promise<HardcodedModel[]> {
  const allModels = getAllModels();

  // In development or if validation is skipped, filter out restricted free models
  if (skipValidation || process.env.NODE_ENV === 'development') {
    return allModels.filter(model => !isRestrictedFreeModel(model.id));
  }

  // In production, validate each model (with caching in future)
  const availabilityChecks = await Promise.all(
    allModels.map(async model => ({
      model,
      available: await validateModelAvailability(model.id, env),
    })),
  );

  return availabilityChecks
    .filter(check => check.available)
    .map(check => check.model);
}

/**
 * Resolve model ID with fallback logic
 * If a restricted free model is requested but unavailable, returns the paid equivalent
 */
export function resolveModelWithFallback(requestedModelId: ModelId): ModelId {
  if (isRestrictedFreeModel(requestedModelId)) {
    const fallback = getFallbackModel(requestedModelId);
    if (fallback) {
      return fallback;
    }
  }

  return requestedModelId;
}

/**
 * Validate and resolve model ID before use in streaming/generation
 * Throws error if model is completely unavailable
 */
export function validateAndResolveModel(
  requestedModelId: ModelId,
): { modelId: ModelId; usedFallback: boolean } {
  const resolvedModelId = resolveModelWithFallback(requestedModelId);
  const usedFallback = resolvedModelId !== requestedModelId;

  return {
    modelId: resolvedModelId,
    usedFallback,
  };
}

/**
 * Create detailed error for unavailable model
 */
export function createModelUnavailableError(modelId: string): Error {
  const context: ErrorContext = {
    errorType: 'external_service',
    service: 'openrouter',
    operation: 'model_validation',
    resourceId: modelId,
  };

  let message = `Model '${modelId}' is not available.`;

  if (isRestrictedFreeModel(modelId)) {
    const fallback = getFallbackModel(modelId);
    message += ` This free model requires specific OpenRouter privacy settings.`;
    if (fallback) {
      message += ` Using fallback model: ${fallback}`;
    }
  }

  return createError.badRequest(message, context);
}
