import { useEffect, useState } from 'react';

/**
 * Hook to calculate bottom offset for fixed positioning with mobile keyboard support
 *
 * Based on: https://dev.to/anxiny/how-to-keep-an-element-fixed-at-the-bottom-even-when-the-keyboard-is-open-3l0h
 *
 * For window-level virtualized scrolling (useWindowVirtualizer):
 * - Use position: fixed with bottom offset (not absolute with transform)
 * - Only adjust for keyboard (visualViewport.height), NOT scroll position
 * - Let CSS position: fixed handle viewport stickiness during scroll
 *
 * Formula: bottom = innerHeight - visualViewport.height
 * This calculates how much the keyboard is covering the viewport
 */
export function useVisualViewportPosition(): number {
  const [bottom, setBottom] = useState(0);

  useEffect(() => {
    function resizeHandler() {
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const innerHeight = window.innerHeight;

      // Calculate keyboard offset: how much viewport is covered by keyboard
      // When keyboard opens: visualViewport.height < innerHeight
      // bottom offset = difference between full height and visible height
      const keyboardOffset = innerHeight - viewportHeight;

      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- Required by VisualViewport API pattern
      setBottom(keyboardOffset);
    }

    // Run first time to initialize
    resizeHandler();

    // Only subscribe to resize (keyboard open/close)
    // No scroll events - position: fixed handles viewport stickiness
    window.visualViewport?.addEventListener('resize', resizeHandler);

    // Unsubscribe
    return () => {
      window.visualViewport?.removeEventListener('resize', resizeHandler);
    };
  }, []);

  return bottom;
}
