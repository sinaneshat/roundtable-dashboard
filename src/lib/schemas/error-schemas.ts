/**
 * Error Schemas - Single Source of Truth for Error Types
 *
 * ✅ SINGLE SOURCE OF TRUTH: All error categories and types
 *
 * Consolidates error-related schemas to replace hardcoded strings and duplicate type definitions.
 * All error categorization and types should be derived from these schemas.
 *
 * @see /docs/backend-patterns.md - Zero-casting principle
 * @see ZOD_INFERENCE_REFACTORING_PLAN.md - Phase 2.1
 */

import { z } from 'zod';

// ============================================================================
// ANALYSIS STATUS ENUM - RE-EXPORT FROM SINGLE SOURCE OF TRUTH
// ============================================================================

/**
 * ✅ Analysis status enum - Moderator analysis states
 * Single source of truth: @/api/core/enums
 * Uses 'complete' (not 'completed') for consistency with backend
 */
export {
  ANALYSIS_STATUSES,
  type AnalysisStatus,
  AnalysisStatuses,
  AnalysisStatusSchema,
} from '@/api/core/enums';

// ============================================================================
// ERROR CATEGORIES
// ============================================================================

/**
 * ✅ Error category enum - All possible error categories
 * Replaces hardcoded strings like 'model_not_found', 'content_filter', etc.
 *
 * Used by:
 * - Backend: Error categorization in helpers.ts
 * - Frontend: Error display and handling
 * - Streaming: Error extraction and metadata
 *
 * NOTE: Backend uses AIProviderErrorCategory which includes provider-specific
 * categories like 'provider_rate_limit', 'provider_network', 'model_content_filter'
 * These map to our categories via errorCategoryToUIType()
 */
export const ErrorCategorySchema = z.enum([
  'model_not_found',
  'content_filter',
  'rate_limit',
  'network',
  'provider_error',
  'validation',
  'authentication',
  'silent_failure',
  'empty_response',
  'unknown',
  // Backend-specific categories (from AIProviderErrorCategory)
  'provider_rate_limit',
  'provider_network',
  'model_content_filter',
]);

export type ErrorCategory = z.infer<typeof ErrorCategorySchema>;

// ============================================================================
// UI MESSAGE ERROR TYPES
// ============================================================================

/**
 * ✅ UI Message error types - Frontend error display types
 * Replaces the hardcoded UIMessageErrorType in message-transforms.ts
 *
 * Used by:
 * - Frontend: message-transforms.ts for error UI messages
 * - Backend: Error categorization for UI display
 */
export const UIMessageErrorTypeSchema = z.enum([
  'provider_rate_limit',
  'provider_network',
  'model_not_found',
  'model_content_filter',
  'authentication',
  'validation',
  'silent_failure',
  'empty_response',
  'backend_inconsistency', // Backend ID/metadata mismatch errors
  'failed',
  'unknown',
]);

export type UIMessageErrorType = z.infer<typeof UIMessageErrorTypeSchema>;

// ============================================================================
// ERROR METADATA
// ============================================================================

/**
 * ✅ Error metadata schema - Structured error context
 * Replaces loose typing in error metadata parameters
 *
 * Used by:
 * - Backend: Streaming error handling
 * - Frontend: Error display details
 *
 * NOTE: Schema is lenient to accept various backend error formats.
 * Backend's structureAIProviderError returns additional fields that we passthrough.
 */
export const ErrorMetadataSchema = z
  .object({
    // Core error identification
    errorName: z.string().optional(),
    errorType: z.string().optional(),
    errorCategory: ErrorCategorySchema.optional(),
    errorMessage: z.string().optional(),

    // HTTP details
    statusCode: z.number().int().min(100).max(599).optional(),

    // Raw error messages (for debugging)
    rawErrorMessage: z.string().optional(),
    providerMessage: z.string().optional(),

    // OpenRouter-specific fields
    openRouterError: z
      .union([z.string(), z.record(z.string(), z.unknown())])
      .optional(),
    openRouterCode: z.union([z.string(), z.number()]).optional(),
    openRouterType: z.string().optional(),
    openRouterMetadata: z.record(z.string(), z.unknown()).optional(),

    // Response details (for debugging)
    responseBody: z.string().optional(),
    requestId: z.string().optional(),
    traceId: z.string().optional(),

    // Retry behavior
    isTransient: z.boolean().optional(),
    shouldRetry: z.boolean().optional(),
    retryAfter: z.number().optional(),

    // Participant context
    modelId: z.string().optional(),
    participantId: z.string().optional(),
    participantRole: z.string().nullable().optional(),
    roundNumber: z.number().int().nonnegative().optional(), // ✅ 0-BASED: Allow round 0
  })
  .passthrough(); // ✅ Allow additional fields from backend

