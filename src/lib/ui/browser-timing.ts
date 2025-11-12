/**
 * Browser Timing Utilities
 *
 * Utilities for coordinating with browser rendering cycles and idle time.
 * Used for timing-sensitive operations like navigation after streaming completes.
 */

/**
 * Waits for browser idle time or next render cycle
 *
 * Pattern: AI SDK v5 best practice for async state synchronization
 * - Prefers requestIdleCallback to wait for browser idle time
 * - Falls back to double requestAnimationFrame for browsers without requestIdleCallback
 * - Used when you need to ensure browser has finished rendering before proceeding
 *
 * Use cases:
 * - Navigating after stream completes (wait for messages to persist)
 * - Performing operations after heavy render cycles
 * - Coordinating with browser paint cycles
 *
 * @param timeout - Maximum wait time in milliseconds (default: 2000)
 * @returns Promise that resolves when browser is idle or timeout is reached
 *
 * @example
 * ```tsx
 * // Navigate after streaming completes and backend persists messages
 * onStreamComplete={async () => {
 *   await waitForIdleOrRender();
 *   router.push(`/chat/${thread.slug}`);
 * }}
 * ```
 */
export function waitForIdleOrRender(timeout = 2000): Promise<void> {
  return new Promise<void>((resolve) => {
    if (typeof requestIdleCallback !== 'undefined') {
      // Use requestIdleCallback with timeout
      // Waits for browser idle time, with max timeout as fallback
      requestIdleCallback(() => resolve(), { timeout });
    } else {
      // Fallback: Double requestAnimationFrame
      // First rAF ensures render cycle completes
      // Second rAF ensures paint cycle completes
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    }
  });
}
