import type { VirtualItem, Virtualizer, VirtualizerOptions } from '@tanstack/react-virtual';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useRef, useState } from 'react';

import { getRoundNumber } from '@/lib/utils/metadata';

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
   * Default: 10 (relaxed - renders 10 items above and below viewport for smooth fast scrolling)
   * Previous: 1 (too aggressive, caused overlapping during fast scrolls)
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

  /**
   * Set of round numbers that are currently streaming
   * Used to prevent virtualization from unmounting components during active streams
   * Default: undefined (no streaming protection)
   */
  streamingRounds?: Set<number>;
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
 * - Streaming protection: Keeps components mounted during active streams
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
 */
export function useVirtualizedTimeline({
  timelineItems,
  scrollContainerId = 'chat-scroll-container',
  estimateSize = 400,
  overscan = 10, // ✅ INCREASED from 1 to 10 for smoother fast scrolling
  enabled = true,
  onScrollOffsetChange,
  enableSmoothScroll = true,
  smoothScrollDuration = 1000,
  bottomPadding = 200,
  streamingRounds,
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
  useEffect(() => {
    const container = document.getElementById(scrollContainerId);
    if (container) {
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect, react-hooks/set-state-in-effect -- Measuring DOM element on mount
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

  // ✅ CRITICAL: Custom range extractor to prevent streaming items from being unmounted
  // TanStack Virtual best practice: Use rangeExtractor to keep specific items always rendered
  // This prevents streaming content from disappearing when users scroll during active streams
  //
  // EXPANDED PROTECTION: Includes ALL items related to streaming rounds:
  // - Changelog items (configuration changes before the round)
  // - Message items (participant responses)
  // - Analysis items (moderator analysis)
  // - Pre-search items (rendered within message blocks)
  //
  // BUFFER ZONE: Adds extra items around viewport range to prevent overlapping during fast scrolls
  const rangeExtractor = useCallback(
    (range: { startIndex: number; endIndex: number; overscan: number; count: number }) => {
      const indexes: number[] = [];

      // ✅ BUFFER ZONE: Add extra items beyond overscan for smoother fast scrolling
      // This prevents text collision and overlap when users scroll rapidly
      const EXTRA_BUFFER = 3; // Additional items beyond standard overscan
      const bufferedStart = Math.max(0, range.startIndex - EXTRA_BUFFER);
      const bufferedEnd = Math.min(range.count - 1, range.endIndex + EXTRA_BUFFER);

      // Always include streaming round indexes (prevent virtualization removal)
      if (streamingRounds && streamingRounds.size > 0) {
        timelineItems.forEach((item, index) => {
          let itemRound: number | null = null;

          // Extract round number based on item type
          if (item.type === 'messages') {
            itemRound = getRoundNumber(item.data[0]?.metadata);
          } else if (item.type === 'analysis') {
            itemRound = item.data.roundNumber;
          } else if (item.type === 'changelog') {
            // Changelog items don't have roundNumber directly, but they precede the round
            // Include changelog if it appears immediately before a streaming round
            itemRound = item.data[0]?.roundNumber ?? null;
          }

          // ✅ TYPE-SAFE: getRoundNumber returns number | null, filter nulls
          if (itemRound !== null && streamingRounds.has(itemRound)) {
            indexes.push(index);

            // ✅ EXPANDED PROTECTION: Also include the item immediately BEFORE streaming rounds
            // This ensures changelog items that precede the round stay visible
            if (index > 0 && !indexes.includes(index - 1)) {
              const prevItem = timelineItems[index - 1];
              // Only include previous item if it's a changelog for the same round
              if (prevItem?.type === 'changelog') {
                const prevRound = prevItem.data[0]?.roundNumber ?? null;
                if (prevRound === itemRound) {
                  indexes.push(index - 1);
                }
              }
            }
          }
        });
      }

      // Include buffered viewport range (standard virtualization with buffer)
      for (let i = bufferedStart; i <= bufferedEnd; i++) {
        if (!indexes.includes(i)) {
          indexes.push(i);
        }
      }

      // Sort for proper rendering order
      return indexes.sort((a, b) => a - b);
    },
    [streamingRounds, timelineItems],
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
    // ✅ CRITICAL: Custom range extractor prevents streaming items from unmounting
    rangeExtractor,
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
