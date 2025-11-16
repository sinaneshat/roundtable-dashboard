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
 *
 * @param inputRef - Ref to the input/textarea element that should remain visible
 * @param options - Configuration options
 * @param options.enabled - Whether the keyboard-aware scroll is enabled (default: true)
 * @param options.scrollDelay - Delay in ms before scrolling (default: 300)
 * @param options.scrollBehavior - Scroll behavior: 'smooth' or 'auto' (default: 'smooth')
 * @param options.scrollBlock - Vertical alignment: 'start', 'center', 'end', or 'nearest' (default: 'center')
 */
export function useKeyboardAwareScroll<T extends HTMLElement>(
  inputRef: React.RefObject<T | null>,
  options: {
    enabled?: boolean;
    scrollDelay?: number;
    scrollBehavior?: ScrollBehavior;
    scrollBlock?: ScrollLogicalPosition;
  } = {},
) {
  const {
    enabled = true,
    scrollDelay = 300,
    scrollBehavior = 'smooth',
    scrollBlock = 'center',
  } = options;

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isKeyboardVisibleRef = useRef(false);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined')
      return;

    const input = inputRef.current;
    if (!input)
      return;

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

    // Focus handler: Scroll input into view when keyboard opens
    const handleFocus = () => {
      isKeyboardVisibleRef.current = true;

      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      // Delay to allow keyboard animation to start
      timeoutRef.current = setTimeout(() => {
        input.scrollIntoView({
          behavior: scrollBehavior,
          block: scrollBlock,
          inline: 'nearest',
        });
      }, scrollDelay);
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

      // Check if input is hidden by keyboard
      const rect = input.getBoundingClientRect();
      const viewportHeight = visualViewport?.height ?? window.innerHeight;
      const scrollY = visualViewport?.offsetTop ?? 0;

      // If input is below visible area, scroll it into view
      if (rect.bottom > viewportHeight + scrollY) {
        // Use 'end' to position at bottom of viewport
        input.scrollIntoView({
          behavior: scrollBehavior,
          block: 'end',
          inline: 'nearest',
        });
      }
    };

    // Setup Visual Viewport listener if available
    if (window.visualViewport) {
      visualViewport = window.visualViewport;
      visualViewport.addEventListener('resize', handleViewportResize);
    }

    // Add focus/blur listeners
    input.addEventListener('focus', handleFocus);
    input.addEventListener('blur', handleBlur);

    // Cleanup
    return () => {
      input.removeEventListener('focus', handleFocus);
      input.removeEventListener('blur', handleBlur);

      if (visualViewport) {
        visualViewport.removeEventListener('resize', handleViewportResize);
      }

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [enabled, inputRef, scrollDelay, scrollBehavior, scrollBlock]);
}
