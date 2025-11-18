import { useEffect, useRef, useState } from 'react';

/**
 * Hook to calculate bottom offset for fixed positioning with mobile keyboard support
 *
 * Based on: https://dev.to/anxiny/how-to-keep-an-element-fixed-at-the-bottom-even-when-the-keyboard-is-open-3l0h
 *
 * Improvements:
 * - Detects zoom vs keyboard events (only responds to keyboard)
 * - Debounced updates to prevent jitter during scroll
 * - Ignores pinch-zoom and browser zoom events
 *
 * For window-level virtualized scrolling (useWindowVirtualizer):
 * - Use position: sticky with bottom offset
 * - Only adjust for keyboard (visualViewport.height), NOT scroll position or zoom
 * - Let CSS position: sticky handle viewport stickiness during scroll
 *
 * Formula: bottom = innerHeight - visualViewport.height (when scale = 1)
 * This calculates how much the keyboard is covering the viewport
 */
export function useVisualViewportPosition(): number {
  const [bottom, setBottom] = useState(0);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastScaleRef = useRef(1);

  useEffect(() => {
    function resizeHandler() {
      const viewport = window.visualViewport;
      if (!viewport) {
        // Fallback for browsers without visualViewport support
        // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- Required by VisualViewport API pattern
        setBottom(0);
        return;
      }

      const currentScale = viewport.scale ?? 1;
      const viewportHeight = viewport.height;
      const innerHeight = window.innerHeight;

      // ✅ FIX: Detect zoom events and ignore them
      // Only respond to keyboard events (scale remains 1.0)
      // Zoom events change scale (e.g., 1.0 → 1.5 on pinch-zoom)
      const isZoomEvent = Math.abs(currentScale - lastScaleRef.current) > 0.01;
      lastScaleRef.current = currentScale;

      if (isZoomEvent) {
        // Ignore zoom events - don't move the input
        return;
      }

      // Only process keyboard events (when scale is ~1.0)
      if (currentScale > 1.01) {
        // User is zoomed in - keep previous offset
        return;
      }

      // Calculate keyboard offset: how much viewport is covered by keyboard
      // When keyboard opens: visualViewport.height < innerHeight
      // bottom offset = difference between full height and visible height
      const keyboardOffset = Math.max(0, innerHeight - viewportHeight);

      // ✅ FIX: Debounce updates to prevent jitter during rapid resize events
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        setBottom(keyboardOffset);
      }, 16); // ~60fps debounce
    }

    // Run first time to initialize
    resizeHandler();

    // Only subscribe to resize (keyboard open/close)
    // No scroll events - position: sticky handles viewport stickiness
    window.visualViewport?.addEventListener('resize', resizeHandler);

    // Cleanup
    return () => {
      window.visualViewport?.removeEventListener('resize', resizeHandler);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return bottom;
}
