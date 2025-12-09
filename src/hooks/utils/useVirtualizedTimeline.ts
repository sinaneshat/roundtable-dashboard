import type { VirtualItem, Virtualizer } from '@tanstack/react-virtual';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { TimelineItem } from './useThreadTimeline';

/**
 * Options for useVirtualizedTimeline hook
 * Following TanStack Virtual official patterns exactly
 */
export type UseVirtualizedTimelineOptions = {
  /** Timeline items to virtualize */
  timelineItems: TimelineItem[];

  /** Estimated size per item in pixels (default: 200) */
  estimateSize?: number;

  /** Items to render outside viewport (default: 5) */
  overscan?: number;

  /** Padding at start of scroll area (default: 0) */
  paddingStart?: number;

  /** Padding at end of scroll area (default: 0) */
  paddingEnd?: number;

  /** Data is ready for rendering (prevents premature render) */
  isDataReady?: boolean;
};

/**
 * Result from useVirtualizedTimeline hook
 */
export type UseVirtualizedTimelineResult = {
  /** Virtualizer instance */
  virtualizer: Virtualizer<Window, Element>;

  /** Virtual items to render */
  virtualItems: VirtualItem[];

  /** Total size of virtualized content */
  totalSize: number;

  /** Scroll margin from top */
  scrollMargin: number;

  /** Ref callback for item measurement */
  measureElement: (element: Element | null) => void;

  /** Scroll to specific index */
  scrollToIndex: (
    index: number,
    options?: { align?: 'start' | 'center' | 'end' | 'auto'; behavior?: 'auto' | 'smooth' },
  ) => void;

  /** Scroll to specific offset */
  scrollToOffset: (
    offset: number,
    options?: { align?: 'start' | 'center' | 'end' | 'auto'; behavior?: 'auto' | 'smooth' },
  ) => void;

  /** Scroll to bottom */
  scrollToBottom: (options?: { behavior?: 'auto' | 'smooth' }) => void;
};

/**
 * useVirtualizedTimeline - Window-level virtualization for chat timeline
 *
 * TanStack Virtual official pattern:
 * - useWindowVirtualizer for window scrolling
 * - estimateSize function returns estimated height
 * - scrollMargin accounts for header offset
 * - measureElement ref enables dynamic sizing
 * - Absolute positioning with translateY transform
 *
 * Key principle: Virtualization is DISABLED until data is ready.
 * This prevents premature height calculations.
 *
 * NOTE: No auto-scroll behavior. Scroll-to-bottom is only triggered
 * by user action via ChatScrollButton.
 */
export function useVirtualizedTimeline({
  timelineItems,
  estimateSize = 200,
  overscan = 5,
  paddingStart = 0,
  paddingEnd = 0,
  isDataReady = true,
}: UseVirtualizedTimelineOptions): UseVirtualizedTimelineResult {
  // Scroll margin (offset from top of page to list start)
  const [scrollMargin, setScrollMargin] = useState(0);
  const scrollMarginMeasuredRef = useRef(false);

  // Determine if virtualizer should be enabled
  // CRITICAL: Disabled until data is ready to prevent premature calculations
  const shouldEnable = isDataReady && timelineItems.length > 0;

  // Measure scroll margin when container exists
  useLayoutEffect(() => {
    if (!shouldEnable)
      return;

    // Only measure once per mount
    if (scrollMarginMeasuredRef.current)
      return;

    const container = document.querySelector('[data-virtualized-timeline]');
    if (container) {
      const rect = container.getBoundingClientRect();
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- DOM measurement requires effect
      setScrollMargin(Math.max(0, rect.top + window.scrollY));
      scrollMarginMeasuredRef.current = true;
    }
  }, [shouldEnable]);

  // Initialize window virtualizer
  // PATTERN: enabled=false prevents any calculation until data ready
  const virtualizer = useWindowVirtualizer({
    count: timelineItems.length,
    estimateSize: () => estimateSize,
    overscan,
    scrollMargin,
    paddingStart,
    paddingEnd,
    enabled: shouldEnable,
  });

  // Memoize virtual items
  const virtualItems = useMemo(
    () => virtualizer.getVirtualItems(),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- virtualizer updates trigger re-render
    [virtualizer, virtualizer.getVirtualItems()],
  );

  const totalSize = virtualizer.getTotalSize();
  const measureElement = virtualizer.measureElement;

  // Scroll methods - wrap virtualizer methods
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

  // Reset scroll margin measurement flag when items become empty (navigation)
  useLayoutEffect(() => {
    if (timelineItems.length === 0) {
      scrollMarginMeasuredRef.current = false;
    }
  }, [timelineItems.length]);

  return {
    virtualizer,
    virtualItems,
    totalSize,
    scrollMargin,
    measureElement,
    scrollToIndex,
    scrollToOffset,
    scrollToBottom,
  };
}
