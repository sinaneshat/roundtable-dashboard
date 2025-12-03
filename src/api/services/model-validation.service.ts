/**
 * Model Validation Service
 *
 * Validates model availability via OpenRouter API.
 */

import { createError } from '@/api/common/error-handling';
import type { ErrorContext } from '@/api/core';
import type { ApiEnv } from '@/api/types';

import type { HardcodedModel, ModelId } from './models-config.service';
import { getAllModels } from './models-config.service';
import { openRouterService } from './openrouter.service';

/** Check if running in local dev mode */
export function isLocalDevMode(): boolean {
  return process.env.NEXT_PUBLIC_WEBAPP_ENV === 'local';
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

/** Get available models, optionally validating via API */
export async function getAvailableModels(
  env: ApiEnv['Bindings'],
  skipValidation = false,
): Promise<HardcodedModel[]> {
  const allModels = getAllModels();

  if (skipValidation || isLocalDevMode()) {
    return [...allModels];
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

/** Create error for unavailable model */
export function createModelUnavailableError(modelId: string): Error {
  const context: ErrorContext = {
    errorType: 'external_service',
    service: 'openrouter',
    operation: 'model_validation',
    resourceId: modelId,
  };

  return createError.badRequest(`Model '${modelId}' is not available.`, context);
}
