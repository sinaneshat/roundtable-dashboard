/**
 * Error Schemas - Error Utilities and Metadata
 *
 * Provides error-specific utilities built on top of shared enums.
 * Import error enums/types directly from enums.
 *
 * @see /docs/backend-patterns.md - Zero-casting principle
 */

import { z } from 'zod';

import type { ErrorCategory, UIMessageErrorType } from '../../enums';
import { ErrorCategorySchema, UIMessageErrorTypeSchema } from '../../enums';

// ============================================================================
// ERROR METADATA
// ============================================================================

/**
 * Error metadata schema - Structured error context
 * Replaces loose typing in error metadata parameters
 *
 * Used by:
 * - Backend: Streaming error handling
 * - Frontend: Error display details
 *
 * NOTE: Schema is lenient to accept various backend error formats.
 * Backend's structureAIProviderError returns additional fields that we passthrough.
 */
export const ErrorMetadataSchema = z.object({
  // Explicit catch-all for external API fields (replaces passthrough)
  // Provider fields contain JSON-serializable values from external APIs
  additionalProviderFields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.unknown()), z.record(z.string(), z.unknown())])).optional(),
  errorCategory: ErrorCategorySchema.optional(),
  errorMessage: z.string().optional(),
  // Core error identification
  errorName: z.string().optional(),

  errorType: z.string().optional(),

  // Retry behavior
  isTransient: z.boolean().optional(),
  // Participant context
  modelId: z.string().optional(),

  openRouterCode: z.union([z.string(), z.number()]).optional(),
  // OpenRouter-specific fields
  // Note: OpenRouter error responses have variable structure, using union for flexibility
  openRouterError: z
    .union([z.string(), z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))])
    .optional(),
  // OpenRouter metadata contains provider-specific fields that vary per error
  openRouterMetadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  openRouterType: z.string().optional(),

  participantId: z.string().optional(),
  participantRole: z.string().nullable().optional(),
  providerMessage: z.string().optional(),

  // Raw error messages (for debugging)
  rawErrorMessage: z.string().optional(),
  requestId: z.string().optional(),
  // Response details (for debugging)
  responseBody: z.string().optional(),

  retryAfter: z.number().optional(),
  roundNumber: z.number().int().nonnegative().optional(), // 0-BASED: Allow round 0
  shouldRetry: z.boolean().optional(),
  // HTTP details
  statusCode: z.number().int().min(100).max(599).optional(),

  traceId: z.string().optional(),
});

export type ErrorMetadata = z.infer<typeof ErrorMetadataSchema>;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * TYPE GUARD: Check if a value is a valid ErrorCategory
 */
export function isErrorCategory(value: unknown): value is ErrorCategory {
  return ErrorCategorySchema.safeParse(value).success;
}

/**
 * TYPE GUARD: Check if a value is a valid UIMessageErrorType
 */
export function isUIMessageErrorType(
  value: unknown,
): value is UIMessageErrorType {
  return UIMessageErrorTypeSchema.safeParse(value).success;
}

/**
 * MAPPER: Map error category to UI message error type
 * Provides consistent mapping between backend categories and frontend display types
 *
 * Handles both frontend-style categories (rate_limit, network) and
 * backend-style categories (provider_rate_limit, provider_network)
 */
export function errorCategoryToUIType(
  category: ErrorCategory,
): UIMessageErrorType {
  const mapping: Record<ErrorCategory, UIMessageErrorType> = {
    authentication: 'authentication',
    content_filter: 'model_content_filter',
    empty_response: 'empty_response',
    model_content_filter: 'model_content_filter',
    // Frontend-style categories
    model_not_found: 'model_not_found',
    network: 'provider_network',
    provider_error: 'failed',
    provider_network: 'provider_network',
    // Backend-style categories (from AIProviderErrorCategory)
    provider_rate_limit: 'provider_rate_limit',
    rate_limit: 'provider_rate_limit',
    silent_failure: 'silent_failure',
    unknown: 'unknown',
    validation: 'validation',
  };

  return mapping[category] || 'unknown';
}

/**
 * FACTORY: Create error metadata with validation
 */
export function createErrorMetadata(data: unknown): ErrorMetadata {
  return ErrorMetadataSchema.parse(data);
}

/**
 * FACTORY: Create partial error metadata (for updates)
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
 * UTILITY: Categorize error based on error message content
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
 * UTILITY: Get human-readable error message for category
 */
export function getErrorCategoryMessage(category: ErrorCategory): string {
  const defaultMessage = 'An unknown error occurred';

  const messages: Record<ErrorCategory, string> = {
    authentication: 'Authentication failed',
    content_filter: 'Content was filtered by safety systems',
    empty_response: 'No response was generated',
    model_content_filter: 'Content was filtered by safety systems',
    // Frontend-style categories
    model_not_found: 'The requested model could not be found',
    network: 'Network error occurred, please check your connection',
    provider_error: 'An error occurred with the AI provider',
    provider_network: 'Network error occurred, please check your connection',
    // Backend-style categories (from AIProviderErrorCategory)
    provider_rate_limit: 'Rate limit exceeded, please try again later',
    rate_limit: 'Rate limit exceeded, please try again later',
    silent_failure: 'The operation failed silently',
    unknown: defaultMessage,
    validation: 'Invalid request parameters',
  };

  return messages[category] ?? defaultMessage;
}
