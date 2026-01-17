/**
 * Toast Notification Utilities - SINGLE SOURCE OF TRUTH
 *
 * All application code should import toast functionality from this barrel.
 *
 * Architecture:
 * - `@/hooks/utils/use-toast` - Low-level primitives (internal use by Toaster component only)
 * - `@/lib/toast` (this file) - Application-facing API (what you should use)
 *
 * Key Principles:
 * 1. For API errors, use showApiErrorToast() - auto-extracts backend error messages
 * 2. For success messages, use showApiSuccessToast()
 * 3. For warnings, use showApiWarningToast()
 * 4. For info messages, use showApiInfoToast()
 * 5. For loading states, use showApiLoadingToast()
 * 6. For advanced patterns (undo, retry, progress), use toastManager directly
 *
 * @example API Error Handling
 * ```typescript
 * import { showApiErrorToast, showApiSuccessToast } from '@/lib/toast';
 *
 * try {
 *   await api.createThread(data);
 *   showApiSuccessToast('Thread created successfully');
 * } catch (error) {
 *   showApiErrorToast('Failed to create thread', error);
 * }
 * ```
 *
 * @example Advanced toastManager patterns
 * ```typescript
 * import { toastManager } from '@/lib/toast';
 *
 * // Undo action
 * toastManager.undo('Item deleted', () => restoreItem());
 *
 * // Progress toast
 * const progress = toastManager.progress({ title: 'Uploading...' });
 * progress.updateProgress(50);
 * progress.complete();
 * ```
 */

// ============================================================================
// API ERROR TOAST HELPERS - Recommended for most use cases
// ============================================================================

export {
  clearAllToasts,
  showApiErrorToast,
  showApiErrorWithRetry,
  showApiInfoToast,
  showApiLoadingToast,
  showApiSuccessToast,
  showApiWarningToast,
} from './api-error-toast';

// ============================================================================
// TOAST MANAGER - Advanced patterns (undo, retry, progress, promise)
// ============================================================================

export { dismissToast, toastManager } from './toast-manager';

// Re-export types for consumers who need them
export type { ProgressToastOptions, ToastOptions } from './toast-manager';
