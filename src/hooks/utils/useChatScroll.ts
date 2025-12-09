import type { UIMessage } from 'ai';
import { useCallback, useEffect, useEffectEvent, useRef } from 'react';

import type { StoredModeratorAnalysis } from '@/api/routes/chat/schema';

/**
 * Chat scroll management hook - Minimal version
 *
 * With window-based virtualization (useWindowVirtualizer), most scroll logic
 * is handled by TanStack Virtual. This hook provides:
 *
 * 1. isAtBottomRef - Track if user is at bottom (for scroll button visibility)
 * 2. scrollToBottom - Simple window scroll function
 * 3. Auto-scroll on new user messages (submit flow)
 *
 * What this hook does NOT do:
 * - Initial scroll to bottom (handled by useVirtualizedTimeline)
 * - Streaming auto-scroll (disabled - user controls scroll during streaming)
 * - Container-based scrolling (we use window scrolling)
 */

type UseChatScrollParams = {
  /** Messages array - used to detect new messages */
  messages: UIMessage[];
  /** Analyses array - used to track seen analyses */
  analyses: StoredModeratorAnalysis[];
  /** Enable near-bottom detection for sticky scroll behavior */
  enableNearBottomDetection?: boolean;
  /** Distance from bottom to consider "at bottom" (default: 100px) */
  autoScrollThreshold?: number;
};

type UseChatScrollResult = {
  /** Ref tracking if scroll is "sticky" (following new content) */
  isAtBottomRef: React.MutableRefObject<boolean>;
  /** Scroll to bottom of the page */
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  /** Track which analyses have been scrolled to */
  scrolledToAnalysesRef: React.MutableRefObject<Set<string>>;
  /** Reset all scroll state */
  resetScrollState: () => void;
};

export function useChatScroll({
  messages,
  analyses,
  enableNearBottomDetection = true,
  autoScrollThreshold = 100,
}: UseChatScrollParams): UseChatScrollResult {
  // Track if user is at bottom (for scroll button visibility)
  const isAtBottomRef = useRef(true);

  // Track which analyses have been scrolled to
  const scrolledToAnalysesRef = useRef<Set<string>>(new Set());

  // Track if we're in a programmatic scroll
  const isProgrammaticScrollRef = useRef(false);

  // Track last scroll position for direction detection
  const lastScrollTopRef = useRef<number>(0);

  /**
   * Reset all scroll state
   */
  const resetScrollState = useCallback(() => {
    isAtBottomRef.current = true;
    scrolledToAnalysesRef.current = new Set();
    lastScrollTopRef.current = 0;
    isProgrammaticScrollRef.current = false;
  }, []);

  // Reset when messages become empty (navigation)
  useEffect(() => {
    if (messages.length === 0) {
      resetScrollState();
    }
  }, [messages.length, resetScrollState]);

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

  // ============================================================================
  // Track analyses
  // ============================================================================
  useEffect(() => {
    const newAnalyses = analyses.filter(a => !scrolledToAnalysesRef.current.has(a.id));
    if (newAnalyses.length > 0) {
      newAnalyses.forEach(a => scrolledToAnalysesRef.current.add(a.id));
    }
  }, [analyses]);

  return {
    isAtBottomRef,
    scrollToBottom,
    scrolledToAnalysesRef,
    resetScrollState,
  };
}
