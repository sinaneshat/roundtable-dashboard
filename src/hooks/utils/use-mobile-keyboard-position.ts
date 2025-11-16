import { useEffect, useRef, useState } from 'react';

/**
 * Hook to manage mobile keyboard positioning
 * Moves the chatbox container up when keyboard opens to prevent it from being hidden
 *
 * Uses Visual Viewport API and VirtualKeyboard API for accurate keyboard detection
 * Applies CSS transform to move container above keyboard
 *
 * @param containerRef - Ref to the container element that should move above keyboard
 * @param options - Configuration options
 * @param options.enabled - Whether keyboard positioning is enabled (default: true)
 * @param options.minKeyboardHeight - Minimum height change to trigger keyboard detection (default: 100)
 * @returns Current keyboard height and visibility state
 */
export function useMobileKeyboardPosition<T extends HTMLElement>(
  containerRef: React.RefObject<T | null>,
  options: {
    enabled?: boolean;
    minKeyboardHeight?: number;
  } = {},
) {
  const { enabled = true, minKeyboardHeight = 100 } = options;

  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const initialViewportHeightRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    // Store initial viewport height for comparison
    initialViewportHeightRef.current = window.visualViewport?.height ?? window.innerHeight;

    // VirtualKeyboard API: Enable overlay mode
    if ('virtualKeyboard' in navigator && navigator.virtualKeyboard) {
      try {
        navigator.virtualKeyboard.overlaysContent = true;
      } catch {
        // Silently fail if not supported
      }
    }

    // Handle Visual Viewport resize (keyboard open/close)
    const handleViewportResize = () => {
      const visualViewport = window.visualViewport;
      if (!visualViewport) {
        return;
      }

      const currentHeight = visualViewport.height;
      const initialHeight = initialViewportHeightRef.current;
      const heightDifference = initialHeight - currentHeight;

      // Keyboard is considered visible if viewport height decreased significantly
      if (heightDifference > minKeyboardHeight) {
        setIsKeyboardVisible(true);
        setKeyboardHeight(heightDifference);

        // Apply transform to move container up
        container.style.transform = `translateY(-${heightDifference}px)`;
        container.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
      } else {
        setIsKeyboardVisible(false);
        setKeyboardHeight(0);

        // Reset transform
        container.style.transform = '';
        container.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
      }
    };

    // Handle focus events on input elements
    const focusTimerRef = { current: null as NodeJS.Timeout | null };
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT'
        || target.tagName === 'TEXTAREA'
        || target.contentEditable === 'true'
      ) {
        // Wait for keyboard to open
        focusTimerRef.current = setTimeout(() => {
          handleViewportResize();
        }, 100);
      }
    };

    // Handle blur events
    const blurTimerRef = { current: null as NodeJS.Timeout | null };
    const handleFocusOut = () => {
      // Wait for keyboard to close
      blurTimerRef.current = setTimeout(() => {
        handleViewportResize();
      }, 100);
    };

    // Setup Visual Viewport listener if available
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportResize);
    }

    // Setup focus/blur listeners on document
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);

    // Cleanup
    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewportResize);
      }
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);

      // Clear any pending timeouts
      if (focusTimerRef.current) {
        clearTimeout(focusTimerRef.current);
      }
      if (blurTimerRef.current) {
        clearTimeout(blurTimerRef.current);
      }

      // Reset container styles
      if (container) {
        container.style.transform = '';
        container.style.transition = '';
      }
    };
  }, [enabled, containerRef, minKeyboardHeight]);

  return {
    keyboardHeight,
    isKeyboardVisible,
  };
}
