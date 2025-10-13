/**
 * Participant Retry Service
 *
 * ✅ USER REQUIREMENT: Aggressive retry logic to ensure models respond
 * ✅ ZOD-FIRST: All types imported from route schemas (single source of truth)
 * ✅ CONSOLIDATED CONFIG: Retry settings from lib/config/ai-defaults.ts
 *
 * Handles retry logic for AI model participants with:
 * - Up to 10 retry attempts per participant (USER REQUIREMENT)
 * - 30 second timeout per attempt (from AI_TIMEOUT_CONFIG)
 * - Exponential backoff between attempts
 * - Optional fallback to alternative models
 * - Comprehensive error tracking and metadata
 * - NO skipping participants until all retries exhausted
 *
 * Following AI SDK v5 patterns and existing error classification
 */

import type { streamText } from 'ai';

import { apiLogger } from '@/api/middleware/hono-logger';
import type { RetryAttemptMetadata } from '@/api/routes/chat/schema';
import { AI_RETRY_CONFIG } from '@/api/routes/chat/schema';
import type { SubscriptionTier } from '@/db/tables/usage';

import { canAccessModelByPricing } from './model-pricing-tiers.service';
import {
  calculateRetryDelay,
  classifyOpenRouterError,
} from './openrouter-error-handler';
import { openRouterModelsService } from './openrouter-models.service';

/**
 * Maximum retry attempts per participant
 * ✅ SINGLE SOURCE: Imported from consolidated AI config
 */
export const MAX_RETRY_ATTEMPTS = AI_RETRY_CONFIG.maxAttempts;

/**
 * Retry result with success flag and metadata
 */
export type RetryResult = {
  success: boolean;
  result?: Awaited<ReturnType<typeof streamText>>;
  error?: Error;
  metadata: {
    totalAttempts: number;
    retryHistory: RetryAttemptMetadata[];
    originalModel: string;
    finalModel: string;
    modelSwitched: boolean;
  };
};

/**
 * Stream function type - returns a streamText result
 */
export type StreamFunction = (modelId: string) => Promise<Awaited<ReturnType<typeof streamText>>>;

/**
 * Get fallback models for a given model
 * Returns models from the same tier but different providers
 */
