/**
 * Browser Timing Utilities
 *
 * Utilities for coordinating with browser rendering cycles and idle time.
 * Used for timing-sensitive operations like navigation after streaming completes.
 */

/**
 * Execute callback after browser completes paint cycle
 *
 * Uses double requestAnimationFrame pattern:
 * - First rAF ensures render cycle completes
 * - Second rAF ensures paint cycle completes
 *
 * This is the callback-based version for synchronous event handlers.
 * For async/Promise-based usage, use waitForIdleOrRender() instead.
 *
 * @param callback - Function to execute after paint
 * @returns Cleanup function to cancel the scheduled callback
 *
 * @example
 * ```tsx
 * // Focus input after modal opens and paints
 * useEffect(() => {
 *   if (isOpen) {
 *     return afterPaint(() => inputRef.current?.focus());
 *   }
 * }, [isOpen]);
 * ```
 */
export function afterPaint(callback: () => void): () => void {
  let innerRafId: number | undefined;
  const outerRafId = requestAnimationFrame(() => {
    innerRafId = requestAnimationFrame(callback);
  });
  return () => {
    cancelAnimationFrame(outerRafId);
    if (innerRafId !== undefined) {
      cancelAnimationFrame(innerRafId);
    }
  };
}
