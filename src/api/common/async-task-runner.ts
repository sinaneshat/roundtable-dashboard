/**
 * Async Task Runner Utility
 *
 * Provides a consistent pattern for running async tasks in the background
 * using Cloudflare's executionCtx.waitUntil() pattern.
 *
 * This eliminates repetitive null-checks and provides consistent error handling.
 */

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
      console.error(`[${operationName}] Background task failed:`, error);
    }
  };

  if (executionCtx) {
    executionCtx.waitUntil(wrappedTask());
  } else {
    wrappedTask().catch(() => {});
  }
}

/**
 * Runs multiple async tasks in parallel in the background.
 * All tasks are wrapped in Promise.all and executed via waitUntil.
 *
 * @param executionCtx - The execution context (may be undefined)
 * @param tasks - Array of async functions to run in background
 * @param options - Optional configuration
 * @param options.operationName - Operation name for error logging
 * @param options.swallowErrors - Whether to swallow errors silently (default: true)
 */
export function runBackgroundTasks(
  executionCtx: ExecutionContext | undefined,
  tasks: Array<() => Promise<unknown>>,
  options?: {
    /** Operation name for error logging */
    operationName?: string;
    /** Whether to swallow errors silently (default: true) */
    swallowErrors?: boolean;
  },
): void {
  if (tasks.length === 0) {
    return;
  }

  const { operationName = 'background tasks', swallowErrors = true } = options ?? {};

  const wrappedTasks = async () => {
    const results = await Promise.allSettled(tasks.map(fn => fn()));

    const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

    if (!swallowErrors && failures.length > 0) {
      throw new AggregateError(failures.map(f => f.reason), `${operationName} had ${failures.length} failures`);
    }

    if (swallowErrors && failures.length > 0) {
      console.error(`[${operationName}] ${failures.length}/${tasks.length} background tasks failed:`, failures.map(f => f.reason));
    }
  };

  if (executionCtx) {
    executionCtx.waitUntil(wrappedTasks());
  } else {
    wrappedTasks().catch(() => {});
  }
}
