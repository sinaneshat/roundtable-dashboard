import type { Virtualizer } from '@tanstack/react-virtual';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import type { RefObject } from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';

import { rlog } from '@/lib/utils/dev-logger';

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
  /**
   * Start virtualizer scrolled to the bottom on initial render.
   * Uses TanStack Virtual's initialOffset for SSR hydration.
   * After hydration, scrolls to last item with align: 'end'.
   */
  initialScrollToBottom?: boolean;
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
  /** True when virtualization is active (client-side only) */
  isVirtualizationEnabled: boolean;
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
  initialScrollToBottom = false,
}: UseVirtualizedTimelineOptions): UseVirtualizedTimelineResult {
  // ✅ SSR FIX: Detect client-side mount using useSyncExternalStore
  // Window virtualizer requires window object - disable during SSR to render content
  const hasMounted = useSyncExternalStore(
    () => () => {},
    () => true, // Client: mounted
    () => false, // Server: not mounted
  );

  // Track scrollMargin - ref first to avoid direct setState in effect
  const scrollMarginRef = useRef(0);
  const [, forceUpdate] = useState(0);

  // Track streaming state for scroll adjustment logic
  const isStreamingRef = useRef(isStreaming);
  isStreamingRef.current = isStreaming;

  // ✅ SSR FIX: Only enable virtualization after client-side mount
  // On SSR, hasMounted=false, so shouldEnable=false, allowing normal document flow render
  const shouldEnable = hasMounted && isDataReady && timelineItems.length > 0;

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

  // ✅ DEBUG: Track item count changes for over-rendering detection
  const prevItemCountRef = useRef(timelineItems.length);
  useEffect(() => {
    if (timelineItems.length !== prevItemCountRef.current) {
      rlog.init('virt-items', `${prevItemCountRef.current}→${timelineItems.length} enabled=${shouldEnable ? 1 : 0}`);
      prevItemCountRef.current = timelineItems.length;
    }
  }, [timelineItems.length, shouldEnable]);

  // ✅ SSR SCROLL FIX: Calculate initial offset to start at bottom
  // TanStack Virtual's initialOffset positions scroll on first render
  // This ensures SSR hydration starts at the bottom, not top
  const getInitialOffset = useCallback(() => {
    if (!initialScrollToBottom || timelineItems.length === 0) {
      return 0;
    }
    // Estimate total size: items * estimateSize + padding
    // Add extra buffer to ensure we're at the absolute bottom
    const estimatedTotal = timelineItems.length * estimateSize + paddingStart + paddingEnd;
    // Return a large value - browser will clamp to actual scrollHeight
    return estimatedTotal + 10000;
  }, [initialScrollToBottom, timelineItems.length, estimateSize, paddingStart, paddingEnd]);

  // Initialize window virtualizer - OFFICIAL REACT 19 PATTERN
  // useFlushSync: false eliminates React 19 flushSync warnings during scroll
  // Official docs: https://tanstack.com/virtual/latest/docs/framework/react/react-virtual#useflushsync
  // React 19 batches updates naturally, so synchronous flushSync is not needed
  const virtualizer = useWindowVirtualizer({
    count: timelineItems.length,
    estimateSize: () => estimateSize,
    overscan,
    scrollMargin: scrollMarginRef.current,
    paddingStart,
    paddingEnd,
    enabled: shouldEnable,
    useFlushSync: false, // React 19 compatibility - prevents flushSync warning
    // ✅ SSR: Start scrolled to bottom for initial hydration
    initialOffset: getInitialOffset,
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
  // Using ref + forceUpdate pattern for perf - only re-render when margin actually changes
  useLayoutEffect(() => {
    if (timelineItems.length === 0 && scrollMarginRef.current !== 0) {
      scrollMarginRef.current = 0;
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- intentional force re-render
      forceUpdate(c => c + 1);
    }
  }, [timelineItems.length]);

  // ✅ SSR SCROLL FIX: After virtualization enables, scroll to last item
  // initialOffset provides estimated position, this ensures accurate final position
  // BUT: Skip if user manually scrolled during SSR/initial load (user intent takes priority)
  const hasInitialScrolledRef = useRef(false);
  const userScrolledBeforeInitialRef = useRef(false);
  const initialScrollPositionRef = useRef<number | null>(null);

  // Track user scroll BEFORE initial auto-scroll fires
  // If user scrolls away from initial position, skip auto-scroll (respect user intent)
  useEffect(() => {
    // Only track until initial scroll decision is made
    if (hasInitialScrolledRef.current || !initialScrollToBottom)
      return;

    // Capture initial scroll position on mount
    if (initialScrollPositionRef.current === null) {
      initialScrollPositionRef.current = window.scrollY;
    }

    const handleUserScroll = () => {
      // If already processed, ignore
      if (hasInitialScrolledRef.current)
        return;

      const currentScroll = window.scrollY;
      const initialScroll = initialScrollPositionRef.current ?? 0;

      // User scrolled more than 50px from initial position = user intent
      if (Math.abs(currentScroll - initialScroll) > 50) {
        userScrolledBeforeInitialRef.current = true;
      }
    };

    window.addEventListener('scroll', handleUserScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleUserScroll);
  }, [initialScrollToBottom]);

  useLayoutEffect(() => {
    if (
      initialScrollToBottom
      && shouldEnable
      && timelineItems.length > 0
      && !hasInitialScrolledRef.current
    ) {
      hasInitialScrolledRef.current = true;

      // Skip auto-scroll if user already scrolled during initial load
      if (userScrolledBeforeInitialRef.current)
        return;

      // Use virtualizer's scrollToIndex for accurate positioning
      virtualizer.scrollToIndex(timelineItems.length - 1, {
        align: 'end',
        behavior: 'auto',
      });
    }
  }, [initialScrollToBottom, shouldEnable, timelineItems.length, virtualizer]);

  return {
    virtualizer,
    measureElement: virtualizer.measureElement,
    scrollToIndex,
    scrollToOffset,
    scrollToBottom,
    isVirtualizationEnabled: shouldEnable,
  };
}
