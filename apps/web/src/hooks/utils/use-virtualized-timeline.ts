import type { Virtualizer } from '@tanstack/react-virtual';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import type { RefObject } from 'react';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';

import type { TimelineItem } from './use-thread-timeline';

/**
 * Bottom padding for virtualized timeline in pixels.
 * Matches Tailwind's pb-[20rem] (20 * 16 = 320px) used on wrapper containers.
 */
export const TIMELINE_BOTTOM_PADDING_PX = 320;

/**
 * Options for useVirtualizedTimeline hook
 */
export type UseVirtualizedTimelineOptions = {
  timelineItems: TimelineItem[];
  listRef: RefObject<HTMLDivElement | null>;
  estimateSize?: number;
  overscan?: number;
  paddingStart?: number;
  paddingEnd?: number;
  isDataReady?: boolean;
  isStreaming?: boolean;
  getIsStreamingFromStore?: () => boolean;
};

/**
 * Result from useVirtualizedTimeline hook
 * Following official TanStack Virtual pattern - virtualizer methods called directly in render
 */
export type UseVirtualizedTimelineResult = {
  virtualizer: Virtualizer<Window, Element>;
  measureElement: (element: Element | null) => void;
  scrollToIndex: (
    index: number,
    options?: { align?: 'start' | 'center' | 'end' | 'auto'; behavior?: 'auto' | 'smooth' },
  ) => void;
  scrollToOffset: (
    offset: number,
    options?: { align?: 'start' | 'center' | 'end' | 'auto'; behavior?: 'auto' | 'smooth' },
  ) => void;
  scrollToBottom: (options?: { behavior?: 'auto' | 'smooth' }) => void;
};

/**
 * useVirtualizedTimeline - Window-level virtualization for chat timeline
 *
 * OFFICIAL TANSTACK VIRTUAL PATTERN:
 * - Call virtualizer.getVirtualItems() and virtualizer.getTotalSize() directly in render
 * - This ensures positions are ALWAYS current, never stale
 * - measureElement ref enables dynamic sizing via ResizeObserver
 *
 * Previous implementation used state + RAF which caused stale positions during streaming.
 */
export function useVirtualizedTimeline({
  timelineItems,
  listRef,
  estimateSize = 200,
  overscan = 5,
  paddingStart = 0,
  paddingEnd = 0,
  isDataReady = true,
  isStreaming = false,
  getIsStreamingFromStore,
}: UseVirtualizedTimelineOptions): UseVirtualizedTimelineResult {
  // Track scrollMargin - ref first to avoid direct setState in effect
  const scrollMarginRef = useRef(0);
  const [, forceUpdate] = useState(0);

  // Track streaming state for scroll adjustment logic
  const isStreamingRef = useRef(isStreaming);
  isStreamingRef.current = isStreaming;

  // Virtualizer enabled when data is ready
  const shouldEnable = isDataReady && timelineItems.length > 0;

  // Measure scrollMargin from listRef using ResizeObserver
  useLayoutEffect(() => {
    if (!shouldEnable || !listRef.current)
      return;

    const measureScrollMargin = () => {
      if (listRef.current) {
        const newMargin = listRef.current.offsetTop;
        if (scrollMarginRef.current !== newMargin) {
          scrollMarginRef.current = newMargin;
          // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
          forceUpdate(c => c + 1);
        }
      }
    };

    measureScrollMargin();

    const resizeObserver = new ResizeObserver(measureScrollMargin);
    resizeObserver.observe(listRef.current);
    if (listRef.current.parentElement) {
      resizeObserver.observe(listRef.current.parentElement);
    }

    return () => resizeObserver.disconnect();
  }, [shouldEnable, listRef]);

  // Initialize window virtualizer - OFFICIAL PATTERN
  // No onChange callback, no state caching - methods called directly in render
  // scrollMarginRef.current is read directly; forceUpdate triggers re-render when it changes
  const virtualizer = useWindowVirtualizer({
    count: timelineItems.length,
    estimateSize: () => estimateSize,
    overscan,
    scrollMargin: scrollMarginRef.current,
    paddingStart,
    paddingEnd,
    enabled: shouldEnable,
  });

  // Scroll position adjustment during streaming
  // Pattern from TanStack Virtual maintainers (GitHub Discussion #730)
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (
    item,
    _delta,
    instance,
  ) => {
    const isCurrentlyStreaming = isStreamingRef.current
      || (getIsStreamingFromStore ? getIsStreamingFromStore() : false);

    // During streaming, never adjust scroll position
    if (isCurrentlyStreaming) {
      return false;
    }

    // Only adjust for items above viewport when scrolling backward
    const isItemAboveViewport = item.start < (instance.scrollOffset ?? 0);
    const isScrollingBackward = instance.scrollDirection === 'backward';
    return isItemAboveViewport && isScrollingBackward;
  };

  // Scroll methods
  const scrollToIndex = useCallback(
    (
      index: number,
      options?: { align?: 'start' | 'center' | 'end' | 'auto'; behavior?: 'auto' | 'smooth' },
    ) => {
      virtualizer.scrollToIndex(index, options);
    },
    [virtualizer],
  );

  const scrollToOffset = useCallback(
    (
      offset: number,
      options?: { align?: 'start' | 'center' | 'end' | 'auto'; behavior?: 'auto' | 'smooth' },
    ) => {
      virtualizer.scrollToOffset(offset, options);
    },
    [virtualizer],
  );

  const scrollToBottom = useCallback(
    (options?: { behavior?: 'auto' | 'smooth' }) => {
      if (timelineItems.length === 0)
        return;
      virtualizer.scrollToIndex(timelineItems.length - 1, {
        align: 'end',
        behavior: options?.behavior ?? 'auto',
      });
    },
    [virtualizer, timelineItems.length],
  );

  // Reset scrollMargin when items become empty
  useLayoutEffect(() => {
    if (timelineItems.length === 0 && scrollMarginRef.current !== 0) {
      scrollMarginRef.current = 0;
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
      forceUpdate(c => c + 1);
    }
  }, [timelineItems.length]);

  return {
    virtualizer,
    measureElement: virtualizer.measureElement,
    scrollToIndex,
    scrollToOffset,
    scrollToBottom,
  };
}
