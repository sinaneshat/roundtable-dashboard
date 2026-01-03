'use client';

import type { UIMessage } from 'ai';
import { useCallback, useEffect, useEffectEvent, useRef } from 'react';

/**
 * Chat scroll management hook - Scroll position tracking and manual scroll control
 *
 * SCROLL BEHAVIOR GROUND RULES:
 * ============================================================================================
 *
 * WHEN SCROLL HAPPENS:
 * - User manual action ONLY: ChatScrollButton click triggers scrollToBottom()
 *
 * WHEN SCROLL DOES NOT HAPPEN (NEVER AUTO-SCROLL):
 * - Initial load: NO auto-scroll - user uses ChatScrollButton if needed
 * - During streaming: NO auto-scroll - users control scroll position during AI responses
 * - During message updates: NO auto-scroll - prevents interrupting user reading
 * - During content changes: NO auto-scroll - users stay where they scrolled to
 *
 * HOW USERS CONTROL SCROLL:
 * - ChatScrollButton: Manual scroll to bottom when user wants to jump to latest content
 * - Natural scrolling: Users can scroll freely without auto-scroll interference
 * - Sticky detection: isAtBottomRef tracks if user is at bottom (for scroll button visibility)
 *
 * SEPARATION OF CONCERNS:
 * - useChatScroll (this hook): Tracks scroll position, provides manual scrollToBottom function
 * - TanStack Virtual (useWindowVirtualizer): Handles virtualization and efficient rendering
 * - ChatScrollButton: UI control for manual scroll to bottom
 *
 * ============================================================================================
 *
 * This hook provides:
 * 1. isAtBottomRef - Track if user is at bottom (for scroll button visibility)
 * 2. scrollToBottom - Simple window scroll function (manual trigger only)
 * 3. resetScrollState - Reset scroll tracking state
 *
 * What this hook does NOT do:
 * - ANY auto-scroll (DISABLED - user has full control)
 * - Streaming auto-scroll (DISABLED - user controls scroll during streaming)
 * - Container-based scrolling (we use window-based scrolling)
 * - Auto-scroll on message updates (DISABLED - prevents interrupting user)
 */

type UseChatScrollParams = {
  /** Messages array - used to detect new messages */
  messages: UIMessage[];
  /** Enable near-bottom detection for sticky scroll behavior */
  enableNearBottomDetection?: boolean;
  /** Distance from bottom to consider "at bottom" (default: 100px) */
  autoScrollThreshold?: number;
};

type UseChatScrollResult = {
  /** Ref tracking if scroll is "sticky" (following new content) */
  isAtBottomRef: React.RefObject<boolean>;
  /** Scroll to bottom of the page */
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  /** Reset all scroll state */
  resetScrollState: () => void;
};

export function useChatScroll({
  messages,
  enableNearBottomDetection = true,
  autoScrollThreshold = 100,
}: UseChatScrollParams): UseChatScrollResult {
  // Track if user is at bottom (for scroll button visibility)
  const isAtBottomRef = useRef(true);

  // Track if we're in a programmatic scroll
  const isProgrammaticScrollRef = useRef(false);

  // Track last scroll position for direction detection
  const lastScrollTopRef = useRef<number>(0);

  /**
   * Reset all scroll state
   */
  const resetScrollState = useCallback(() => {
    isAtBottomRef.current = true;
    lastScrollTopRef.current = 0;
    isProgrammaticScrollRef.current = false;
  }, []);

  // Reset when messages become empty (navigation)
  // resetScrollState is stable (empty deps useCallback) so excluding from deps is safe
  useEffect(() => {
    if (messages.length === 0) {
      resetScrollState();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resetScrollState is stable
  }, [messages.length]);

  /**
   * Scroll to bottom using native window.scrollTo
   * TanStack Virtual handles the heavy lifting - this is just a simple helper
   */
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    isProgrammaticScrollRef.current = true;
    isAtBottomRef.current = true;

    requestAnimationFrame(() => {
      const scrollHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
      );
      window.scrollTo({ top: scrollHeight, behavior });

      // Reset programmatic flag after scroll completes
      requestAnimationFrame(() => {
        isProgrammaticScrollRef.current = false;
      });
    });
  }, []);

  // ============================================================================
  // Track user scroll intent (sticky/unsticky state)
  // ============================================================================
  const onScroll = useEffectEvent(() => {
    if (isProgrammaticScrollRef.current)
      return;

    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollHeight = document.documentElement.scrollHeight;
    const clientHeight = window.innerHeight;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    const scrollDelta = scrollTop - lastScrollTopRef.current;
    lastScrollTopRef.current = scrollTop;

    // Scroll up = unstick, reach bottom = stick
    if (scrollDelta < -10) {
      isAtBottomRef.current = false;
    } else if (distanceFromBottom <= autoScrollThreshold) {
      isAtBottomRef.current = true;
    }
  });

  useEffect(() => {
    if (!enableNearBottomDetection) {
      isAtBottomRef.current = true;
      return undefined;
    }

    let ticking = false;

    const handleScroll = () => {
      if (ticking)
        return;

      ticking = true;
      requestAnimationFrame(() => {
        onScroll();
        ticking = false;
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    lastScrollTopRef.current = window.scrollY || document.documentElement.scrollTop;

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [enableNearBottomDetection]);

  return {
    isAtBottomRef,
    scrollToBottom,
    resetScrollState,
  };
}
