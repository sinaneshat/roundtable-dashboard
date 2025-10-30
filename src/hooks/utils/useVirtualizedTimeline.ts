import type { VirtualItem, Virtualizer, VirtualizerOptions } from '@tanstack/react-virtual';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { TimelineItem } from './useThreadTimeline';

/**
 * Easing function for smooth scroll animations
 * Provides natural acceleration/deceleration
 */
function easeInOutQuint(t: number): number {
  return t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * --t * t * t * t * t;
}

export type UseVirtualizedTimelineOptions = {
  /**
   * Timeline items to virtualize
   */
  timelineItems: TimelineItem[];

  /**
   * ID of the scroll container element for measuring offset
   */
  scrollContainerId?: string;

  /**
   * Estimated size per timeline item in pixels
   * This is a starting estimate - actual sizes will be measured dynamically
   * Default: 400px (covers most message groups)
   */
  estimateSize?: number;

  /**
   * Number of items to render outside the visible viewport
   * Higher values = smoother scrolling but more DOM elements
   * Default: 1 (aggressive - renders 1 item above and below viewport)
   */
  overscan?: number;

  /**
   * Whether virtualization is enabled
   * Set to false to disable virtualization (useful for debugging)
   * Default: true
   */
  enabled?: boolean;

  /**
   * Callback when scroll offset changes
   * Useful for tracking scroll position or implementing custom behaviors
   */
  onScrollOffsetChange?: (offset: number) => void;

  /**
   * Enable smooth scroll with easing animation
   * Uses easeInOutQuint for natural acceleration/deceleration
   * Default: true
   */
  enableSmoothScroll?: boolean;

  /**
   * Duration of smooth scroll animation in milliseconds
   * Default: 1000ms (1 second)
   */
  smoothScrollDuration?: number;

  /**
   * Extra padding at bottom of scroll area (in pixels)
   * Prevents content from being hidden behind sticky elements (like input box)
   * Default: 200px
   */
  bottomPadding?: number;
};

export type UseVirtualizedTimelineResult = {
  /**
   * Virtualizer instance from TanStack Virtual
   * Provides access to scroll methods and state
   */
  virtualizer: Virtualizer<Window, Element>;

  /**
   * Virtual items to render
   * Only includes items that should be in the DOM based on scroll position
   */
  virtualItems: VirtualItem[];

  /**
   * Total size of all items (in pixels)
   * Useful for scroll position calculations
   */
  totalSize: number;

  /**
   * Total size with bottom padding applied
   * Use this for container minHeight to include padding
   */
  totalSizeWithPadding: number;

  /**
   * Bottom padding value (in pixels)
   * Applied to total size for extra scroll area
   */
  bottomPadding: number;

  /**
   * Measure function to attach to rendered elements
   * Required for dynamic sizing - call this on each rendered element's ref
   */
  measureElement: (element: Element | null) => void;

  /**
   * Scroll to a specific index
   * @param index - Timeline item index to scroll to
   * @param options - Scroll behavior options
   */
  scrollToIndex: (index: number, options?: { align?: 'start' | 'center' | 'end' | 'auto'; behavior?: 'auto' | 'smooth' }) => void;

  /**
   * Scroll to a specific offset
   * @param offset - Pixel offset to scroll to
   * @param options - Scroll behavior options
   */
  scrollToOffset: (offset: number, options?: { align?: 'start' | 'center' | 'end' | 'auto'; behavior?: 'auto' | 'smooth' }) => void;

  /**
   * Scroll to a timeline item matching a predicate
   * Useful for scrolling to specific messages, analyses, or participants
   * @param predicate - Function to test each timeline item
   * @param options - Scroll behavior options
   * @returns true if item found and scrolled to, false otherwise
   */
  scrollToItem: (
    predicate: (item: TimelineItem, index: number) => boolean,
    options?: { align?: 'start' | 'center' | 'end' | 'auto'; behavior?: 'auto' | 'smooth' },
  ) => boolean;
};

/**
 * useVirtualizedTimeline - Window-level virtualization for chat timeline
 *
 * Implements efficient rendering of large chat timelines using TanStack Virtual's window virtualizer.
 * Since chat uses window scroll (not container scroll), we use useWindowVirtualizer.
 *
 * KEY FEATURES:
 * - Dynamic sizing: Measures actual heights as items render (messages vary in size)
 * - Window scroll: Uses browser's native scroll performance
 * - Overscan: Pre-renders items outside viewport for smooth scrolling
 * - Scroll margin: Accounts for header offset
 * - Maintains scroll position during streaming
 *
 * PERFORMANCE BENEFITS:
 * - Only renders items visible in viewport + overscan
 * - Reduces DOM nodes from ~100+ messages to ~10-15 visible items
 * - Maintains 60fps during streaming (browser only updates visible items)
 * - Lower memory usage (fewer React components mounted)
 *
 * INTEGRATION with existing hooks:
 * - Works with useThreadTimeline for data grouping
 * - Works with useChatScroll for scroll management
 * - Preserves streaming behavior and auto-scroll
 *
 * @example
 * ```tsx
 * const timeline = useThreadTimeline({ messages, analyses, changelog });
 * const {
 *   virtualItems,
 *   totalSizeWithPadding,
 *   measureElement
 * } = useVirtualizedTimeline({
 *   timelineItems: timeline,
 *   scrollContainerId: 'chat-scroll-container',
 *   estimateSize: 400,
 *   overscan: 3,
 *   bottomPadding: 200,  // Extra scroll area at bottom
 * });
 *
 * return (
 *   <div
 *     id="chat-scroll-container"
 *     style={{ position: 'relative', minHeight: `${totalSizeWithPadding}px` }}
 *   >
 *     {virtualItems.map((virtualItem) => {
 *       const item = timeline[virtualItem.index];
 *       return (
 *         <div
 *           key={virtualItem.key}
 *           data-index={virtualItem.index}
 *           ref={measureElement}
 *           style={{
 *             position: 'absolute',
 *             top: 0,
 *             left: 0,
 *             width: '100%',
 *             transform: `translateY(${virtualItem.start}px)`,
 *           }}
 *         >
 *           {item.type === 'messages' && <MessageList messages={item.data} />}
 *           {item.type === 'analysis' && <AnalysisCard analysis={item.data} />}
 *           {item.type === 'changelog' && <ChangelogGroup changes={item.data} />}
 *         </div>
 *       );
 *     })}
 *   </div>
 * );
 * ```
 */
