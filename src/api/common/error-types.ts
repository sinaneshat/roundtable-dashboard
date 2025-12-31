/**
 * Type-safe error extraction utilities
 *
 * **PURPOSE**: Eliminate unsafe type casting for error objects
 * **REPLACES**: `error as Error & { statusCode?: number }` patterns
 * **PATTERN**: Type guards + discriminated unions from type-inference-patterns.md
 *
 * Reference: /docs/type-inference-patterns.md - Anti-Patterns section
 */

import { z } from 'zod';

// ============================================================================
// Error Shape Schemas (Runtime Validation)
// ============================================================================

/**
 * AI SDK Error Schema
 * Covers errors from streamText(), generateText(), and AI SDK operations
 */
export const AISdkErrorSchema = z.object({
  name: z.string().optional(),
  message: z.string(),
  statusCode: z.number().optional(),
  responseBody: z.string().optional(),
  cause: z.unknown().optional(),
  stack: z.string().optional(),
});

export type AISdkError = z.infer<typeof AISdkErrorSchema>;

/**
 * Network/HTTP Error Schema
 * Covers fetch failures, HTTP errors, and network issues
 * Internal only - used by extractNetworkError
 */
const NetworkErrorSchema = z.object({
  message: z.string(),
  statusCode: z.number().optional(),
  status: z.number().optional(),
  statusText: z.string().optional(),
  code: z.string().optional(),
  cause: z.unknown().optional(),
  stack: z.string().optional(),
});

type NetworkError = z.infer<typeof NetworkErrorSchema>;

/**
 * Generic Error Schema
 * Fallback for standard Error objects
 * Internal only - used by extractGenericError
 */
const GenericErrorSchema = z.object({
  message: z.string(),
  name: z.string().optional(),
  stack: z.string().optional(),
  cause: z.unknown().optional(),
});

type GenericError = z.infer<typeof GenericErrorSchema>;

// ============================================================================
// Type-Safe Error Extraction Functions
// ============================================================================

/**
 * Extract error information from AI SDK errors
 *
 * **REPLACES**: `error as Error & { statusCode?: number; responseBody?: string; name?: string }`
 *
 * @param error - Unknown error object
 * @returns Type-safe AISdkError or null
 *
 * @example
 * ```typescript
 * const aiError = extractAISdkError(error);
 * if (aiError?.statusCode === 401) {
 *   // Handle authentication error
 * }
 * ```
 */
export function extractAISdkError(error: unknown): AISdkError | null {
  const result = AISdkErrorSchema.safeParse(error);
  return result.success ? result.data : null;
}

/**
 * Extract error information from network/HTTP errors
 * Internal only - used by getErrorStatusCode
 */
function extractNetworkError(error: unknown): NetworkError | null {
  const result = NetworkErrorSchema.safeParse(error);
  return result.success ? result.data : null;
}

/**
 * Extract basic error information (always succeeds)
 * Internal only - used by getErrorMessage and getErrorName
 */
function extractGenericError(error: unknown): GenericError {
  // Try to parse as error object
  const result = GenericErrorSchema.safeParse(error);
  if (result.success) {
    return result.data;
  }

  // Fallback: Convert to string
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
      cause: 'cause' in error ? error.cause : undefined,
    };
  }

  if (typeof error === 'string') {
    return { message: error };
  }

  return { message: 'Unknown error' };
}

/**
 * Get error message safely (never throws, never returns undefined)
 *
 * **REPLACES**: `error instanceof Error ? error.message : 'Unknown error'`
 *
 * @param error - Unknown error object
 * @returns Error message string
 *
 * @example
 * ```typescript
 * const message = getErrorMessage(error);
 * c.logger.error(message); // Always safe
 * ```
 */
export function getErrorMessage(error: unknown): string {
  const extracted = extractGenericError(error);
  return extracted.message;
}

/**
 * Get error name safely
 *
 * @param error - Unknown error object
 * @returns Error name or undefined
 *
 * @example
 * ```typescript
 * const name = getErrorName(error);
 * if (name === 'AI_TypeValidationError') {
 *   // Don't retry validation errors
 * }
 * ```
 */
export function getErrorName(error: unknown): string | undefined {
  const aiError = extractAISdkError(error);
  if (aiError?.name) {
    return aiError.name;
  }

  const genericError = extractGenericError(error);
  return genericError.name;
}

/**
 * Get HTTP status code from error
 *
 * @param error - Unknown error object
 * @returns Status code or undefined
 *
 * @example
 * ```typescript
 * const statusCode = getErrorStatusCode(error);
 * if (statusCode === 401) {
 *   // Handle authentication error
 * }
 * ```
 */
export function getErrorStatusCode(error: unknown): number | undefined {
  const aiError = extractAISdkError(error);
  if (aiError?.statusCode) {
    return aiError.statusCode;
  }

  const networkError = extractNetworkError(error);
  return networkError?.statusCode || networkError?.status;
}
