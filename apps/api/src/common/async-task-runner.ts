/**
 * Async Task Runner Utility
 *
 * Provides a consistent pattern for running async tasks in the background
 * using Cloudflare's executionCtx.waitUntil() pattern.
 *
 * This eliminates repetitive null-checks and provides consistent error handling.
 */

import { log } from '@/lib/logger';

type ExecutionContext = {
  waitUntil: (promise: Promise<unknown>) => void;
};

/**
 * Runs an async task in the background using waitUntil if available.
 * Falls back to fire-and-forget execution if no execution context.
 *
 * @param executionCtx - The execution context (may be undefined)
 * @param taskFn - Async function to run in background
 * @param options - Optional configuration
 * @param options.operationName - Operation name for error logging
 * @param options.swallowErrors - Whether to swallow errors silently (default: true)
 */
export function runBackgroundTask(
  executionCtx: ExecutionContext | undefined,
  taskFn: () => Promise<unknown>,
  options?: {
    /** Operation name for error logging */
    operationName?: string;
    /** Whether to swallow errors silently (default: true) */
    swallowErrors?: boolean;
  },
): void {
  const { operationName = 'background task', swallowErrors = true } = options ?? {};

  const wrappedTask = async () => {
    try {
      await taskFn();
    } catch (error) {
      if (!swallowErrors) {
        throw error;
      }
      log.queue('failed', `[${operationName}] Background task failed`, { error: error instanceof Error ? error.message : String(error) });
    }
  };

  if (executionCtx) {
    executionCtx.waitUntil(wrappedTask());
  } else {
    wrappedTask().catch(() => {});
  }
}
