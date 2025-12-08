/**
 * Auto-Scroll Hook
 *
 * Provides consistent auto-scroll behavior during streaming:
 * - Only scrolls if user is at bottom (doesn't interrupt manual scrolling)
 * - Smooth scroll animation via ResizeObserver
 * - Works with dynamically growing content
 *
 * @module hooks/utils/use-auto-scroll
 */

'use client';

import { useEffect, useEffectEvent, useRef } from 'react';

// ============================================================================
// CSS OVERFLOW VALUES - Following 5-part enum pattern
// ============================================================================

/**
 * CSS overflow property values that enable scrolling
 * Used for detecting scrollable containers
 */
const SCROLLABLE_OVERFLOW_VALUES = ['auto', 'scroll'] as const;

/**
 * Type for scrollable overflow values
 */
type ScrollableOverflow = typeof SCROLLABLE_OVERFLOW_VALUES[number];

/**
 * Check if CSS overflow value enables scrolling
 */
function isScrollableOverflow(value: string): value is ScrollableOverflow {
  return SCROLLABLE_OVERFLOW_VALUES.includes(value as ScrollableOverflow);
}

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Options for auto-scroll behavior
 */
export type UseAutoScrollOptions = {
  /** Scroll animation behavior */
  behavior?: ScrollBehavior;
  /** Vertical alignment when manually triggered */
  block?: ScrollLogicalPosition;
  /** Only scroll if user is near bottom */
  onlyIfAtBottom?: boolean;
  /** Distance from bottom in pixels to consider "at bottom" */
  bottomThreshold?: number;
  /** Enable/disable auto-scroll */
  enabled?: boolean;
  /** Minimum height change in pixels to trigger scroll (prevents micro-scrolls) */
  minHeightChange?: number;
  /** Debounce delay in ms for scroll calls */
  debounceMs?: number;
};

/**
 * Return type for manual trigger variant
 */
