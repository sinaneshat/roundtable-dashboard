/**
 * Toast Notification Utilities
 *
 * ✅ SINGLE SOURCE OF TRUTH FOR ALL TOAST MESSAGES
 *
 * This file re-exports the unified API error toast system.
 * Always use these functions for displaying toasts across the application.
 *
 * Key Principles:
 * 1. For API errors, ALWAYS use showApiErrorToast() - it automatically extracts backend error messages
 * 2. For success messages, use showApiSuccessToast()
 * 3. For warnings, use showApiWarningToast()
 * 4. For info messages, use showApiInfoToast()
 * 5. For loading states, use showApiLoadingToast()
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
 */

// ============================================================================
// PRIMARY EXPORTS - UNIFIED API ERROR TOAST SYSTEM
// ============================================================================

export {
  clearAllToasts,
  dismissToast,
  showApiErrorToast,
  showApiErrorWithRetry,
  showApiInfoToast,
  showApiLoadingToast,
  showApiSuccessToast,
  showApiWarningToast,
} from './api-error-toast';

// ✅ SINGLE SOURCE OF TRUTH: Export toastManager directly from its source
export { toastManager } from './toast-manager';