async function getFallbackModels(
  originalModelId: string,
  userTier: SubscriptionTier,
  maxFallbacks = 2,
): Promise<string[]> {
  try {
    // Fetch all available models
    const allModels = await openRouterModelsService.fetchAllModels();

    // Find the original model to determine its characteristics
    const originalModel = allModels.find(m => m.id === originalModelId);
    if (!originalModel) {
      apiLogger.warn('Original model not found for fallback selection', {
        originalModelId,
      });
      return [];
    }

    // Extract provider from original model ID
    const originalProvider = originalModelId.split('/')[0];

    // Find alternative models that:
    // 1. User can access (same or lower tier)
    // 2. Different provider (to avoid provider-wide issues)
    // 3. Similar pricing tier (prefer similar capability)
    const fallbackCandidates = allModels
      .filter((model) => {
        // Must be accessible to user
        if (!canAccessModelByPricing(userTier, model)) {
          return false;
        }

        // Must be different model
        if (model.id === originalModelId) {
          return false;
        }

        // Prefer different provider
        const modelProvider = model.id.split('/')[0];
        if (modelProvider === originalProvider) {
          return false;
        }

        return true;
      })
      // Sort by pricing similarity (prefer models in same cost range)
      .sort((a, b) => {
        // Convert pricing to numbers (pricing can be string or number)
        const aPrompt = typeof a.pricing?.prompt === 'number' ? a.pricing.prompt : Number.parseFloat(String(a.pricing?.prompt || '0'));
        const aCompletion = typeof a.pricing?.completion === 'number' ? a.pricing.completion : Number.parseFloat(String(a.pricing?.completion || '0'));
        const bPrompt = typeof b.pricing?.prompt === 'number' ? b.pricing.prompt : Number.parseFloat(String(b.pricing?.prompt || '0'));
        const bCompletion = typeof b.pricing?.completion === 'number' ? b.pricing.completion : Number.parseFloat(String(b.pricing?.completion || '0'));
        const origPrompt = typeof originalModel.pricing?.prompt === 'number' ? originalModel.pricing.prompt : Number.parseFloat(String(originalModel.pricing?.prompt || '0'));
        const origCompletion = typeof originalModel.pricing?.completion === 'number' ? originalModel.pricing.completion : Number.parseFloat(String(originalModel.pricing?.completion || '0'));

        const aPricing = aPrompt + aCompletion;
        const bPricing = bPrompt + bCompletion;
        const originalPricing = origPrompt + origCompletion;

        const aDiff = Math.abs(aPricing - originalPricing);
        const bDiff = Math.abs(bPricing - originalPricing);

        return aDiff - bDiff;
      })
      .slice(0, maxFallbacks)
      .map(model => model.id);

    apiLogger.info('Found fallback models', {
      originalModelId,
      originalProvider,
      userTier,
      fallbackCount: fallbackCandidates.length,
      fallbacks: fallbackCandidates,
    });

    return fallbackCandidates;
  } catch (error) {
    apiLogger.error('Failed to get fallback models', {
      originalModelId,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a streaming operation with exponential backoff and optional fallback models
 *
 * @param streamFn Function that creates and returns a streamText result
 * @param originalModelId Original model ID to try
 * @param userTier User's subscription tier (for fallback selection)
 * @param context Context for logging
 * @returns RetryResult with success status and metadata
 */
export async function retryParticipantStream(
  streamFn: StreamFunction,
  originalModelId: string,
  userTier: SubscriptionTier,
  context: {
    threadId: string;
    participantId: string;
    participantIndex: number;
  },
): Promise<RetryResult> {
  const retryHistory: RetryAttemptMetadata[] = [];
  let currentModelId = originalModelId;
  let fallbackModels: string[] = [];
  let fallbacksLoaded = false;

  apiLogger.info('Starting participant stream with retry mechanism', {
    ...context,
    originalModelId,
    maxAttempts: MAX_RETRY_ATTEMPTS,
  });

  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
    const attemptNumber = attempt + 1;

    try {
      apiLogger.info('Stream attempt starting', {
        ...context,
        attemptNumber,
        maxAttempts: MAX_RETRY_ATTEMPTS,
        currentModelId,
        isOriginalModel: currentModelId === originalModelId,
      });

      // Call the stream function with the current model
      const result = await streamFn(currentModelId);

      // ✅ CRITICAL: Validate response has content before considering it successful
      // AI SDK's streamText result has a `text` promise that resolves to full response
      // We need to check this to catch empty responses that would otherwise be
      // detected too late in onFinish (outside retry mechanism)
      //
      // 🔍 IMPORTANT NOTE ON STREAM CONSUMPTION:
      // Awaiting `result.text` reads the entire stream to validate content.
      // The AI SDK internally handles this by caching the response, allowing
      // `result.toUIMessageStreamResponse()` to still work after validation.
      // This is confirmed by AI SDK's architecture that supports multiple accessors.
      //
      // If streaming fails after this validation (empty responses sent to client),
      // it would indicate the AI SDK changed behavior. In that case, we'd need to:
      // 1. Use stream.tee() to create two consumers (one for validation, one for response)
      // 2. Or implement validation during streaming rather than before
      try {
        const fullText = await result.text;

        // Check if response is empty
        if (!fullText || fullText.trim().length === 0) {
          throw new Error('Model generated empty response - retrying with next attempt');
        }

        apiLogger.info('Stream validation succeeded - response has content', {
          ...context,
          attemptNumber,
          currentModelId,
          responseLength: fullText.length,
        });
      } catch (validationError) {
        // Empty response detected - throw to trigger retry
        apiLogger.warn('Stream validation failed - empty or invalid response', {
          ...context,
          attemptNumber,
          currentModelId,
          error: validationError instanceof Error ? validationError.message : String(validationError),
        });
        throw validationError;
      }

      // Success!
      apiLogger.info('Stream attempt succeeded', {
        ...context,
        attemptNumber,
        currentModelId,
        totalAttempts: attemptNumber,
        hadRetries: attemptNumber > 1,
      });

      return {
        success: true,
        result,
        metadata: {
          totalAttempts: attemptNumber,
          retryHistory,
          originalModel: originalModelId,
          finalModel: currentModelId,
          modelSwitched: currentModelId !== originalModelId,
        },
      };
    } catch (error) {
      // Classify the error using existing error handler
      const classified = classifyOpenRouterError(error);

      apiLogger.warn('Stream attempt failed', {
        ...context,
        attemptNumber,
        currentModelId,
        errorType: classified.type,
        errorMessage: classified.message,
        isTransient: classified.isTransient,
        shouldRetry: classified.shouldRetry,
        remainingAttempts: MAX_RETRY_ATTEMPTS - attemptNumber,
      });

      // Record this attempt in history
      const attemptMetadata: RetryAttemptMetadata = {
        attemptNumber,
        modelId: currentModelId,
        error: classified,
        timestamp: new Date().toISOString(),
        delayMs: 0,
      };
      retryHistory.push(attemptMetadata);

      // Check if this is the last attempt
      const isLastAttempt = attemptNumber >= MAX_RETRY_ATTEMPTS;

      // ✅ USER REQUIREMENT: ALWAYS retry all 10 attempts, regardless of error type
      // Do NOT exit early based on isTransient or shouldRetry flags
      // Only exit after exhausting all 10 attempts
      if (isLastAttempt) {
        apiLogger.error('Stream failed after exhausting all retry attempts', {
          ...context,
          attemptNumber,
          currentModelId,
          errorType: classified.type,
          isLastAttempt,
          isTransient: classified.isTransient,
          shouldRetry: classified.shouldRetry,
          totalAttempts: attemptNumber,
          userRequirement: 'Must retry 10 times for ANY error type',
        });

        return {
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
          metadata: {
            totalAttempts: attemptNumber,
            retryHistory,
            originalModel: originalModelId,
            finalModel: currentModelId,
            modelSwitched: currentModelId !== originalModelId,
          },
        };
      }

      // Calculate retry delay
      const retryDelay = calculateRetryDelay(classified.type, attempt);
      attemptMetadata.delayMs = retryDelay;

      apiLogger.info('Retrying stream attempt', {
        ...context,
        attemptNumber,
        nextAttemptNumber: attemptNumber + 1,
        retryDelayMs: retryDelay,
        currentModelId,
      });

      // Wait before retrying
      if (retryDelay > 0) {
        await sleep(retryDelay);
      }

      // On 3rd+ attempt, consider switching to fallback model
      // This gives the original model 2 chances before falling back
      if (attempt >= 2 && !fallbacksLoaded) {
        // Load fallback models (only once)
        fallbackModels = await getFallbackModels(originalModelId, userTier);
        fallbacksLoaded = true;
      }

      // If we have fallback models and we're on attempt 3+, try them
      if (fallbackModels.length > 0 && attempt >= 2) {
        // Calculate which fallback to use (rotate through available fallbacks)
        const fallbackIndex = Math.min(attempt - 2, fallbackModels.length - 1);
        const fallbackModel = fallbackModels[fallbackIndex];

        if (fallbackModel && fallbackModel !== currentModelId) {
          apiLogger.info('Switching to fallback model', {
            ...context,
            attemptNumber: attemptNumber + 1,
            originalModel: originalModelId,
            previousModel: currentModelId,
            fallbackModel,
            fallbackIndex,
            availableFallbacks: fallbackModels.length,
          });

          currentModelId = fallbackModel;
        }
      }

      // Continue to next attempt
    }
  }

  // Should never reach here (loop exits via return), but TypeScript needs this
  const finalError = retryHistory[retryHistory.length - 1]?.error;
  return {
    success: false,
    error: new Error(finalError?.message || 'All retry attempts exhausted'),
    metadata: {
      totalAttempts: MAX_RETRY_ATTEMPTS,
      retryHistory,
      originalModel: originalModelId,
      finalModel: currentModelId,
      modelSwitched: currentModelId !== originalModelId,
    },
  };
}
