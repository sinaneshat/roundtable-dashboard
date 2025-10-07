/**
 * Error Handling Utilities - API Error Extraction and Display
 *
 * Provides utilities for extracting and displaying error messages from API responses.
 * All error structures are based on the backend API error format defined in @/api/core/schemas.ts
 *
 * Backend API Error Format:
 * ```typescript
 * {
 *   success: false,
 *   error: {
 *     code: string,              // e.g., "VALIDATION_ERROR", "UNAUTHENTICATED"
 *     message: string,           // Human-readable error message
 *     details?: unknown,         // Optional additional details
 *     context?: ErrorContext,    // Type-safe error context
 *     validation?: Array<{       // Optional validation errors
 *       field: string,
 *       message: string,
 *       code?: string
 *     }>
 *   },
 *   meta?: {
 *     requestId?: string,
 *     timestamp?: string,
 *     correlationId?: string
 *   }
 * }
 * ```
 */

/**
 * Extracted error information from API responses
 */
export type ApiErrorDetails = {
  /** Main error message */
  message: string;
  /** Error code (if available) */
  code?: string;
  /** HTTP status code (if available) */
  status?: number;
  /** Validation errors (if any) */
  validationErrors?: Array<{
    field: string;
    message: string;
    code?: string;
  }>;
  /** Additional error details */
  details?: unknown;
  /** Request metadata */
  meta?: {
    requestId?: string;
    timestamp?: string;
    correlationId?: string;
  };
};

/**
 * Extract detailed error message from API error responses
 *
 * This function handles the standardized backend API error format.
 * It extracts error messages, codes, validation errors, and metadata
 * from API responses that follow the pattern defined in @/api/core/schemas.ts
 *
 * @param error - Error object from API call (typically from Hono client)
 * @returns Detailed error information
 *
 * @example
 * ```typescript
 * try {
 *   await createApiKey(data);
 * } catch (error) {
 *   const errorDetails = getApiErrorDetails(error);
 *   toast({
 *     variant: 'destructive',
 *     title: 'Failed to create API key',
 *     description: errorDetails.message,
 *   });
 *
 *   // Handle validation errors
 *   if (errorDetails.validationErrors) {
 *     errorDetails.validationErrors.forEach(err => {
 *       form.setError(err.field, { message: err.message });
 *     });
 *   }
 * }
 * ```
 */
export function getApiErrorDetails(error: unknown): ApiErrorDetails {
  // Handle null/undefined
  if (!error) {
    return { message: 'An unknown error occurred' };
  }

  // Handle string errors
  if (typeof error === 'string') {
    return { message: error };
  }

  // Handle non-object errors
  if (typeof error !== 'object') {
    return { message: String(error) };
  }

  const errorObj = error as Record<string, unknown>;
  const result: ApiErrorDetails = {
    message: 'An unknown error occurred',
  };

  // Try to extract HTTP status code from error object
  if (typeof errorObj.status === 'number') {
    result.status = errorObj.status;
  }

  // Try to extract status from nested response object (Hono client errors)
  if (errorObj.response && typeof errorObj.response === 'object') {
    const response = errorObj.response as Record<string, unknown>;
    if (typeof response.status === 'number' && !result.status) {
      result.status = response.status;
    }
  }

  // PRIMARY: Check for standardized API error response format
  // Format: { success: false, error: { code, message, context, validation }, meta }
  if (errorObj.error && typeof errorObj.error === 'object') {
    const apiError = errorObj.error as Record<string, unknown>;

    // Extract error message (REQUIRED field in API error format)
    if (typeof apiError.message === 'string' && apiError.message.length > 0) {
      result.message = apiError.message;
    }

    // Extract error code (e.g., "VALIDATION_ERROR", "UNAUTHENTICATED")
    if (typeof apiError.code === 'string' && apiError.code.length > 0) {
      result.code = apiError.code;
    }

    // Extract validation errors array
    if (Array.isArray(apiError.validation)) {
      result.validationErrors = apiError.validation
        .filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null)
        .map(v => ({
          field: typeof v.field === 'string' ? v.field : 'unknown',
          message: typeof v.message === 'string' ? v.message : 'Validation failed',
          code: typeof v.code === 'string' ? v.code : undefined,
        }));
    }

    // Extract additional error details
    if (apiError.details !== undefined) {
      result.details = apiError.details;
    }

    // Extract error context (type-safe discriminated union in backend)
    // This is available for debugging but not typically shown to users
    if (apiError.context && typeof apiError.context === 'object') {
      // Context is available in result.details for advanced error handling
      result.details = result.details || apiError.context;
    }
  }

  // FALLBACK: Check for direct message property (non-API standard errors)
  if (result.message === 'An unknown error occurred' && typeof errorObj.message === 'string' && errorObj.message.length > 0) {
    // Filter out generic "HTTP error!" messages from Hono client
    if (!errorObj.message.startsWith('HTTP error!')) {
      result.message = errorObj.message;
    }

    // Extract code if available at top level
    if (typeof errorObj.code === 'string' && errorObj.code.length > 0) {
      result.code = errorObj.code;
    }
  }

  // FALLBACK: Check for statusText as last resort
  if (result.message === 'An unknown error occurred' && typeof errorObj.statusText === 'string' && errorObj.statusText.length > 0) {
    result.message = errorObj.statusText;
  }

  // Extract metadata from API error response
  if (errorObj.meta && typeof errorObj.meta === 'object') {
    const meta = errorObj.meta as Record<string, unknown>;
    result.meta = {
      requestId: typeof meta.requestId === 'string' ? meta.requestId : undefined,
      timestamp: typeof meta.timestamp === 'string' ? meta.timestamp : undefined,
      correlationId: typeof meta.correlationId === 'string' ? meta.correlationId : undefined,
    };
  }

  // Add status code to message if available and message is still generic
  if (result.status && result.message === 'An unknown error occurred') {
    result.message = `Request failed with status ${result.status}`;
  }

  return result;
}

