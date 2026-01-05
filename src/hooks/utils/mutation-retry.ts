/**
 * Mutation Retry Utilities
 *
 * Shared retry logic for TanStack Query mutations
 * Prevents client errors (4xx) from retrying while allowing transient errors (5xx, network) to retry
 */

type ErrorWithStatus = Error & { status: number };

function isErrorWithStatus(error: Error): error is ErrorWithStatus {
  return 'status' in error && typeof (error as Record<string, unknown>).status === 'number';
}

/**
 * Standard retry function for mutations
 * - Client errors (4xx): No retry (data validation, authentication, not found, etc.)
 * - Server errors (5xx) and network errors: Retry up to 2 times (failureCount < 2)
 *
 * @param failureCount - Current failure count from TanStack Query
 * @param error - Error object from mutation failure
 * @returns Whether to retry the mutation
 */
export function shouldRetryMutation(failureCount: number, error: Error): boolean {
  const status = isErrorWithStatus(error) ? error.status : null;

  if (status !== null && status >= 400 && status < 500) {
    return false;
  }

  return failureCount < 2;
}
