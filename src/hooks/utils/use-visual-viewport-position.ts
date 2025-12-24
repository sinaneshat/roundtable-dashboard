'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Hook to calculate bottom offset for fixed positioning with mobile keyboard support
 *
 * Based on: https://dev.to/anxiny/how-to-keep-an-element-fixed-at-the-bottom-even-when-the-keyboard-is-open-3l0h
 *
 * Improvements:
 * - Detects zoom vs keyboard events (only responds to keyboard)
 * - Filters browser chrome changes (URL bar hide/show on iOS Safari)
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
 *
 * Keyboard vs Browser Chrome Detection:
 * - Mobile keyboards typically take 200-400px+ of screen height
 * - Browser chrome (URL bar) changes are typically 50-100px
 * - We use a threshold (150px) to distinguish between them
 * - This prevents jitter during fast scrolling when browser chrome hides/shows
 */
export function useVisualViewportPosition(): number {
  const [bottom, setBottom] = useState(0);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastScaleRef = useRef(1);
  // Track if keyboard is confirmed open (significant height reduction)
  const isKeyboardOpenRef = useRef(false);
  // Track initial viewport height to detect changes
  const initialHeightRef = useRef<number | null>(null);

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

      // Store initial height on first call
      if (initialHeightRef.current === null) {
        initialHeightRef.current = innerHeight;
      }

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

      // Calculate potential keyboard offset
      const potentialOffset = Math.max(0, innerHeight - viewportHeight);

      // ✅ FIX: Filter browser chrome changes vs actual keyboard events
      // Keyboard threshold: 150px - keyboards are typically 200-400px+
      // Browser chrome (URL bar) hide/show is typically 50-100px
      const KEYBOARD_THRESHOLD = 150;

      // Determine if this is a keyboard event
      const isSignificantChange = potentialOffset > KEYBOARD_THRESHOLD;

      // Track keyboard state transitions
      if (isSignificantChange && !isKeyboardOpenRef.current) {
        // Keyboard just opened
        isKeyboardOpenRef.current = true;
      } else if (potentialOffset < 20 && isKeyboardOpenRef.current) {
        // Keyboard just closed (< 20px accounts for small variations)
        isKeyboardOpenRef.current = false;
      }

      // Only update position for:
      // 1. Keyboard opening (significant change)
      // 2. Keyboard closing (going back to ~0)
      // 3. Adjustments while keyboard is open
      // Ignore browser chrome changes (small changes when keyboard not open)
      if (!isKeyboardOpenRef.current && potentialOffset > 0 && potentialOffset < KEYBOARD_THRESHOLD) {
        // Small change but keyboard not open = browser chrome change, ignore
        return;
      }

      const keyboardOffset = isKeyboardOpenRef.current ? potentialOffset : 0;

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
