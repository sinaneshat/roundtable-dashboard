import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Mobile device detection types
 */
type DeviceType = 'ios' | 'android' | 'desktop';

/**
 * Positioning mode for the chat input container
 */
type PositioningMode = 'fixed' | 'absolute';

/**
 * Options for the mobile keyboard position hook
 */
export type UseMobileKeyboardPositionOptions = {
  /** Whether keyboard positioning is enabled (default: true) */
  enabled?: boolean;
  /** Minimum height change to trigger keyboard detection (default: 100) */
  minKeyboardHeight?: number;
  /** Debounce delay in milliseconds for resize events (default: 150) */
  debounceMs?: number;
  /** iOS safe area bottom inset in pixels (default: 34 for devices with home indicator) */
  iosSafeAreaBottom?: number;
};

/**
 * Return type for the mobile keyboard position hook
 */
export type UseMobileKeyboardPositionReturn = {
  /** Whether keyboard is currently visible */
  isKeyboardVisible: boolean;
  /** Current keyboard height in pixels */
  keyboardHeight: number;
  /** Whether device is mobile (iOS or Android) */
  isMobile: boolean;
  /** Current positioning mode (fixed or absolute) */
  positioningMode: PositioningMode;
  /** iOS-specific safe area offset (only on iOS devices) */
  iosSafeAreaOffset?: number;
};

/**
 * Detect device type from user agent
 */
function detectDeviceType(): DeviceType {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'desktop';
  }

  const userAgent = navigator.userAgent || '';

  // iOS detection
  if (/iPad|iPhone|iPod/.test(userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream) {
    return 'ios';
  }

  // Android detection
  if (/Android/.test(userAgent)) {
    return 'android';
  }

  return 'desktop';
}

/**
 * Hook to manage mobile keyboard positioning using position switching strategy
 *
 * Instead of using CSS transform, this hook switches between fixed and absolute
 * positioning modes based on keyboard visibility. This approach:
 * - Respects document flow
 * - Avoids layout issues with transform
 * - Handles iOS and Android differently
 * - Uses Visual Viewport API for accurate keyboard detection
 *
 * @param containerRef - Ref to the container element that should reposition
 * @param options - Configuration options
 * @returns Keyboard state and positioning information
 *
 * @example
 * ```tsx
 * const inputRef = useRef<HTMLDivElement>(null);
 * const { isKeyboardVisible, positioningMode, isMobile } = useMobileKeyboardPosition(
 *   inputRef,
 *   { enabled: true, minKeyboardHeight: 100 }
 * );
 *
 * return (
 *   <div
 *     ref={inputRef}
 *     className={positioningMode === 'absolute' ? 'absolute' : 'sticky'}
 *   >
 *     <ChatInput />
 *   </div>
 * );
 * ```
 */
export function useMobileKeyboardPosition<T extends HTMLElement>(
  containerRef: React.RefObject<T | null>,
  options: UseMobileKeyboardPositionOptions = {},
): UseMobileKeyboardPositionReturn {
  const {
    enabled = true,
    minKeyboardHeight = 100,
    debounceMs = 150,
    iosSafeAreaBottom = 34,
  } = options;

  // Device detection - useMemo ensures detection happens during render,  allowing test mocks to work
  const deviceType = useMemo(() => detectDeviceType(), []);
  const isMobile = deviceType !== 'desktop';

  // State
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [positioningMode, setPositioningMode] = useState<PositioningMode>('fixed');

  // Refs for tracking
  const initialViewportHeightRef = useRef<number>(0);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const focusTimerRef = useRef<NodeJS.Timeout | null>(null);
  const blurTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Calculate iOS safe area offset
  const iosSafeAreaOffset = deviceType === 'ios' ? iosSafeAreaBottom : undefined;

  useEffect(() => {
    // Only run on mobile devices when enabled
    if (!enabled || !isMobile || typeof window === 'undefined') {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    // Store initial viewport height for comparison
    initialViewportHeightRef.current = window.visualViewport?.height ?? window.innerHeight;

    // VirtualKeyboard API: Enable overlay mode (if supported)
    if ('virtualKeyboard' in navigator && navigator.virtualKeyboard) {
      try {
        navigator.virtualKeyboard.overlaysContent = true;
      } catch {
        // Silently fail if not supported
      }
    }

    // Handle Visual Viewport resize (keyboard open/close)
    const handleViewportResize = () => {
      // Clear any pending debounce
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Debounce the resize handling
      debounceTimerRef.current = setTimeout(() => {
        const visualViewport = window.visualViewport;
        if (!visualViewport) {
          return;
        }

        const currentHeight = visualViewport.height;
        const initialHeight = initialViewportHeightRef.current;
        const heightDifference = initialHeight - currentHeight;

        // Keyboard is considered visible if viewport height decreased significantly
        if (heightDifference > minKeyboardHeight) {
          // Keyboard opened
          setIsKeyboardVisible(true);
          setKeyboardHeight(heightDifference);
          setPositioningMode('absolute');

          // Apply absolute positioning with bottom offset
          container.style.position = 'absolute';
          const bottomOffset = deviceType === 'ios'
            ? `${heightDifference - iosSafeAreaBottom}px`
            : `${heightDifference}px`;
          container.style.bottom = bottomOffset;
          container.style.left = '0';
          container.style.right = '0';
          container.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        } else {
          // Keyboard closed
          setIsKeyboardVisible(false);
          setKeyboardHeight(0);
          setPositioningMode('fixed');

          // Revert to default positioning
          container.style.position = '';
          container.style.bottom = '';
          container.style.left = '';
          container.style.right = '';
          container.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        }
      }, debounceMs);
    };

    // Handle focus events on input elements (immediate check)
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT'
        || target.tagName === 'TEXTAREA'
        || target.contentEditable === 'true'
      ) {
        // Trigger resize handler after a short delay to allow keyboard to open
        focusTimerRef.current = setTimeout(() => {
          handleViewportResize();
        }, 100);
      }
    };

    // Handle blur events
    const handleFocusOut = () => {
      // Trigger resize handler after a short delay to allow keyboard to close
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

      // Clear any pending timers
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (focusTimerRef.current) {
        clearTimeout(focusTimerRef.current);
        focusTimerRef.current = null;
      }
      if (blurTimerRef.current) {
        clearTimeout(blurTimerRef.current);
        blurTimerRef.current = null;
      }

      // Reset container styles
      if (container) {
        container.style.position = '';
        container.style.bottom = '';
        container.style.left = '';
        container.style.right = '';
        container.style.transition = '';
      }
    };
  }, [enabled, containerRef, minKeyboardHeight, debounceMs, isMobile, iosSafeAreaBottom, deviceType]);

  return {
    keyboardHeight,
    isKeyboardVisible,
    isMobile,
    positioningMode,
    ...(deviceType === 'ios' && { iosSafeAreaOffset }),
  };
}
