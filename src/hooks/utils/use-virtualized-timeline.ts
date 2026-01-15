'use client';

import type { VirtualItem, Virtualizer } from '@tanstack/react-virtual';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { TimelineItem } from './use-thread-timeline';

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

  /**
   * Whether content is actively streaming (participants or moderator)
   * When true, totalSize updates are skipped to prevent scroll jumps
   * caused by height recalculations during streaming.
   */
  isStreaming?: boolean;

  /**
   * Optional getter function to read streaming state directly from store
   * This bypasses React's batching and gets the latest value immediately.
   * Used to prevent race conditions where props are stale but store is updated.
   */
  getIsStreamingFromStore?: () => boolean;
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
 * SSR FIX: Create estimated virtual items for server-side rendering.
 *
 * Problem: Virtualizer needs browser APIs (window, DOM) to calculate visible items.
 * On server, these don't exist, so virtualItems is empty → first paint has no content.
 *
 * Solution: Create estimated items based on item count and estimated size.
 * This ensures server renders with content, preventing hydration flash.
 *
 * Client-side RAF will refine with actual measurements after hydration.
 */
function createSSRVirtualItems(
  itemCount: number,
  estimateSize: number,
  maxItems = 15, // Render up to 15 items for SSR (covers most viewports)
): VirtualItem[] {
  const count = Math.min(itemCount, maxItems);
  return Array.from({ length: count }, (_, index) => ({
    index,
    key: index,
    start: index * estimateSize,
    end: (index + 1) * estimateSize,
    size: estimateSize,
    lane: 0,
  }));
}

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
  isStreaming = false,
  getIsStreamingFromStore,
}: UseVirtualizedTimelineOptions): UseVirtualizedTimelineResult {
  // Scroll margin (offset from top of page to list start)
  const [scrollMargin, setScrollMargin] = useState(0);
  const scrollMarginMeasuredRef = useRef(false);

  // ✅ SSR FIX: Initialize with estimated items for server-side rendering
  // On server, create virtual items based on estimates so first paint has content.
  // On client, RAF will refine with actual measurements after hydration.
  //
  // This fixes the "flash of empty content" issue where:
  // 1. Server rendered empty (virtualItems: []) because virtualizer needs browser APIs
  // 2. Client hydration showed empty content initially
  // 3. Content only appeared after RAF callback ran
  //
  // Now: Server renders with estimated items → Client hydrates with same → RAF refines
  //
  // IMPORTANT: useState initializer function is called once on mount.
  // We pass timelineItems.length and estimateSize as closure values,
  // which are captured at mount time. Subsequent updates are handled by
  // the existing RAF-based sync logic in useLayoutEffects below.
  const [virtualizerState, setVirtualizerState] = useState<VirtualizerState>(() => {
    // Only create SSR items if data is ready and we have items
    if (!isDataReady || timelineItems.length === 0) {
      return { virtualItems: [], totalSize: 0 };
    }

    // On server OR initial client render, use estimated items
    // Client RAF will replace with actual measurements
    const ssrItems = createSSRVirtualItems(timelineItems.length, estimateSize);
    const ssrTotalSize = timelineItems.length * estimateSize;

    return { virtualItems: ssrItems, totalSize: ssrTotalSize };
  });

  // Track if we've done initial sync to prevent duplicate updates
  const hasInitialSyncRef = useRef(false);

  // Track pending RAF to cancel on unmount
  const pendingRafRef = useRef<number | null>(null);

  // ✅ SCROLL FIX: Track streaming state for scroll position preservation
  // During streaming, we allow totalSize to GROW but not SHRINK
  // This allows the container to expand as content streams in while preventing scroll jumps
  const isStreamingRef = useRef(isStreaming);

  // ✅ SCROLL FIX: Track MINIMUM totalSize during streaming (floor, not ceiling)
  // Unlike freezing, this allows container to GROW as content streams
  // but prevents sudden SHRINKING that causes scroll position jumps
  const minTotalSizeRef = useRef<number | null>(null);

  // ✅ SCROLL FIX: Capture minimum size when streaming starts
  // Container can grow larger than this, but never shrink below
  // CRITICAL: Only CAPTURE during render, NEVER reset here
  // Reset happens in the RAF callback to avoid race conditions
  if (isStreaming && minTotalSizeRef.current === null && virtualizerState.totalSize > 0) {
    // Streaming active and no minimum captured yet - capture now
    minTotalSizeRef.current = virtualizerState.totalSize;
  }

  // Update streaming ref for RAF callback
  isStreamingRef.current = isStreaming;

  // Determine if virtualizer should be enabled
  // CRITICAL: Disabled until data is ready to prevent premature calculations
  const shouldEnable = isDataReady && timelineItems.length > 0;

  // Sync virtualizer state - called via RAF to avoid flushSync during render
  // ✅ SCROLL FIX: During streaming, only update virtualItems, NOT totalSize
  const syncVirtualizerState = useCallback((instance: Virtualizer<Window, Element>) => {
    // Cancel any pending RAF
    if (pendingRafRef.current !== null) {
      cancelAnimationFrame(pendingRafRef.current);
    }

    // Schedule state update for next frame - outside React's lifecycle
    pendingRafRef.current = requestAnimationFrame(() => {
      pendingRafRef.current = null;
      const newVirtualItems = instance.getVirtualItems();
      const newTotalSize = instance.getTotalSize();

      // ✅ RACE CONDITION FIX: Check BOTH the ref AND the store directly
      // The ref might be stale if React hasn't re-rendered yet after store update.
      // By also checking the store, we catch cases where:
      // 1. setIsModeratorStreaming(true) was called
      // 2. But React hasn't re-rendered yet to update isStreamingRef
      // 3. And the virtualizer's onChange fires in between
      const isCurrentlyStreaming = isStreamingRef.current
        || (getIsStreamingFromStore ? getIsStreamingFromStore() : false);

      // ✅ SCROLL FIX: During streaming, allow totalSize to GROW but not SHRINK
      // This allows container to expand as content streams in (so users can scroll)
      // while preventing sudden shrinking that causes scroll position jumps
      if (isCurrentlyStreaming && minTotalSizeRef.current !== null) {
        // Update minimum if new size is larger (content growing)
        if (newTotalSize > minTotalSizeRef.current) {
          minTotalSizeRef.current = newTotalSize;
        }
        // Use the larger of actual size or minimum (prevents shrinking)
        const effectiveTotalSize = Math.max(newTotalSize, minTotalSizeRef.current);
        setVirtualizerState(() => ({
          virtualItems: newVirtualItems,
          totalSize: effectiveTotalSize, // Can GROW, cannot SHRINK below minimum
        }));
      } else if (isCurrentlyStreaming && minTotalSizeRef.current === null) {
        // ✅ RACE CONDITION FIX: Streaming just started but we haven't captured minimum yet
        // Capture the CURRENT size as the minimum floor
        minTotalSizeRef.current = newTotalSize;
        setVirtualizerState(() => ({
          virtualItems: newVirtualItems,
          totalSize: newTotalSize, // Use current size as initial minimum
        }));
      } else {
        // ✅ SCROLL FIX: Reset minimum ONLY in RAF callback when NOT streaming
        // This prevents race conditions when participant streaming ends and
        // moderator streaming starts (brief gap would incorrectly reset during render)
        // By resetting here, we ensure streaming is truly finished before clearing
        if (!isCurrentlyStreaming && minTotalSizeRef.current !== null) {
          minTotalSizeRef.current = null;
        }
        // Not streaming - update normally with actual totalSize
        setVirtualizerState({
          virtualItems: newVirtualItems,
          totalSize: newTotalSize,
        });
      }
    });
  }, [getIsStreamingFromStore]);

  // Stable onChange callback using useMemo to prevent virtualizer recreation
  // CRITICAL FIX: Always process onChange even during initial setup.
  // ResizeObserver measurements fire via onChange, and skipping them
  // causes totalSize to stay at the estimated value (200px) instead
  // of the actual measured size. syncVirtualizerState uses RAF so
  // it's safe to call during any phase.
  const onChange = useMemo(() => (instance: Virtualizer<Window, Element>) => {
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
  //
  // ✅ SCROLL FIX STRATEGY:
  // 1. shouldAdjustScrollPositionOnItemSizeChange returns false during streaming
  // 2. Capture MINIMUM totalSize when streaming starts (floor, not ceiling)
  // 3. Allow totalSize to GROW during streaming (container can expand)
  // 4. Prevent totalSize from SHRINKING during streaming (prevents scroll jumps)
  // 5. Keep measureElement ENABLED for proper height tracking
  // 6. Disable CSS overflow-anchor (in global.css)
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

  // ✅ SCROLL FIX: Prevent scroll position adjustments during streaming
  // Pattern from TanStack Virtual maintainers (GitHub Discussion #730):
  // https://github.com/TanStack/virtual/discussions/730
  //
  // The maintainer-recommended pattern:
  // - Only adjust scroll when item is ABOVE current scroll position
  // - Only adjust when user is scrolling BACKWARD (upward)
  // - This allows forward streaming without scroll jumps
  //
  // Combined with streaming check for extra safety during AI message generation
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (
    item,
    _delta,
    instance,
  ) => {
    // ✅ RACE CONDITION FIX: Check BOTH the ref AND the store directly
    // Same as syncVirtualizerState - the ref might be stale
    const isCurrentlyStreaming = isStreamingRef.current
      || (getIsStreamingFromStore ? getIsStreamingFromStore() : false);

    // During streaming, NEVER adjust scroll position
    // This prevents viewport shifts when streaming content changes height
    if (isCurrentlyStreaming) {
      return false;
    }

    // Maintainer pattern: Only adjust for items above scroll position
    // when scrolling backward (reading history). This prevents jumps
    // when new content is added at the bottom during forward scroll.
    const isItemAboveViewport = item.start < (instance.scrollOffset ?? 0);
    const isScrollingBackward = instance.scrollDirection === 'backward';

    return isItemAboveViewport && isScrollingBackward;
  };

  // Initial sync of virtualizer state when virtualizer becomes enabled
  // Use requestAnimationFrame to schedule after React's commit phase completes
  // This avoids "flushSync called during lifecycle" warning
  //
  // NOTE: onChange now handles ResizeObserver measurements directly,
  // so this effect just sets the initial sync flag and does a single read.
  // The actual measurements will come through onChange when ResizeObserver fires.
  useLayoutEffect(() => {
    if (!shouldEnable || hasInitialSyncRef.current) {
      return;
    }
    // Schedule initial sync for next frame - outside React's lifecycle
    pendingRafRef.current = requestAnimationFrame(() => {
      pendingRafRef.current = null;
      hasInitialSyncRef.current = true;
      // Initial read - onChange will update with actual measurements
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
  // ✅ SSR FIX: When shouldEnable becomes true again, immediately populate SSR items
  // This prevents the "flash of empty content" during the gap before RAF runs
  useLayoutEffect(() => {
    if (!shouldEnable) {
      hasInitialSyncRef.current = false;
      // Reset state to prevent stale data
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- Intentional cleanup/reset when virtualizer is disabled
      setVirtualizerState({ virtualItems: [], totalSize: 0 });
    } else if (!hasInitialSyncRef.current && timelineItems.length > 0) {
      // ✅ SSR FIX: shouldEnable just became true with items - immediately set SSR items
      // This bridges the gap between shouldEnable=true and RAF callback
      // RAF will refine with actual measurements later
      const ssrItems = createSSRVirtualItems(timelineItems.length, estimateSize);
      const ssrTotalSize = timelineItems.length * estimateSize;
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- SSR fix: populate items immediately when enabled
      setVirtualizerState({ virtualItems: ssrItems, totalSize: ssrTotalSize });
    }
  }, [shouldEnable, timelineItems.length, estimateSize]);

  // ✅ FIX: Sync virtualizer state when timeline item COUNT changes
  // TanStack Virtual's onChange callback only fires on scroll/resize events, NOT on count changes.
  // When a new timeline item is added (e.g., user submits non-initial round message),
  // the virtualizer's internal count updates but onChange isn't triggered because
  // there's no scroll event. This leaves virtualItems stale with old count.
  //
  // This effect detects count changes and forces a state sync via RAF,
  // ensuring new timeline items are immediately visible without requiring scroll.
  const prevCountRef = useRef<number>(0);
  useLayoutEffect(() => {
    // Only sync if:
    // 1. Virtualizer is enabled
    // 2. Initial sync already completed
    // 3. Count actually changed (not just re-render)
    if (!shouldEnable || !hasInitialSyncRef.current) {
      prevCountRef.current = timelineItems.length;
      return;
    }

    const prevCount = prevCountRef.current;
    const newCount = timelineItems.length;

    // Skip if count hasn't changed
    if (prevCount === newCount) {
      return;
    }

    // Update ref for next comparison
    prevCountRef.current = newCount;

    // Cancel any pending RAF to avoid stale updates
    if (pendingRafRef.current !== null) {
      cancelAnimationFrame(pendingRafRef.current);
    }

    // Schedule sync for next frame - outside React's lifecycle

    pendingRafRef.current = requestAnimationFrame(() => {
      pendingRafRef.current = null;
      const newVirtualItems = virtualizer.getVirtualItems();
      setVirtualizerState({
        virtualItems: newVirtualItems,
        totalSize: virtualizer.getTotalSize(),
      });
    });
  }, [shouldEnable, timelineItems.length, virtualizer]);

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
