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
  /**
   * Ref to the scroll anchor element at the bottom of the chat
   * ResizeObserver watches this to detect ANY content growth
   */
  scrollAnchorRef?: React.RefObject<HTMLDivElement | null>;
  /**
   * Whether any loading indicator is visible (loader, pre-search, analysis streaming)
   * When true, scroll should follow content even before participant streaming starts
   */
  showLoader?: boolean;
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
 * ✅ REWRITTEN: ResizeObserver-based auto-scroll for smooth window-level scrolling
 *
 * KEY PRINCIPLES:
 * 1. Use ResizeObserver on scroll anchor to detect ANY content growth (loader, text, etc)
 * 2. "Sticky" state = whether to auto-scroll (like use-stick-to-bottom's isAtBottom)
 * 3. User scrolling UP = unstick (immediate)
 * 4. User reaching bottom = stick (automatic)
 * 5. When sticky AND content grows, auto-scroll to keep bottom in view
 * 6. Use requestAnimationFrame for smooth animation timing
 *
 * This ensures auto-scroll works for ALL content: loader text, streaming messages, etc.
 */
export function useChatScroll({
  messages,
  analyses,
  isStreaming,
  scrollContainerId: _scrollContainerId = 'chat-scroll-container',
  enableNearBottomDetection = true,
  autoScrollThreshold = 100,
  currentParticipantIndex: _currentParticipantIndex,
  bottomOffset = 0,
  scrollAnchorRef,
  showLoader = false,
}: UseChatScrollParams): UseChatScrollResult {
  // ✅ STICKY STATE: Like use-stick-to-bottom's isAtBottom
  const isAtBottomRef = useRef(true);

  // Track which analyses have been scrolled to
  const scrolledToAnalysesRef = useRef<Set<string>>(new Set());

  // Track if we're in a programmatic scroll
  const isProgrammaticScrollRef = useRef(false);

  // Track last known scroll position for direction detection
  const lastScrollTopRef = useRef<number>(0);

  // RAF-based scroll queue for smooth animation
  const scrollRafRef = useRef<number | null>(null);

  // Throttle for content-based scrolling
  const scrollThrottleRef = useRef<number>(0);

  // Track last anchor position for resize detection
  const lastAnchorTopRef = useRef<number>(0);

  /**
   * Reset all scroll state to initial values
   */
  const resetScrollState = useCallback(() => {
    isAtBottomRef.current = true;
    scrolledToAnalysesRef.current = new Set();
    lastScrollTopRef.current = 0;
    isProgrammaticScrollRef.current = false;
    lastAnchorTopRef.current = 0;
    if (scrollRafRef.current) {
      cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = null;
    }
  }, []);

  // Reset when messages become empty (navigation)
  useEffect(() => {
    if (messages.length === 0) {
      resetScrollState();
    }
  }, [messages.length, resetScrollState]);

  /**
   * Scroll to bottom using window.scrollTo for consistent body-based scrolling
   */
  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      // Cancel any pending scroll
      if (scrollRafRef.current) {
        cancelAnimationFrame(scrollRafRef.current);
      }

      isProgrammaticScrollRef.current = true;

      // Use RAF for smooth timing
      scrollRafRef.current = requestAnimationFrame(() => {
        let targetScrollTop: number;

        if (scrollAnchorRef?.current) {
          const anchorRect = scrollAnchorRef.current.getBoundingClientRect();
          const currentScrollTop = window.scrollY || document.documentElement.scrollTop;
          targetScrollTop = currentScrollTop + anchorRect.bottom - window.innerHeight + bottomOffset;
        } else {
          targetScrollTop = document.documentElement.scrollHeight - window.innerHeight + bottomOffset;
        }

        window.scrollTo({
          top: Math.max(0, targetScrollTop),
          behavior,
        });

        isAtBottomRef.current = true;

        // Reset programmatic flag after animation
        const delay = behavior === 'smooth' ? 300 : 50;
        setTimeout(() => {
          isProgrammaticScrollRef.current = false;
        }, delay);

        scrollRafRef.current = null;
      });
    },
    [bottomOffset, scrollAnchorRef],
  );

  // ============================================================================
  // EFFECT 1: Track user scroll intent (sticky/unsticky state)
  // ============================================================================
  useEffect(() => {
    if (!enableNearBottomDetection) {
      isAtBottomRef.current = true;
      return undefined;
    }

    let ticking = false;

    const handleScroll = () => {
      if (isProgrammaticScrollRef.current || ticking)
        return;

      ticking = true;
      requestAnimationFrame(() => {
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const scrollHeight = document.documentElement.scrollHeight;
        const clientHeight = window.innerHeight;
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

        const scrollDelta = scrollTop - lastScrollTopRef.current;
        lastScrollTopRef.current = scrollTop;

        // ✅ STICKY LOGIC: scroll up = unstick, reach bottom = stick
        if (scrollDelta < -10) {
          isAtBottomRef.current = false;
        } else if (distanceFromBottom <= autoScrollThreshold) {
          isAtBottomRef.current = true;
        }

        ticking = false;
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    lastScrollTopRef.current = window.scrollY || document.documentElement.scrollTop;

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [enableNearBottomDetection, autoScrollThreshold]);

  // ============================================================================
  // EFFECT 2: ResizeObserver on scroll anchor to detect ANY content growth
  // ✅ This catches loader text, streaming text, new messages - EVERYTHING
  // ============================================================================
  const isActive = isStreaming || showLoader;

  useEffect(() => {
    if (!scrollAnchorRef?.current || !isActive) {
      return;
    }

    const anchor = scrollAnchorRef.current;

    // Initialize last position
    const initialRect = anchor.getBoundingClientRect();
    lastAnchorTopRef.current = initialRect.top + window.scrollY;

    // ✅ RESIZE OBSERVER: Watches anchor position changes caused by content growth
    const resizeObserver = new ResizeObserver(() => {
      if (!isAtBottomRef.current || isProgrammaticScrollRef.current)
        return;

      const anchorRect = anchor.getBoundingClientRect();
      const currentAnchorTop = anchorRect.top + window.scrollY;

      // Content grew if anchor moved down
      const contentGrew = currentAnchorTop > lastAnchorTopRef.current + 5; // 5px threshold
      lastAnchorTopRef.current = currentAnchorTop;

      if (!contentGrew)
        return;

      // ✅ THROTTLE: Max once per 50ms for smooth but not excessive scrolling
      const now = Date.now();
      if (now - scrollThrottleRef.current < 50)
        return;
      scrollThrottleRef.current = now;

      // Auto-scroll to keep bottom in view
      requestAnimationFrame(() => {
        if (isAtBottomRef.current && !isProgrammaticScrollRef.current) {
          scrollToBottom('auto');
        }
      });
    });

    // ✅ MUTATION OBSERVER: Catches DOM changes that don't trigger resize
    const mutationObserver = new MutationObserver(() => {
      if (!isAtBottomRef.current || isProgrammaticScrollRef.current)
        return;

      // ✅ THROTTLE
      const now = Date.now();
      if (now - scrollThrottleRef.current < 50)
        return;
      scrollThrottleRef.current = now;

      requestAnimationFrame(() => {
        if (isAtBottomRef.current && !isProgrammaticScrollRef.current) {
          // Check if we need to scroll (content might have grown)
          const scrollTop = window.scrollY || document.documentElement.scrollTop;
          const scrollHeight = document.documentElement.scrollHeight;
          const clientHeight = window.innerHeight;
          const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

          // Only scroll if we're not at actual bottom (content grew)
          if (distanceFromBottom > 10) {
            scrollToBottom('auto');
          }
        }
      });
    });

    // Observe the anchor's parent (content container) for changes
    const contentContainer = anchor.parentElement;
    if (contentContainer) {
      resizeObserver.observe(contentContainer);
      mutationObserver.observe(contentContainer, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [isActive, scrollAnchorRef, scrollToBottom]);

  // ============================================================================
  // EFFECT 3: Initial scroll when loading/streaming starts
  // ============================================================================
  const wasActiveRef = useRef(false);

  useEffect(() => {
    const wasActive = wasActiveRef.current;
    wasActiveRef.current = isActive;

    // When activity STARTS, do initial scroll
    if (!wasActive && isActive && isAtBottomRef.current) {
      requestAnimationFrame(() => {
        if (isAtBottomRef.current) {
          scrollToBottom('smooth');
        }
      });
    }
  }, [isActive, scrollToBottom]);

  // Track analyses
  useEffect(() => {
    const newAnalyses = analyses.filter(a => !scrolledToAnalysesRef.current.has(a.id));
    if (newAnalyses.length > 0) {
      newAnalyses.forEach(a => scrolledToAnalysesRef.current.add(a.id));
    }
  }, [analyses]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scrollRafRef.current) {
        cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, []);

  return {
    isAtBottomRef,
    scrollToBottom,
    scrolledToAnalysesRef,
    resetScrollState,
  };
}