export type UseAutoScrollWithTriggerReturn<T extends HTMLElement> = {
  /** Ref to attach to scroll anchor element */
  ref: React.RefObject<T | null>;
  /** Manual scroll function */
  scrollToBottom: () => void;
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if user is scrolled to bottom of container
 */
function isScrolledToBottom(
  element: HTMLElement | null,
  threshold: number = 100,
): boolean {
  if (!element)
    return false;

  const { scrollTop, scrollHeight, clientHeight } = element;
  const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

  return distanceFromBottom <= threshold;
}

/**
 * Scroll container to bottom
 */
function scrollToBottom(
  container: HTMLElement | null,
  behavior: ScrollBehavior = 'smooth',
): void {
  if (!container)
    return;

  container.scrollTo({
    top: container.scrollHeight,
    behavior,
  });
}

/**
 * Get scroll container (finds nearest scrollable parent)
 * Walks up DOM tree to find first element with scrollable overflow
 */
function getScrollContainer(element: HTMLElement | null): HTMLElement | null {
  if (!element)
    return null;

  let parent = element.parentElement;

  while (parent) {
    const { overflow, overflowY } = window.getComputedStyle(parent);
    const isScrollable = isScrollableOverflow(overflow) || isScrollableOverflow(overflowY);

    if (isScrollable) {
      return parent;
    }

    parent = parent.parentElement;
  }

  return document.documentElement;
}

// ============================================================================
// HOOK EXPORTS
// ============================================================================

/**
 * Auto-scroll hook for streaming content
 *
 * Automatically scrolls content into view during streaming if user is at bottom.
 * Uses ResizeObserver to track content growth and maintain scroll position.
 *
 * @param shouldScroll - Trigger for scrolling (e.g., isStreaming)
 * @param options - Scroll behavior configuration
 * @returns Ref to attach to the scroll anchor element
 *
 * @example
 * ```tsx
 * function StreamingComponent({ isStreaming }) {
 *   const scrollRef = useAutoScroll(isStreaming);
 *
 *   return (
 *     <div className="overflow-auto">
 *       <div>Content...</div>
 *       <div ref={scrollRef} />
 *     </div>
 *   );
 * }
 * ```
 */
export function useAutoScroll<T extends HTMLElement = HTMLDivElement>(
  shouldScroll: boolean,
  options: UseAutoScrollOptions = {},
): React.RefObject<T | null> {
  const {
    behavior = 'smooth',
    onlyIfAtBottom = true,
    bottomThreshold = 100,
    enabled = true,
    minHeightChange = 20, // Require meaningful height change (~1 line of text)
    debounceMs = 150, // Debounce to prevent rapid scroll calls
  } = options;

  const elementRef = useRef<T>(null);

  // ✅ REACT 19: Track scroll container ref for event handlers
  const scrollContainerRef = useRef<HTMLElement | null>(null);

  // ✅ REACT 19: Track user opt-out state in ref (mutable across renders)
  const userOptedOutRef = useRef(false);

  // ✅ REACT 19: useEffectEvent for scroll handler - reads bottomThreshold without re-creating observer
  const onUserScroll = useEffectEvent(() => {
    if (!scrollContainerRef.current)
      return;
    const isAtBottom = isScrolledToBottom(scrollContainerRef.current, bottomThreshold);
    if (!isAtBottom) {
      userOptedOutRef.current = true;
    } else {
      // User scrolled back to bottom - re-enable auto-scroll
      userOptedOutRef.current = false;
    }
  });

  // ✅ REACT 19: useEffectEvent for resize handler - reads all options without deps
  const onResize = useEffectEvent((heightTracker: { lastHeight: number }) => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer)
      return null;

    // If user has opted out, don't auto-scroll
    if (userOptedOutRef.current) {
      return null;
    }

    const isAtBottom = isScrolledToBottom(scrollContainer, bottomThreshold);

    // Strict check - only scroll if currently at bottom
    if (onlyIfAtBottom && !isAtBottom) {
      return null;
    }

    // Only scroll on meaningful height changes
    const newHeight = scrollContainer.scrollHeight;
    const heightDelta = newHeight - heightTracker.lastHeight;

    if (heightDelta < minHeightChange) {
      return null;
    }

    heightTracker.lastHeight = newHeight;
    return { scrollContainer, behavior };
  });

  // ✅ REACT 19: useEffectEvent for debounced scroll check
  const onDebouncedScrollCheck = useEffectEvent(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer)
      return null;

    // Re-check opt-out status after debounce
    if (userOptedOutRef.current) {
      return null;
    }

    // Re-check position after debounce
    if (onlyIfAtBottom && !isScrolledToBottom(scrollContainer, bottomThreshold)) {
      return null;
    }

    return { scrollContainer, behavior };
  });

  useEffect(() => {
    if (!enabled || !shouldScroll || !elementRef.current) {
      return;
    }

    const element = elementRef.current;
    const scrollContainer = getScrollContainer(element);

    if (!scrollContainer) {
      return;
    }

    // Store scroll container for event handlers
    scrollContainerRef.current = scrollContainer;
    userOptedOutRef.current = false;

    // Track height changes to prevent micro-scrolls
    const heightTracker = { lastHeight: scrollContainer.scrollHeight };
    let debounceTimeout: NodeJS.Timeout | null = null;
    let pendingScrollRAF: number | null = null;

    // Throttled scroll handler using RAF
    let scrollTicking = false;
    const handleUserScroll = () => {
      if (scrollTicking)
        return;
      scrollTicking = true;
      requestAnimationFrame(() => {
        onUserScroll();
        scrollTicking = false;
      });
    };

    // Listen for user scroll events to detect opt-out
    window.addEventListener('scroll', handleUserScroll, { passive: true });

    // ResizeObserver callback
    const resizeObserver = new ResizeObserver(() => {
      const resizeResult = onResize(heightTracker);
      if (!resizeResult)
        return;

      // Debounce scroll calls to prevent rapid-fire scrolling
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }

      debounceTimeout = setTimeout(() => {
        const scrollResult = onDebouncedScrollCheck();
        if (!scrollResult)
          return;

        // Cancel any pending RAF
        if (pendingScrollRAF) {
          cancelAnimationFrame(pendingScrollRAF);
        }

        pendingScrollRAF = requestAnimationFrame(() => {
          scrollToBottom(scrollResult.scrollContainer, scrollResult.behavior);
          pendingScrollRAF = null;
        });

        debounceTimeout = null;
      }, debounceMs);
    });

    resizeObserver.observe(scrollContainer);
    resizeObserver.observe(element);

    return () => {
      window.removeEventListener('scroll', handleUserScroll);
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }
      if (pendingScrollRAF) {
        cancelAnimationFrame(pendingScrollRAF);
      }
      resizeObserver.disconnect();
      scrollContainerRef.current = null;
    };
  }, [shouldScroll, enabled, debounceMs]); // ✅ REACT 19: Removed behavior, onlyIfAtBottom, bottomThreshold, minHeightChange - accessed via useEffectEvent

  return elementRef;
}

/**
 * Auto-scroll hook with manual trigger
 *
 * Returns both ref and manual scroll function for explicit control.
 * Useful when auto-scroll needs to be triggered by user action.
 *
 * @param options - Scroll behavior configuration
 * @returns Object with ref and scrollToBottom function
 *
 * @example
 * ```tsx
 * function Component() {
 *   const { ref, scrollToBottom } = useAutoScrollWithTrigger();
 *
 *   return (
 *     <div>
 *       <button onClick={scrollToBottom}>Scroll to bottom</button>
 *       <div ref={ref} />
 *     </div>
 *   );
 * }
 * ```
 */
export function useAutoScrollWithTrigger<T extends HTMLElement = HTMLDivElement>(
  options: UseAutoScrollOptions = {},
): UseAutoScrollWithTriggerReturn<T> {
  const {
    behavior = 'smooth',
    block = 'end',
  } = options;

  const elementRef = useRef<T>(null);

  const scrollToBottom = () => {
    elementRef.current?.scrollIntoView({
      behavior,
      block,
      inline: 'nearest',
    });
  };

  return {
    ref: elementRef,
    scrollToBottom,
  };
}
