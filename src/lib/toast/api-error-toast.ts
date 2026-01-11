/**
 * Unified API Error Toast System - SINGLE SOURCE OF TRUTH
 *
 * This is the ONLY way to handle API errors and display toast messages across the entire application.
 * It properly extracts backend error messages and displays them consistently.
 *
 * Backend Error Format (from /api/common/error-handling.ts):
 * ```
 * {
 *   success: false,
 *   error: {
 *     code: "VALIDATION_ERROR" | "UNAUTHENTICATED" | etc.,
 *     message: "Human-readable error message",
 *     details?: unknown,
 *     context?: ErrorContext,
 *     validation?: Array<{ field: string, message: string, code?: string }>
 *   },
 *   meta?: {
 *     requestId?: string,
 *     timestamp?: string,
 *     correlationId?: string
 *   }
 * }
 * ```
 *
 * @example
 * ```typescript
 * import { showApiErrorToast } from '@/lib/toast/api-error-toast';
 *
 * try {
 *   await createThread(data);
 * } catch (error) {
 *   showApiErrorToast('Failed to create thread', error);
 * }
 * ```
 */

import { getApiErrorDetails } from '@/lib/utils';

import { toastManager } from './toast-manager';

/**
 * ✅ SINGLE UNIFIED API ERROR TOAST FUNCTION
 *
 * This is the ONLY function you should use to display API errors.
 * It automatically extracts the proper error message from the backend response.
 *
 * @param title - The title of the error toast (e.g., "Failed to create thread")
 * @param error - The error object from the API call
 * @param options - Optional toast options
 * @param options.duration - Duration in milliseconds for the toast to display
 * @param options.action - Optional action button configuration
 * @param options.action.label - Label for the action button
 * @param options.action.onClick - Click handler for the action button
 *
 * @example
 * ```typescript
 * try {
 *   await api.createThread(data);
 * } catch (error) {
 *   showApiErrorToast('Failed to create thread', error);
 * }
 * ```
 *
 * @example With validation errors
 * ```typescript
 * try {
 *   await api.createThread(data);
 * } catch (error) {
 *   const toastId = showApiErrorToast('Failed to create thread', error);
 *   // Optionally handle validation errors separately
 *   const details = getApiErrorDetails(error);
 *   if (details.validationErrors) {
 *     details.validationErrors.forEach(err => {
 *       form.setError(err.field, { message: err.message });
 *     });
 *   }
 * }
 * ```
 */
export function showApiErrorToast(
  title: string,
  error: unknown,
  options?: {
    duration?: number;
    action?: {
      label: string;
      onClick: () => void;
    };
  },
): string {
  // Extract detailed error information from API response
  const errorDetails = getApiErrorDetails(error);

  // Build description from error message
  let description = errorDetails.message;

  // If we have validation errors, format them nicely
  if (errorDetails.validationErrors && errorDetails.validationErrors.length > 0) {
    if (errorDetails.validationErrors.length === 1) {
      const firstError = errorDetails.validationErrors[0];
      description = firstError?.message || description;
    } else {
      const validationMessages = errorDetails.validationErrors
        .map(err => `• ${err.field}: ${err.message}`)
        .join('\n');
      description = `${description}\n\n${validationMessages}`;
    }
  }

  // Add error code to description if available (for debugging)
  if (errorDetails.code && process.env.NODE_ENV === 'development') {
    description = `${description}\n\n(Error Code: ${errorDetails.code})`;
  }

  // Show error toast using toast manager
  return toastManager.error(title, description, {
    duration: options?.duration || 8000, // Longer duration for errors
    action: options?.action,
  });
}

/**
 * ✅ SHOW API SUCCESS TOAST
 *
 * Convenience function for showing success messages.
 * Use this for consistent success messaging across the app.
 *
 * @param title - The title of the success toast
 * @param description - Optional description
 * @param options - Optional toast options
 * @param options.duration - Duration in milliseconds for the toast to display
 * @param options.action - Optional action button configuration
 * @param options.action.label - Label for the action button
 * @param options.action.onClick - Click handler for the action button
 *
 * @example
 * ```typescript
 * try {
 *   await api.createThread(data);
 *   showApiSuccessToast('Thread created successfully');
 * } catch (error) {
 *   showApiErrorToast('Failed to create thread', error);
 * }
 * ```
 */
