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
 */
export const ErrorMetadataSchema = z.object({
  errorCategory: ErrorCategorySchema.optional(),
  statusCode: z.number().int().min(100).max(599).optional(),
  rawErrorMessage: z.string().optional(),
  openRouterError: z.string().optional(),
  openRouterCode: z.string().optional(),
  providerMessage: z.string().optional(),
  isTransient: z.boolean().optional(),
  shouldRetry: z.boolean().optional(),
  retryAfter: z.number().optional(),
  modelId: z.string().optional(),
  participantId: z.string().optional(),
  roundNumber: z.number().int().positive().optional(),
});

export type ErrorMetadata = z.infer<typeof ErrorMetadataSchema>;

// ============================================================================
// ANALYSIS STATUS ENUM
// ============================================================================

/**
 * ✅ Analysis status enum - Moderator analysis states
 * Replaces hardcoded status strings in analysis handlers
 */
export const AnalysisStatusSchema = z.enum([
  'pending',
  'streaming',
  'completed',
  'failed',
]);

export type AnalysisStatus = z.infer<typeof AnalysisStatusSchema>;

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
export function isUIMessageErrorType(value: unknown): value is UIMessageErrorType {
  return UIMessageErrorTypeSchema.safeParse(value).success;
}

/**
 * ✅ MAPPER: Map error category to UI message error type
 * Provides consistent mapping between backend categories and frontend display types
 */
export function errorCategoryToUIType(category: ErrorCategory): UIMessageErrorType {
  const mapping: Record<ErrorCategory, UIMessageErrorType> = {
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
export function createPartialErrorMetadata(data: Partial<ErrorMetadata>): Partial<ErrorMetadata> {
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

  if (errorLower.includes('not found') || errorLower.includes('does not exist')) {
    return ErrorCategorySchema.enum.model_not_found;
  }
  if (errorLower.includes('filter') || errorLower.includes('safety') || errorLower.includes('moderation')) {
    return ErrorCategorySchema.enum.content_filter;
  }
  if (errorLower.includes('rate limit') || errorLower.includes('quota')) {
    return ErrorCategorySchema.enum.rate_limit;
  }
  if (errorLower.includes('timeout') || errorLower.includes('connection')) {
    return ErrorCategorySchema.enum.network;
  }
  if (errorLower.includes('unauthorized') || errorLower.includes('authentication')) {
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
  };

  return messages[category] || messages.unknown;
}
