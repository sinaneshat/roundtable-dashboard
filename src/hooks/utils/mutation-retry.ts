/**
 * Mutation Retry Utilities
 *
 * Shared retry logic for TanStack Query mutations
 * Prevents client errors (4xx) from retrying while allowing transient errors (5xx, network) to retry
 */

/**
 * Standard retry function for mutations
 * - Client errors (4xx): No retry (data validation, authentication, not found, etc.)
 * - Server errors (5xx) and network errors: Retry up to 2 times (failureCount < 2)
 *
 * @param failureCount - Current failure count from TanStack Query
 * @param error - Error object from mutation failure
 * @returns Whether to retry the mutation
 */
export function shouldRetryMutation(failureCount: number, error: unknown): boolean {
  // Extract HTTP status code if available
  const status = error && typeof error === 'object' && 'status' in error && typeof error.status === 'number'
    ? error.status
    : null;

  // Don't retry client errors (4xx) - these are permanent failures
  if (status !== null && status >= 400 && status < 500) {
    return false;
  }

  // Retry server errors (5xx) and network errors up to 2 times
  return failureCount < 2;
}
