/**
 * Queue Utilities
 *
 * Shared utilities for Cloudflare Queue consumers.
 * Provides exponential backoff calculation for retry logic.
 *
 * @see src/workers/title-generation-queue.ts
 * @see src/workers/round-orchestration-queue.ts
 */

/**
 * Calculate exponential backoff delay for queue message retries
 *
 * Formula: delay = baseDelay * 2^(attempt - 1), capped at maxDelay
 *
 * Example with baseDelay=30s, maxDelay=3600s:
 * - Attempt 1: 30s
 * - Attempt 2: 60s
 * - Attempt 3: 120s
 * - Attempt 4: 240s
 * - Attempt 5: 480s
 * - Eventually capped at 3600s (1 hour)
 *
 * @param attempt - Current retry attempt number (0-indexed from msg.attempts)
 * @param baseDelaySeconds - Base delay in seconds (default: 30s)
 * @param maxDelaySeconds - Maximum delay cap in seconds (default: 3600s = 1 hour)
 * @returns Calculated delay in seconds
 */
export function calculateExponentialBackoff(
  attempt: number,
  baseDelaySeconds = 30,
  maxDelaySeconds = 3600,
): number {
  const delay = baseDelaySeconds * 2 ** attempt;
  return Math.min(delay, maxDelaySeconds);
}