export type ErrorMetadata = z.infer<typeof ErrorMetadataSchema>;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * ✅ TYPE GUARD: Check if a value is a valid ErrorCategory
 */
export function isErrorCategory(value: unknown): value is ErrorCategory {
  return ErrorCategorySchema.safeParse(value).success;
}

/**
 * ✅ TYPE GUARD: Check if a value is a valid UIMessageErrorType
 */
export function isUIMessageErrorType(
  value: unknown,
): value is UIMessageErrorType {
  return UIMessageErrorTypeSchema.safeParse(value).success;
}

/**
 * ✅ MAPPER: Map error category to UI message error type
 * Provides consistent mapping between backend categories and frontend display types
 *
 * Handles both frontend-style categories (rate_limit, network) and
 * backend-style categories (provider_rate_limit, provider_network)
 */
export function errorCategoryToUIType(
  category: ErrorCategory,
): UIMessageErrorType {
  const mapping: Record<ErrorCategory, UIMessageErrorType> = {
    // Frontend-style categories
    model_not_found: 'model_not_found',
    content_filter: 'model_content_filter',
    rate_limit: 'provider_rate_limit',
    network: 'provider_network',
    provider_error: 'failed',
    validation: 'validation',
    authentication: 'authentication',
    silent_failure: 'silent_failure',
    empty_response: 'empty_response',
    unknown: 'unknown',
    // Backend-style categories (from AIProviderErrorCategory)
    provider_rate_limit: 'provider_rate_limit',
    provider_network: 'provider_network',
    model_content_filter: 'model_content_filter',
  };

  return mapping[category] || 'unknown';
}

/**
 * ✅ FACTORY: Create error metadata with validation
 */
export function createErrorMetadata(data: unknown): ErrorMetadata {
  return ErrorMetadataSchema.parse(data);
}

/**
 * ✅ FACTORY: Create partial error metadata (for updates)
 */
export function createPartialErrorMetadata(
  data: Partial<ErrorMetadata>,
): Partial<ErrorMetadata> {
  return ErrorMetadataSchema.partial().parse(data);
}

// ============================================================================
// ERROR CATEGORIZATION LOGIC
// ============================================================================

/**
 * ✅ UTILITY: Categorize error based on error message content
 * Replaces the hardcoded categorizeError function in helpers.ts
 * Now returns typed ErrorCategory instead of string
 */
export function categorizeErrorMessage(errorMessage: string): ErrorCategory {
  const errorLower = errorMessage.toLowerCase();

  if (
    errorLower.includes('not found')
    || errorLower.includes('does not exist')
  ) {
    return ErrorCategorySchema.enum.model_not_found;
  }
  if (
    errorLower.includes('filter')
    || errorLower.includes('safety')
    || errorLower.includes('moderation')
  ) {
    return ErrorCategorySchema.enum.content_filter;
  }
  if (errorLower.includes('rate limit') || errorLower.includes('quota')) {
    return ErrorCategorySchema.enum.rate_limit;
  }
  if (errorLower.includes('timeout') || errorLower.includes('connection')) {
    return ErrorCategorySchema.enum.network;
  }
  if (
    errorLower.includes('unauthorized')
    || errorLower.includes('authentication')
  ) {
    return ErrorCategorySchema.enum.authentication;
  }
  if (errorLower.includes('validation') || errorLower.includes('invalid')) {
    return ErrorCategorySchema.enum.validation;
  }

  return ErrorCategorySchema.enum.provider_error;
}

/**
 * ✅ UTILITY: Get human-readable error message for category
 */
export function getErrorCategoryMessage(category: ErrorCategory): string {
  const messages: Record<ErrorCategory, string> = {
    // Frontend-style categories
    model_not_found: 'The requested model could not be found',
    content_filter: 'Content was filtered by safety systems',
    rate_limit: 'Rate limit exceeded, please try again later',
    network: 'Network error occurred, please check your connection',
    provider_error: 'An error occurred with the AI provider',
    validation: 'Invalid request parameters',
    authentication: 'Authentication failed',
    silent_failure: 'The operation failed silently',
    empty_response: 'No response was generated',
    unknown: 'An unknown error occurred',
    // Backend-style categories (from AIProviderErrorCategory)
    provider_rate_limit: 'Rate limit exceeded, please try again later',
    provider_network: 'Network error occurred, please check your connection',
    model_content_filter: 'Content was filtered by safety systems',
  };

  return messages[category] || messages.unknown;
}