/**
 * Get a simple error message string from an error object
 * This is a convenience wrapper around getApiErrorDetails for simple cases
 *
 * @param error - Error object from API call
 * @param fallback - Fallback message if no error message can be extracted
 * @returns Error message string suitable for toast display
 *
 * @example
 * ```typescript
 * try {
 *   await createApiKey(data);
 * } catch (error) {
 *   toast({
 *     variant: 'destructive',
 *     title: 'Failed to create API key',
 *     description: getApiErrorMessage(error),
 *   });
 * }
 * ```
 */
export function getApiErrorMessage(error: unknown, fallback = 'An unknown error occurred'): string {
  const details = getApiErrorDetails(error);
  return details.message || fallback;
}

/**
 * Format validation errors into a readable string
 * Useful for displaying multiple validation errors in a single toast
 *
 * @param validationErrors - Array of validation errors
 * @returns Formatted error message string
 *
 * @example
 * ```typescript
 * const errorDetails = getApiErrorDetails(error);
 * if (errorDetails.validationErrors && errorDetails.validationErrors.length > 0) {
 *   const message = formatValidationErrors(errorDetails.validationErrors);
 *   toast({
 *     variant: 'destructive',
 *     title: 'Validation failed',
 *     description: message,
 *   });
 * }
 * ```
 */
export function formatValidationErrors(
  validationErrors: Array<{ field: string; message: string }>,
): string {
  if (!validationErrors || validationErrors.length === 0) {
    return 'Validation failed';
  }

  if (validationErrors.length === 1) {
    const firstError = validationErrors[0];
    return firstError ? firstError.message : 'Validation failed';
  }

  return validationErrors.map(err => `${err.field}: ${err.message}`).join('; ');
}

/**
 * Show an error toast with proper API error extraction
 * This is a convenience wrapper that combines error extraction with toast display
 *
 * @param toast - Toast function from useToast or toastManager
 * @param title - Toast title
 * @param error - Error object from API call
 * @param fallbackMessage - Fallback message if error extraction fails
 *
 * @example
 * ```typescript
 * import { toast } from '@/components/ui/use-toast';
 * import { showErrorToast } from '@/lib/utils/error-handling';
 *
 * try {
 *   await createApiKey(data);
 * } catch (error) {
 *   showErrorToast(toast, 'Failed to create API key', error);
 * }
 * ```
 */
export function showErrorToast(
  toast: (options: {
    variant?: 'default' | 'destructive';
    title?: string;
    description?: string;
  }) => void,
  title: string,
  error: unknown,
  fallbackMessage?: string,
): void {
  const errorMessage = getApiErrorMessage(error, fallbackMessage);
  toast({
    variant: 'destructive',
    title,
    description: errorMessage,
  });
}
