import type { UIMessage } from 'ai';
import { useCallback, useEffect, useRef } from 'react';

import type { StoredModeratorAnalysis } from '@/api/routes/chat/schema';

type UseChatScrollParams = {
  messages: UIMessage[];
  analyses: StoredModeratorAnalysis[];
  isStreaming: boolean;
  scrollContainerId?: string;
  enableNearBottomDetection?: boolean;
  /**
   * Distance from bottom in pixels to consider "at bottom"
   * When user is within this distance, sticky mode is engaged
   * Default: 100px
   */
  autoScrollThreshold?: number;
  /**
   * Current participant index during streaming
   * Used to trigger auto-scroll when participants take turns
   */
  currentParticipantIndex?: number;
  /**
   * Extra offset in pixels to scroll past bottom to account for sticky elements
   * Default: 0
   */
  bottomOffset?: number;
};

type UseChatScrollResult = {
  /**
   * Ref tracking if scroll is "sticky" (following new content)
   * - true: User is at bottom, auto-scroll is active
   * - false: User scrolled up, auto-scroll is disabled until they return to bottom
   */
  isAtBottomRef: React.MutableRefObject<boolean>;
  /**
   * Scroll to bottom of the chat
   * @param behavior - Scroll animation behavior ('smooth' | 'instant')
   */
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  scrolledToAnalysesRef: React.MutableRefObject<Set<string>>;
  /**
   * Reset all scroll state to initial values
   * Call this when navigating to a new thread or overview
   */
  resetScrollState: () => void;
};

/**
 * ✅ REWRITTEN: Following use-stick-to-bottom pattern for window-level scrolling
 *
 * KEY PRINCIPLES:
 * 1. "Sticky" state = whether to auto-scroll (like use-stick-to-bottom's isAtBottom)
 * 2. User scrolling UP = unstick (immediate)
 * 3. User reaching bottom = stick (automatic)
 * 4. Only scroll when sticky AND during active participant streaming
 * 5. NEVER scroll due to layout shifts, changelogs, analyses, or pre-search
 *
 * This prevents snap-back issues when changelogs or other content appears.
 */
