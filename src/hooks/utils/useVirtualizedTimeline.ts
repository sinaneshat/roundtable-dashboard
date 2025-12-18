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
 * Virtualizer state that's synced outside of render to avoid flushSync warnings
 * TanStack Virtual internally calls flushSync when calculating measurements,
 * which React doesn't allow during render or lifecycle methods.
 */
type VirtualizerState = {
  virtualItems: VirtualItem[];
  totalSize: number;
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
 * CRITICAL FIX: All virtualizer method calls (getVirtualItems, getTotalSize) are
 * deferred to outside React's render/lifecycle phases using requestAnimationFrame.
 * This prevents "flushSync called during lifecycle" warnings.
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

  // CRITICAL FIX: Store virtualizer output in state to avoid calling methods during render
  // getVirtualItems() and getTotalSize() both trigger flushSync internally
  const [virtualizerState, setVirtualizerState] = useState<VirtualizerState>({
    virtualItems: [],
    totalSize: 0,
  });

  // Track if we've done initial sync to prevent duplicate updates
  const hasInitialSyncRef = useRef(false);

  // Track pending RAF to cancel on unmount
  const pendingRafRef = useRef<number | null>(null);

  // Determine if virtualizer should be enabled
  // CRITICAL: Disabled until data is ready to prevent premature calculations
  const shouldEnable = isDataReady && timelineItems.length > 0;

  // Sync virtualizer state - called via RAF to avoid flushSync during render
  const syncVirtualizerState = useCallback((instance: Virtualizer<Window, Element>) => {
    // Cancel any pending RAF
    if (pendingRafRef.current !== null) {
      cancelAnimationFrame(pendingRafRef.current);
    }

    // Schedule state update for next frame - outside React's lifecycle
    pendingRafRef.current = requestAnimationFrame(() => {
      pendingRafRef.current = null;
      setVirtualizerState({
        virtualItems: instance.getVirtualItems(),
        totalSize: instance.getTotalSize(),
      });
    });
  }, []);

  // Stable onChange callback using useMemo to prevent virtualizer recreation
  const onChange = useMemo(() => (instance: Virtualizer<Window, Element>) => {
    // Skip during initial sync - useLayoutEffect handles the first update
    // This callback handles subsequent scroll/resize updates
    if (!hasInitialSyncRef.current) {
      return;
    }
    syncVirtualizerState(instance);
  }, [syncVirtualizerState]);

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
  // onChange callback updates state instead of calling methods during render
  const virtualizer = useWindowVirtualizer({
    count: timelineItems.length,
    estimateSize: () => estimateSize,
    overscan,
    scrollMargin,
    paddingStart,
    paddingEnd,
    enabled: shouldEnable,
    onChange,
  });

  // Initial sync of virtualizer state when virtualizer becomes enabled
  // Use requestAnimationFrame to schedule after React's commit phase completes
  // This avoids "flushSync called during lifecycle" warning
  useLayoutEffect(() => {
    if (!shouldEnable || hasInitialSyncRef.current) {
      return;
    }
    // Schedule initial sync for next frame - outside React's lifecycle
    pendingRafRef.current = requestAnimationFrame(() => {
      pendingRafRef.current = null;
      hasInitialSyncRef.current = true;
      setVirtualizerState({
        virtualItems: virtualizer.getVirtualItems(),
        totalSize: virtualizer.getTotalSize(),
      });
    });
    return () => {
      if (pendingRafRef.current !== null) {
        cancelAnimationFrame(pendingRafRef.current);
        pendingRafRef.current = null;
      }
    };
  }, [shouldEnable, virtualizer]);

  // Reset initial sync flag when virtualizer is disabled (e.g., navigation)
  useLayoutEffect(() => {
    if (!shouldEnable) {
      hasInitialSyncRef.current = false;
      // Reset state to prevent stale data
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- Intentional cleanup/reset when virtualizer is disabled
      setVirtualizerState({ virtualItems: [], totalSize: 0 });
    }
  }, [shouldEnable]);

  // Cleanup pending RAF on unmount
  useLayoutEffect(() => {
    return () => {
      if (pendingRafRef.current !== null) {
        cancelAnimationFrame(pendingRafRef.current);
        pendingRafRef.current = null;
      }
    };
  }, []);

  // measureElement doesn't trigger flushSync, safe to access directly
  const measureElement = virtualizer.measureElement;

  // Scroll methods - wrap virtualizer methods
  // These are called from event handlers, not during render, so they're safe
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
    virtualItems: virtualizerState.virtualItems,
    totalSize: virtualizerState.totalSize,
    scrollMargin,
    measureElement,
    scrollToIndex,
    scrollToOffset,
    scrollToBottom,
  };
}