export function useVirtualizedTimeline({
  timelineItems,
  scrollContainerId = 'chat-scroll-container',
  estimateSize = 400,
  overscan = 1,
  enabled = true,
  onScrollOffsetChange,
  enableSmoothScroll = true,
  smoothScrollDuration = 1000,
  bottomPadding = 200,
}: UseVirtualizedTimelineOptions): UseVirtualizedTimelineResult {
  // Track scroll container element for measuring scroll margin
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  // Track current scroll animation
  const scrollingRef = useRef<number>(0);

  // Update ref when container ID changes
  useEffect(() => {
    scrollContainerRef.current = document.getElementById(scrollContainerId);
  }, [scrollContainerId]);

  // Calculate scroll margin (offset from top of viewport to content start)
  // This accounts for headers/toolbars above the scrollable content
  const [scrollMargin, setScrollMargin] = useState(0);

  // Measure scroll margin when container changes
  // Using useEffect with setState is acceptable here for DOM measurements

  useEffect(() => {
    const container = document.getElementById(scrollContainerId);
    if (container) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setScrollMargin(container.offsetTop || 0);
    }
  }, [scrollContainerId]);

  // Custom scroll function with smooth easing animation
  const scrollToFn: VirtualizerOptions<Window, Element>['scrollToFn'] = useCallback(
    (offset, canSmooth, _instance) => {
      if (!enableSmoothScroll || !canSmooth) {
        // Use default scroll behavior if smooth scroll disabled
        window.scrollTo({ top: offset, behavior: canSmooth ? 'smooth' : 'auto' });
        return;
      }

      const duration = smoothScrollDuration;
      const start = window.scrollY;
      const startTime = (scrollingRef.current = Date.now());

      const run = () => {
        if (scrollingRef.current !== startTime)
          return;
        const now = Date.now();
        const elapsed = now - startTime;
        const progress = easeInOutQuint(Math.min(elapsed / duration, 1));
        const interpolated = start + (offset - start) * progress;

        if (elapsed < duration) {
          window.scrollTo({ top: interpolated, behavior: 'auto' });
          requestAnimationFrame(run);
        } else {
          window.scrollTo({ top: interpolated, behavior: 'auto' });
        }
      };

      requestAnimationFrame(run);
    },
    [enableSmoothScroll, smoothScrollDuration],
  );

  // Initialize window virtualizer
  const virtualizer = useWindowVirtualizer({
    count: timelineItems.length,
    estimateSize: () => estimateSize,
    overscan,
    enabled,
    // Use computed scroll margin value
    scrollMargin,
    // Custom scroll function for smooth easing
    scrollToFn: enableSmoothScroll ? scrollToFn : undefined,
  });

  // Get virtual items (only items that should be rendered)
  const virtualItems = virtualizer.getVirtualItems();

  // Get total size of all items
  const totalSize = virtualizer.getTotalSize();

  // Calculate total size with bottom padding
  const totalSizeWithPadding = totalSize + bottomPadding;

  // Measure element function (attaches to refs for dynamic sizing)
  const measureElement = virtualizer.measureElement;

  // Scroll to specific index
  const scrollToIndex = useCallback(
    (
      index: number,
      options?: { align?: 'start' | 'center' | 'end' | 'auto'; behavior?: 'auto' | 'smooth' },
    ) => {
      virtualizer.scrollToIndex(index, options);
    },
    [virtualizer],
  );

  // Scroll to specific offset
  const scrollToOffset = (
    offset: number,
    options?: { align?: 'start' | 'center' | 'end' | 'auto'; behavior?: 'auto' | 'smooth' },
  ) => {
    virtualizer.scrollToOffset(offset, options);
  };

  // Scroll to item matching predicate
  const scrollToItem = useCallback(
    (
      predicate: (item: TimelineItem, index: number) => boolean,
      options?: { align?: 'start' | 'center' | 'end' | 'auto'; behavior?: 'auto' | 'smooth' },
    ): boolean => {
      const targetIndex = timelineItems.findIndex(predicate);
      if (targetIndex === -1) {
        return false;
      }
      scrollToIndex(targetIndex, options);
      return true;
    },
    [timelineItems, scrollToIndex],
  );

  // Track scroll offset changes
  useEffect(() => {
    if (onScrollOffsetChange) {
      const offset = virtualizer.scrollOffset || 0;
      onScrollOffsetChange(offset);
    }
  }, [virtualizer.scrollOffset, onScrollOffsetChange]);

  // Handle window resize to recalculate scroll margin
  useEffect(() => {
    const handleResize = () => {
      // Force virtualizer to recalculate with new scroll margin
      virtualizer.measure();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [virtualizer]);

  return {
    virtualizer,
    virtualItems,
    totalSize,
    totalSizeWithPadding,
    bottomPadding,
    measureElement,
    scrollToIndex,
    scrollToOffset,
    scrollToItem,
  };
}