export function useChatScroll({
  messages,
  analyses,
  isStreaming,
  scrollContainerId: _scrollContainerId = 'chat-scroll-container', // Unused after ResizeObserver removal
  enableNearBottomDetection = true,
  autoScrollThreshold = 100,
  currentParticipantIndex: _currentParticipantIndex,
  bottomOffset = 0,
}: UseChatScrollParams): UseChatScrollResult {
  // ✅ STICKY STATE: Like use-stick-to-bottom's isAtBottom
  // true = following new content, false = user opted out by scrolling up
  const isAtBottomRef = useRef(true);

  // Track which analyses have been scrolled to (prevent duplicate scrolls)
  const scrolledToAnalysesRef = useRef<Set<string>>(new Set());

  // Track if we're in a programmatic scroll (to ignore scroll events during)
  const isProgrammaticScrollRef = useRef(false);

  // Track last known scroll position for direction detection
  const lastScrollTopRef = useRef<number>(0);

  /**
   * Reset all scroll state to initial values
   */
  const resetScrollState = useCallback(() => {
    isAtBottomRef.current = true;
    scrolledToAnalysesRef.current = new Set();
    lastScrollTopRef.current = 0;
    isProgrammaticScrollRef.current = false;
  }, []);

  // Reset when messages become empty (navigation to overview)
  useEffect(() => {
    if (messages.length === 0) {
      resetScrollState();
    }
  }, [messages.length, resetScrollState]);

  /**
   * Scroll to bottom with proper sticky state management
   */
  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      isProgrammaticScrollRef.current = true;

      const maxScroll = document.documentElement.scrollHeight - window.innerHeight + bottomOffset;

      window.scrollTo({
        top: Math.max(0, maxScroll),
        behavior,
      });

      // Re-engage sticky mode since we're going to bottom
      isAtBottomRef.current = true;

      // Reset programmatic flag after scroll animation completes
      const delay = behavior === 'smooth' ? 500 : 100;
      setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, delay);
    },
    [bottomOffset],
  );

  // ============================================================================
  // EFFECT 1: Track user scroll intent (sticky/unsticky state)
  // ✅ Following use-stick-to-bottom pattern: scroll up = unstick, reach bottom = stick
  // ============================================================================
  useEffect(() => {
    if (!enableNearBottomDetection) {
      isAtBottomRef.current = true;
      return undefined;
    }

    const handleScroll = () => {
      // Ignore scroll events during programmatic scrolling
      if (isProgrammaticScrollRef.current) {
        return;
      }

      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = window.innerHeight;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

      // Detect scroll direction
      const scrollDelta = scrollTop - lastScrollTopRef.current;
      lastScrollTopRef.current = scrollTop;

      // ✅ KEY LOGIC (from use-stick-to-bottom):
      // - Scrolling UP with meaningful delta = UNSTICK (immediate opt-out)
      // - Reaching bottom = STICK (automatic opt-in)
      if (scrollDelta < -10) {
        // User scrolled UP with intent → unstick
        isAtBottomRef.current = false;
      } else if (distanceFromBottom <= autoScrollThreshold) {
        // User is at bottom → stick
        isAtBottomRef.current = true;
      }
      // If scrolling down but not at bottom, keep current state
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    // Initialize
    lastScrollTopRef.current = window.scrollY || document.documentElement.scrollTop;

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [enableNearBottomDetection, autoScrollThreshold]);

  // ============================================================================
  // EFFECT 2: Auto-scroll when streaming starts (participant turn begins)
  // ✅ This ensures we scroll to bottom when a new participant starts
  // ============================================================================
  const wasStreamingRef = useRef(false);

  useEffect(() => {
    const wasStreaming = wasStreamingRef.current;
    wasStreamingRef.current = isStreaming;

    // When streaming STARTS (transition from false to true), scroll to bottom
    if (!wasStreaming && isStreaming && isAtBottomRef.current) {
      requestAnimationFrame(() => {
        if (isAtBottomRef.current) {
          scrollToBottom('smooth');
        }
      });
    }
  }, [isStreaming, scrollToBottom]);

  // ============================================================================
  // EFFECT 3: Follow content growth ONLY during participant streaming
  // ✅ ResizeObserver is ONLY active when isStreaming is true
  // This prevents scroll on changelogs/layout shifts (which happen when not streaming)
  // ============================================================================
  useEffect(() => {
    // ✅ CRITICAL: Only observe when participants are actively streaming
    // When not streaming, changelogs and other layout changes won't trigger scroll
    if (!isStreaming) {
      return;
    }

    let rafId: number | null = null;
    let lastScrollHeight = document.documentElement.scrollHeight;

    const handleContentGrowth = () => {
      // Only scroll if sticky
      if (!isAtBottomRef.current) {
        return;
      }

      const newScrollHeight = document.documentElement.scrollHeight;
      const heightGrew = newScrollHeight > lastScrollHeight;

      // Only scroll if content actually grew (not shrank or stayed same)
      if (!heightGrew) {
        return;
      }

      lastScrollHeight = newScrollHeight;

      // Cancel pending RAF
      if (rafId) {
        cancelAnimationFrame(rafId);
      }

      rafId = requestAnimationFrame(() => {
        if (isAtBottomRef.current && isStreaming) {
          scrollToBottom('smooth');
        }
        rafId = null;
      });
    };

    // Use ResizeObserver on document body to detect content growth
    const resizeObserver = new ResizeObserver(handleContentGrowth);
    resizeObserver.observe(document.body);

    // Also trigger on message changes during streaming
    handleContentGrowth();

    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      resizeObserver.disconnect();
    };
  }, [isStreaming, scrollToBottom]);

  // Track analyses for scroll tracking (not triggering)
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
