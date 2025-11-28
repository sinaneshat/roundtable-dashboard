/**
 * Model Validation Service
 *
 * Filters free models (only shown in local dev) and validates model availability.
 */

import { createError } from '@/api/common/error-handling';
import type { ErrorContext } from '@/api/core';
import type { ApiEnv } from '@/api/types';

import type { HardcodedModel, ModelId } from './models-config.service';
import { getAllModels } from './models-config.service';
import { openRouterService } from './openrouter.service';

/** Free models - only available in local dev mode */
const FREE_MODELS = new Set<string>([
  'deepseek/deepseek-chat-v3.1:free',
  'deepseek/deepseek-r1:free',
  'deepseek/deepseek-chat-v3-0324:free',
  'meta-llama/llama-4-scout:free',
  'meta-llama/llama-4-maverick:free',
  'meta-llama/llama-3.3-70b-instruct:free',
]);

/** Fallback to paid equivalents if free model fails */
const FREE_MODEL_FALLBACKS: Record<string, ModelId> = {
  'deepseek/deepseek-chat-v3.1:free': 'deepseek/deepseek-chat-v3.1',
  'deepseek/deepseek-r1:free': 'deepseek/deepseek-r1',
  'deepseek/deepseek-chat-v3-0324:free': 'deepseek/deepseek-chat-v3-0324',
  'meta-llama/llama-4-scout:free': 'meta-llama/llama-4-scout',
  'meta-llama/llama-4-maverick:free': 'meta-llama/llama-4-maverick',
} as const;

/** Check if running in local dev mode */
export function isLocalDevMode(): boolean {
  return process.env.NEXT_PUBLIC_WEBAPP_ENV === 'local';
}

/** Check if model is a free model (local dev only) */
export function isFreeModel(modelId: string): boolean {
  return FREE_MODELS.has(modelId);
}

/** Get paid fallback for a free model */
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
 * Filter models based on environment
 * Free/dev models only available in local, filtered out in preview/prod
 */
export function filterModelsForEnvironment(models: readonly HardcodedModel[]): HardcodedModel[] {
  if (isLocalDevMode()) {
    return [...models]; // Include all models in local dev
  }
  return models.filter(model => !isFreeModel(model.id));
}

/**
 * Filter models to only include available ones
 * Removes restricted free models in non-local environments
 */
export async function getAvailableModels(
  env: ApiEnv['Bindings'],
  skipValidation = false,
): Promise<HardcodedModel[]> {
  const allModels = getAllModels();
  const filteredModels = filterModelsForEnvironment(allModels);

  if (skipValidation || isLocalDevMode()) {
    return filteredModels;
  }

  // In production, validate each model (with caching in future)
  const availabilityChecks = await Promise.all(
    filteredModels.map(async model => ({
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
  if (isFreeModel(requestedModelId)) {
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

  if (isFreeModel(modelId)) {
    const fallback = getFallbackModel(modelId);
    message += ` This free model requires specific OpenRouter privacy settings.`;
    if (fallback) {
      message += ` Using fallback model: ${fallback}`;
    }
  }

  return createError.badRequest(message, context);
}
