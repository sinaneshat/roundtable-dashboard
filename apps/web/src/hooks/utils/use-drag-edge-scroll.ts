import type { PanInfo } from 'motion/react';
import { useCallback, useEffect, useRef } from 'react';

type ScrollDirection = 'up' | 'down' | null;

export type UseDragEdgeScrollOptions = {
  scrollContainerRef: React.RefObject<HTMLElement | null>;
  /** Distance from edge to start scrolling (default: 60px) */
  edgeThreshold?: number;
  /** Max scroll speed in px/frame at 60fps (default: 3 = ~180px/sec) */
  maxScrollSpeed?: number;
  /** Enable/disable auto-scroll (default: true) */
  enabled?: boolean;
};

export type UseDragEdgeScrollReturn = {
  onDrag: (event: PointerEvent, info: PanInfo) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  isInScrollZone: boolean;
};

/**
 * Custom edge-scroll hook for drag-and-drop reordering.
 * Provides smooth, controlled auto-scrolling when dragging near scroll container edges.
 * Uses RAF for 60fps animation with quadratic easing (closer to edge = faster).
 */
export function useDragEdgeScroll({
  scrollContainerRef,
  edgeThreshold = 60,
  maxScrollSpeed = 3,
  enabled = true,
}: UseDragEdgeScrollOptions): UseDragEdgeScrollReturn {
  const isDraggingRef = useRef(false);
  const rafIdRef = useRef<number | null>(null);
  const scrollDirectionRef = useRef<ScrollDirection>(null);
  const scrollSpeedRef = useRef(0);
  const isInScrollZoneRef = useRef(false);
  // Cache container rect to avoid getBoundingClientRect() on every pointer move
  const containerRectRef = useRef<DOMRect | null>(null);

  /**
   * Calculate scroll speed using quadratic easing.
   * At edge (0px): Full speed (maxScrollSpeed)
   * At threshold boundary: 0% speed
   */
  const calculateScrollSpeed = useCallback((distanceFromEdge: number): number => {
    const normalized = Math.max(0, 1 - distanceFromEdge / edgeThreshold);
    return normalized * normalized * maxScrollSpeed;
  }, [edgeThreshold, maxScrollSpeed]);

  /**
   * RAF scroll loop - runs continuously while dragging in scroll zone
   */
  const scrollLoop = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || !isDraggingRef.current || scrollDirectionRef.current === null) {
      rafIdRef.current = null;
      return;
    }

    const speed = scrollSpeedRef.current;
    if (speed > 0) {
      const delta = scrollDirectionRef.current === 'up' ? -speed : speed;
      container.scrollTop += delta;
    }

    rafIdRef.current = requestAnimationFrame(scrollLoop);
  }, [scrollContainerRef]);

  /**
   * Start the scroll loop if not already running
   */
  const startScrollLoop = useCallback(() => {
    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(scrollLoop);
    }
  }, [scrollLoop]);

  /**
   * Stop the scroll loop
   */
  const stopScrollLoop = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    scrollDirectionRef.current = null;
    scrollSpeedRef.current = 0;
    isInScrollZoneRef.current = false;
  }, []);

  /**
   * Handle drag movement - calculate scroll direction and speed based on pointer position
   */
  const onDrag = useCallback((event: PointerEvent, _info: PanInfo) => {
    if (!enabled || !isDraggingRef.current || !containerRectRef.current) {
      return;
    }

    // Use cached rect to avoid layout thrashing
    const rect = containerRectRef.current;
    const pointerY = event.clientY;

    // Distance from edges
    const distanceFromTop = pointerY - rect.top;
    const distanceFromBottom = rect.bottom - pointerY;

    // Check if we're in a scroll zone
    if (distanceFromTop < edgeThreshold && distanceFromTop >= 0) {
      // Near top edge - scroll up
      scrollDirectionRef.current = 'up';
      scrollSpeedRef.current = calculateScrollSpeed(distanceFromTop);
      isInScrollZoneRef.current = true;
      startScrollLoop();
    } else if (distanceFromBottom < edgeThreshold && distanceFromBottom >= 0) {
      // Near bottom edge - scroll down
      scrollDirectionRef.current = 'down';
      scrollSpeedRef.current = calculateScrollSpeed(distanceFromBottom);
      isInScrollZoneRef.current = true;
      startScrollLoop();
    } else {
      // Not in scroll zone
      stopScrollLoop();
    }
  }, [enabled, edgeThreshold, calculateScrollSpeed, startScrollLoop, stopScrollLoop]);

  /**
   * Handle drag start - cache container rect for the drag session
   */
  const onDragStart = useCallback(() => {
    isDraggingRef.current = true;
    // Cache rect at drag start to avoid getBoundingClientRect() on every pointer move
    if (scrollContainerRef.current) {
      containerRectRef.current = scrollContainerRef.current.getBoundingClientRect();
    }
  }, [scrollContainerRef]);

  /**
   * Handle drag end - cleanup
   */
  const onDragEnd = useCallback(() => {
    isDraggingRef.current = false;
    containerRectRef.current = null;
    stopScrollLoop();
  }, [stopScrollLoop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  return {
    onDrag,
    onDragStart,
    onDragEnd,
    isInScrollZone: isInScrollZoneRef.current,
  };
}
