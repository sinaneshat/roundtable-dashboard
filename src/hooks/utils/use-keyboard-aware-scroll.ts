import { useEffect, useRef } from 'react';

// VirtualKeyboard API type definitions (not yet in lib.dom.d.ts)
type VirtualKeyboard = EventTarget & {
  overlaysContent: boolean;
  boundingRect: DOMRect;
  show: () => void;
  hide: () => void;
};

declare global {
  // eslint-disable-next-line ts/consistent-type-definitions
  interface Navigator {
    virtualKeyboard?: VirtualKeyboard;
  }
}

/**
 * Custom hook for handling mobile keyboard visibility and ensuring input remains visible
 * Combines VirtualKeyboard API, Visual Viewport API, and focus handling
 *
 * Based on 2025 best practices:
 * - VirtualKeyboard API with keyboard-inset-height CSS variable
 * - Visual Viewport API for cross-browser support
 * - ScrollIntoView on focus with proper timing
 * - Aggressive scroll container handling for sticky elements
 *
 * @param inputRef - Ref to the input/textarea element that should remain visible
 * @param options - Configuration options
 * @param options.enabled - Whether the keyboard-aware scroll is enabled (default: true)
 * @param options.scrollDelay - Delay in ms before scrolling (default: 300)
 * @param options.scrollBehavior - Scroll behavior: 'smooth' or 'auto' (default: 'smooth')
 * @param options.scrollBlock - Vertical alignment: 'start', 'center', 'end', or 'nearest' (default: 'center')
 * @param options.scrollContainerId - Optional ID of the scroll container to scroll (for sticky elements)
 * @param options.additionalOffset - Additional offset in pixels to add to the scroll (default: 20)
 */
export function useKeyboardAwareScroll<T extends HTMLElement>(
  inputRef: React.RefObject<T | null>,
  options: {
    enabled?: boolean;
    scrollDelay?: number;
    scrollBehavior?: ScrollBehavior;
    scrollBlock?: ScrollLogicalPosition;
    scrollContainerId?: string;
    additionalOffset?: number;
  } = {},
) {
  const {
    enabled = true,
    scrollDelay = 300,
    scrollBehavior = 'smooth',
    scrollBlock = 'center',
    scrollContainerId,
    additionalOffset = 20,
  } = options;

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isKeyboardVisibleRef = useRef(false);
  const initialViewportHeightRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined')
      return;

    const input = inputRef.current;
    if (!input)
      return;

    // Store initial viewport height for comparison
    initialViewportHeightRef.current = window.visualViewport?.height ?? window.innerHeight;

    // VirtualKeyboard API: Opt into overlay mode to get keyboard-inset-height
    // This makes the keyboard overlay the content instead of resizing the viewport
    if ('virtualKeyboard' in navigator && navigator.virtualKeyboard) {
      try {
        // Enable overlay mode to activate keyboard-inset-height CSS variable
        navigator.virtualKeyboard.overlaysContent = true;
      } catch {
        // Silently fail if not supported
      }
    }

    // Helper function to scroll the nearest scroll container or the entire page
    const scrollToInput = (delayMs: number = 0) => {
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      timeoutRef.current = setTimeout(() => {
        const rect = input.getBoundingClientRect();
        const visualViewport = window.visualViewport;
        const viewportHeight = visualViewport?.height ?? window.innerHeight;

        // Check if we have a specific scroll container
        const scrollContainer = scrollContainerId
          ? document.getElementById(scrollContainerId)
          : null;

        if (scrollContainer) {
          // Scroll the container to bring the input into view
          const containerRect = scrollContainer.getBoundingClientRect();
          const relativeBottom = rect.bottom - containerRect.top;

          // Calculate how much we need to scroll
          // We want the input to be visible with some additional offset
          const targetScroll = relativeBottom - viewportHeight + additionalOffset;

          if (targetScroll > 0) {
            scrollContainer.scrollBy({
              top: targetScroll,
              behavior: scrollBehavior,
            });
          }
        } else {
          // Fallback to scrollIntoView for the input element
          input.scrollIntoView({
            behavior: scrollBehavior,
            block: scrollBlock,
            inline: 'nearest',
          });
        }

        // Additional aggressive scroll for edge cases
        // If input is still hidden after scrollIntoView, scroll window to bottom
        const aggressiveScrollTimer = setTimeout(() => {
          const updatedRect = input.getBoundingClientRect();
          const currentViewportHeight = visualViewport?.height ?? window.innerHeight;

          if (updatedRect.bottom > currentViewportHeight - additionalOffset) {
            window.scrollBy({
              top: updatedRect.bottom - currentViewportHeight + additionalOffset,
              behavior: scrollBehavior,
            });
          }
        }, 100);

        // Store timeout for cleanup
        return () => clearTimeout(aggressiveScrollTimer);
      }, delayMs);
    };

    // Focus handler: Scroll input into view when keyboard opens
    const handleFocus = () => {
      isKeyboardVisibleRef.current = true;
      scrollToInput(scrollDelay);
    };

    // Input handler: Re-scroll on input to handle growing textarea
    const handleInput = () => {
      if (isKeyboardVisibleRef.current) {
        scrollToInput(50); // Shorter delay for input events
      }
    };

    // Blur handler: Track keyboard visibility
    const handleBlur = () => {
      isKeyboardVisibleRef.current = false;
    };

    // Visual Viewport API: Handle viewport resize (keyboard open/close)
    let visualViewport: VisualViewport | null = null;
    const handleViewportResize = () => {
      // Only act if input is focused (keyboard likely visible)
      if (!isKeyboardVisibleRef.current)
        return;

      const currentHeight = visualViewport?.height ?? window.innerHeight;
      const heightDifference = initialViewportHeightRef.current - currentHeight;

      // If viewport height decreased significantly (keyboard opened)
      if (heightDifference > 100) {
        scrollToInput(100);
      }
    };

    // Setup Visual Viewport listener if available
    if (window.visualViewport) {
      visualViewport = window.visualViewport;
      visualViewport.addEventListener('resize', handleViewportResize);
    }

    // Add focus/blur/input listeners
    input.addEventListener('focus', handleFocus);
    input.addEventListener('blur', handleBlur);
    input.addEventListener('input', handleInput);

    // Cleanup
    return () => {
      input.removeEventListener('focus', handleFocus);
      input.removeEventListener('blur', handleBlur);
      input.removeEventListener('input', handleInput);

      if (visualViewport) {
        visualViewport.removeEventListener('resize', handleViewportResize);
      }

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [enabled, inputRef, scrollDelay, scrollBehavior, scrollBlock, scrollContainerId, additionalOffset]);
}
