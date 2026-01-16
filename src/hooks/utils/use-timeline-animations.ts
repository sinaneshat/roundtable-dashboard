'use client';

/**
 * useTimelineAnimations - Tracks animated items for one-time entrance animations
 *
 * For virtualized lists where items mount/unmount on scroll, this hook tracks
 * which items have already been animated to prevent re-animation on remount.
 *
 * Uses a ref to persist state across renders without causing re-renders.
 */

import { useCallback, useRef } from 'react';

type UseTimelineAnimationsOptions = {
  /** Whether to enable animations at all */
  enabled?: boolean;
};

type UseTimelineAnimationsReturn = {
  /** Check if an item should animate (hasn't been animated yet) */
  shouldAnimate: (itemKey: string) => boolean;
  /** Mark an item as animated */
  markAnimated: (itemKey: string) => void;
  /** Check if an item has been animated */
  hasAnimated: (itemKey: string) => boolean;
  /** Reset all animation state (for new threads) */
  reset: () => void;
};

/**
 * Hook to track timeline item animations
 *
 * @example
 * ```tsx
 * const { shouldAnimate, markAnimated } = useTimelineAnimations({ enabled: true });
 *
 * return items.map((item, index) => (
 *   <ScrollFadeEntrance
 *     key={item.id}
 *     skipAnimation={!shouldAnimate(item.id)}
 *   >
 *     {item.content}
 *   </ScrollFadeEntrance>
 * ));
 * ```
 */
export function useTimelineAnimations({
  enabled = true,
}: UseTimelineAnimationsOptions = {}): UseTimelineAnimationsReturn {
  // Track animated items - persists across renders without causing re-renders
  const animatedItemsRef = useRef<Set<string>>(new Set());
  // Track if we've processed initial items
  const initialProcessedRef = useRef(false);

  const shouldAnimate = useCallback((itemKey: string): boolean => {
    // Animations disabled entirely
    if (!enabled)
      return false;

    // Already animated
    if (animatedItemsRef.current.has(itemKey))
      return false;

    return true;
  }, [enabled]);

  const markAnimated = useCallback((itemKey: string): void => {
    animatedItemsRef.current.add(itemKey);
  }, []);

  const hasAnimated = useCallback((itemKey: string): boolean => {
    return animatedItemsRef.current.has(itemKey);
  }, []);

  const reset = useCallback((): void => {
    animatedItemsRef.current.clear();
    initialProcessedRef.current = false;
  }, []);

  return {
    shouldAnimate,
    markAnimated,
    hasAnimated,
    reset,
  };
}

/**
 * Simple hook to track if this is the first render
 * Useful for skipping animations on initial page load
 */
export function useIsFirstRender(): boolean {
  const isFirstRenderRef = useRef(true);

  if (isFirstRenderRef.current) {
    isFirstRenderRef.current = false;
    return true;
  }

  return false;
}
