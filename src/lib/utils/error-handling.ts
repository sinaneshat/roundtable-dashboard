/**
 * Error Handling Utilities
 *
 * Utilities for extracting detailed error messages from API responses
 * and formatting them for user-facing error messages (toasts, forms, etc.)
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
};

/**
 * Extract detailed error message from API error responses
 *
 * This function handles various error formats:
 * - Hono client errors with nested error objects
 * - Standard Error objects
 * - API error responses with { success: false, error: {...} }
 * - Validation errors with field-specific messages
 * - Plain strings
 *
 * @param error - Error object from API call
 * @returns Detailed error information
 *
 * @example
 * ```typescript
 * try {
 *   await createApiKey(data);
 * } catch (error) {
 *   const errorDetails = getApiErrorDetails(error);
 *   toast.error(errorDetails.message);
 *   // or show validation errors
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

  // Try to extract status code
  if (typeof errorObj.status === 'number') {
    result.status = errorObj.status;
  }

  // Handle Hono client error responses
  // Hono client throws errors that may contain the response body
  // Format: error has a 'message' property and potentially nested error details

  // Check if error has a response property (from fetch)
  if (errorObj.response && typeof errorObj.response === 'object') {
    const response = errorObj.response as Record<string, unknown>;

    // Try to extract status from response
    if (typeof response.status === 'number' && !result.status) {
      result.status = response.status;
    }
  }

  // Check for API error response format: { success: false, error: { code, message, ... } }
  if (errorObj.error && typeof errorObj.error === 'object') {
    const apiError = errorObj.error as Record<string, unknown>;

    // Extract error message
    if (typeof apiError.message === 'string' && apiError.message.length > 0) {
      result.message = apiError.message;
    }

    // Extract error code
    if (typeof apiError.code === 'string' && apiError.code.length > 0) {
      result.code = apiError.code;
    }

    // Extract validation errors
    if (Array.isArray(apiError.validation)) {
      result.validationErrors = apiError.validation
        .filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null)
        .map(v => ({
          field: typeof v.field === 'string' ? v.field : 'unknown',
          message: typeof v.message === 'string' ? v.message : 'Validation failed',
          code: typeof v.code === 'string' ? v.code : undefined,
        }));
    }

    // Extract error context/details
    if (apiError.context !== undefined) {
      result.details = apiError.context;
    }
  } else if (typeof errorObj.message === 'string' && errorObj.message.length > 0) {
    // Fallback: Check for direct message property on error object
    result.message = errorObj.message;

    // Extract code if available at top level
    if (typeof errorObj.code === 'string' && errorObj.code.length > 0) {
      result.code = errorObj.code;
    }
  } else if (typeof errorObj.statusText === 'string' && errorObj.statusText.length > 0) {
    // Check for statusText as fallback message
    result.message = errorObj.statusText;
  }

  // Add status code to message if available and message is generic
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
 * @returns Error message string
 *
 * @example
 * ```typescript
 * try {
 *   await createApiKey(data);
 * } catch (error) {
 *   toast.error('Failed to create API key', getApiErrorMessage(error));
 * }
 * ```
 */
export function getApiErrorMessage(error: unknown, fallback = 'An unknown error occurred'): string {
  const details = getApiErrorDetails(error);
  return details.message || fallback;
}

/**
 * Format validation errors into a readable string
 *
 * @param validationErrors - Array of validation errors
 * @returns Formatted error message string
 */
export function formatValidationErrors(
  validationErrors: Array<{ field: string; message: string }>,
): string {
  if (!validationErrors || validationErrors.length === 0) {
    return 'Validation failed';
  }

  if (validationErrors.length === 1) {
    return validationErrors[0].message;
  }

  return validationErrors.map(err => `${err.field}: ${err.message}`).join('; ');
}