export function showApiSuccessToast(
  title: string,
  description?: string,
  options?: {
    duration?: number;
    action?: {
      label: string;
      onClick: () => void;
    };
  },
): string {
  return toastManager.success(title, description, {
    duration: options?.duration || 5000,
    action: options?.action,
  });
}

/**
 * ✅ SHOW API WARNING TOAST
 *
 * Use this for non-critical warnings that don't require user action.
 *
 * @param title - The title of the warning toast
 * @param description - Optional description
 * @param options - Optional toast options
 * @param options.duration - Duration in milliseconds for the toast to display
 * @param options.action - Optional action button configuration
 * @param options.action.label - Label for the action button
 * @param options.action.onClick - Click handler for the action button
 */
export function showApiWarningToast(
  title: string,
  description?: string,
  options?: {
    duration?: number;
    action?: {
      label: string;
      onClick: () => void;
    };
  },
): string {
  return toastManager.warning(title, description, {
    duration: options?.duration || 6000,
    action: options?.action,
  });
}

/**
 * ✅ SHOW API INFO TOAST
 *
 * Use this for informational messages.
 *
 * @param title - The title of the info toast
 * @param description - Optional description
 * @param options - Optional toast options
 * @param options.duration - Duration in milliseconds for the toast to display
 * @param options.action - Optional action button configuration
 * @param options.action.label - Label for the action button
 * @param options.action.onClick - Click handler for the action button
 */
export function showApiInfoToast(
  title: string,
  description?: string,
  options?: {
    duration?: number;
    action?: {
      label: string;
      onClick: () => void;
    };
  },
): string {
  return toastManager.info(title, description, {
    duration: options?.duration || 5000,
    action: options?.action,
  });
}

/**
 * ✅ SHOW API LOADING TOAST
 *
 * Use this for showing loading state during async operations.
 * Returns a toast ID that can be used to dismiss the toast later.
 *
 * @param title - The title of the loading toast
 * @param description - Optional description
 *
 * @example
 * ```typescript
 * const loadingId = showApiLoadingToast('Creating thread', 'Please wait...');
 * try {
 *   await api.createThread(data);
 *   toastManager.dismiss(loadingId);
 *   showApiSuccessToast('Thread created successfully');
 * } catch (error) {
 *   toastManager.dismiss(loadingId);
 *   showApiErrorToast('Failed to create thread', error);
 * }
 * ```
 */
export function showApiLoadingToast(title: string, description?: string): string {
  return toastManager.loading(title, description);
}

/**
 * ✅ SHOW API ERROR WITH RETRY
 *
 * Special error toast that includes a retry button.
 * Use this when you want to give users the option to retry a failed operation.
 *
 * @param title - The title of the error toast
 * @param error - The error object from the API call
 * @param onRetry - Callback function to retry the operation
 * @param options - Optional toast options
 * @param options.duration - Duration in milliseconds for the toast to display
 *
 * @example
 * ```typescript
 * try {
 *   await api.createThread(data);
 * } catch (error) {
 *   showApiErrorWithRetry('Failed to create thread', error, () => {
 *     // Retry logic
 *     handleCreateThread();
 *   });
 * }
 * ```
 */
export function showApiErrorWithRetry(
  title: string,
  error: unknown,
  onRetry: () => void,
  options?: {
    duration?: number;
  },
): string {
  const errorDetails = getApiErrorDetails(error);

  return toastManager.retry(title, onRetry, {
    description: errorDetails.message,
    duration: options?.duration || 10000, // Longer duration for retry toasts
  });
}

/**
 * ✅ HELPER: Clear all active toasts
 */
export function clearAllToasts(): void {
  toastManager.clear();
}
