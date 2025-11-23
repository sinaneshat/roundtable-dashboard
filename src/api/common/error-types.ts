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
 */
export const NetworkErrorSchema = z.object({
  message: z.string(),
  statusCode: z.number().optional(),
  status: z.number().optional(),
  statusText: z.string().optional(),
  code: z.string().optional(),
  cause: z.unknown().optional(),
  stack: z.string().optional(),
});

export type NetworkError = z.infer<typeof NetworkErrorSchema>;

/**
 * Generic Error Schema
 * Fallback for standard Error objects
 */
export const GenericErrorSchema = z.object({
  message: z.string(),
  name: z.string().optional(),
  stack: z.string().optional(),
  cause: z.unknown().optional(),
});

export type GenericError = z.infer<typeof GenericErrorSchema>;

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
 *
 * @param error - Unknown error object
 * @returns Type-safe NetworkError or null
 */
export function extractNetworkError(error: unknown): NetworkError | null {
  const result = NetworkErrorSchema.safeParse(error);
  return result.success ? result.data : null;
}

/**
 * Extract basic error information (always succeeds)
 *
 * @param error - Unknown error object
 * @returns Type-safe GenericError with at least a message
 *
 * @example
 * ```typescript
 * const err = extractGenericError(error);
 * console.error(err.message); // Always defined
 * ```
 */
export function extractGenericError(error: unknown): GenericError {
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

/**
 * Get error stack trace safely
 *
 * @param error - Unknown error object
 * @returns Stack trace or undefined
 */
export function getErrorStack(error: unknown): string | undefined {
  const extracted = extractGenericError(error);
  return extracted.stack;
}

/**
 * Get error cause (for chained errors)
 *
 * **REPLACES**: `(error as Error & { cause?: unknown }).cause`
 *
 * @param error - Unknown error object
 * @returns Error cause or undefined
 *
 * @example
 * ```typescript
 * const cause = getErrorCause(error);
 * if (cause) {
 *   console.error('Underlying cause:', cause);
 * }
 * ```
 */
export function getErrorCause(error: unknown): unknown | undefined {
  const extracted = extractGenericError(error);
  return extracted.cause;
}

/**
 * Check if error is an Error instance
 *
 * Type guard for Error objects
 *
 * @param error - Unknown value
 * @returns True if error is an Error instance
 */
export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

/**
 * Check if error has a specific name
 *
 * @param error - Unknown error object
 * @param name - Error name to check
 * @returns True if error has the specified name
 *
 * @example
 * ```typescript
 * if (hasErrorName(error, 'AI_TypeValidationError')) {
 *   // Don't retry
 * }
 * ```
 */
export function hasErrorName(error: unknown, name: string): boolean {
  const errorName = getErrorName(error);
  return errorName === name;
}

/**
 * Check if error has a specific status code
 *
 * @param error - Unknown error object
 * @param statusCode - Status code to check
 * @returns True if error has the specified status code
 *
 * @example
 * ```typescript
 * if (hasErrorStatusCode(error, 401)) {
 *   // Handle authentication error
 * }
 * ```
 */
export function hasErrorStatusCode(error: unknown, statusCode: number): boolean {
  const code = getErrorStatusCode(error);
  return code === statusCode;
}

// ============================================================================
// Error Information Object (for logging/debugging)
// ============================================================================

/**
 * Extract all error information into a structured object
 *
 * **PURPOSE**: Single function for comprehensive error extraction
 * **USE CASE**: Logging, debugging, error reporting
 *
 * @param error - Unknown error object
 * @returns Structured error information
 *
 * @example
 * ```typescript
 * const errorInfo = extractErrorInfo(error);
 * console.error('Full error details:', errorInfo);
 * ```
 */
export function extractErrorInfo(error: unknown): {
  message: string;
  name?: string;
  statusCode?: number;
  responseBody?: string;
  stack?: string;
  cause?: unknown;
  type: 'ai-sdk' | 'network' | 'generic';
} {
  // Try AI SDK error first
  const aiError = extractAISdkError(error);
  if (aiError) {
    return {
      message: aiError.message,
      name: aiError.name,
      statusCode: aiError.statusCode,
      responseBody: aiError.responseBody,
      stack: aiError.stack,
      cause: aiError.cause,
      type: 'ai-sdk',
    };
  }

  // Try network error
  const networkError = extractNetworkError(error);
  if (networkError) {
    return {
      message: networkError.message,
      statusCode: networkError.statusCode || networkError.status,
      stack: networkError.stack,
      cause: networkError.cause,
      type: 'network',
    };
  }

  // Fallback to generic
  const genericError = extractGenericError(error);
  return {
    message: genericError.message,
    name: genericError.name,
    stack: genericError.stack,
    cause: genericError.cause,
    type: 'generic',
  };
}
