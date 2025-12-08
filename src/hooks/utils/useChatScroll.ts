import type { UIMessage } from 'ai';
import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef } from 'react';

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
  /**
   * Scroll to bottom instantly when page first loads with messages
   * Use this for thread pages where user lands on existing conversation
   * Default: false
   */
  initialScrollToBottom?: boolean;
  /**
   * Whether the store has been hydrated with initial data
   * When true, the scroll can proceed. When false, scroll waits.
   * This ensures we don't scroll before server data is loaded into store.
   * Default: true (for backwards compatibility)
   */
  isStoreReady?: boolean;
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
 * Chat scroll management hook - AUTO-SCROLL ENABLED
 *
 * ✅ AUTO-SCROLL: Smooth scroll to bottom when new messages sent
 * - Scrolls to bottom when new messages arrive (if user is at bottom)
 * - Follows streaming content with instant scroll during streaming
 * - User can scroll up to disable sticky mode, scroll button to re-engage
 *
 * This hook provides:
 * - isAtBottomRef: Tracks if user is at bottom (sticky mode for auto-scroll)
 * - scrollToBottom: Manual scroll function (used by scroll button)
 * - resetScrollState: Reset when navigating between threads
 */
export function useChatScroll({
  messages,
  analyses,
  isStreaming: _isStreaming,
  scrollContainerId: _scrollContainerId = 'chat-scroll-container',
  enableNearBottomDetection = true,
  autoScrollThreshold = 100,
  currentParticipantIndex: _currentParticipantIndex,
  bottomOffset = 0,
  scrollAnchorRef: _scrollAnchorRef,
  showLoader: _showLoader = false,
  initialScrollToBottom = false,
  isStoreReady = true,
}: UseChatScrollParams): UseChatScrollResult {
  // Track if user is at bottom (for scroll button visibility)
  const isAtBottomRef = useRef(true);

  // Track which analyses have been scrolled to
  const scrolledToAnalysesRef = useRef<Set<string>>(new Set());

  // Track if we're in a programmatic scroll
  const isProgrammaticScrollRef = useRef(false);

  // Track last known scroll position for direction detection
  const lastScrollTopRef = useRef<number>(0);

  // RAF-based scroll queue for smooth animation
  const scrollRafRef = useRef<number | null>(null);

  // ✅ REACT 19: Track scroll animation reset RAF to avoid setTimeout
  const animationResetRafRef = useRef<number | null>(null);

  // Track if initial scroll has happened (for initialScrollToBottom feature)
  const hasInitialScrolledRef = useRef(false);

  /**
   * Reset all scroll state to initial values
   */
  const resetScrollState = useCallback(() => {
    isAtBottomRef.current = true;
    scrolledToAnalysesRef.current = new Set();
    lastScrollTopRef.current = 0;
    isProgrammaticScrollRef.current = false;
    hasInitialScrolledRef.current = false; // Reset so initial scroll works on navigation
    if (scrollRafRef.current) {
      cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = null;
    }
    if (animationResetRafRef.current) {
      cancelAnimationFrame(animationResetRafRef.current);
      animationResetRafRef.current = null;
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
   * ✅ Uses double RAF to ensure DOM has fully updated before calculating scroll position
   */
  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      // Cancel any pending scroll and animation reset
      if (scrollRafRef.current) {
        cancelAnimationFrame(scrollRafRef.current);
      }
      if (animationResetRafRef.current) {
        cancelAnimationFrame(animationResetRafRef.current);
      }

      isProgrammaticScrollRef.current = true;

      // Double RAF ensures DOM layout is complete before scrolling
      scrollRafRef.current = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // Always scroll to absolute bottom of document
          const scrollHeight = Math.max(
            document.body.scrollHeight,
            document.documentElement.scrollHeight,
          );
          const targetScrollTop = scrollHeight - window.innerHeight + bottomOffset;

          window.scrollTo({
            top: Math.max(0, targetScrollTop),
            behavior,
          });

          isAtBottomRef.current = true;

          // Reset programmatic scroll flag after animation completes
          const frameCount = behavior === 'smooth' ? 20 : 5;
          let framesRemaining = frameCount;

          const waitForAnimationEnd = () => {
            framesRemaining--;
            if (framesRemaining > 0) {
              animationResetRafRef.current = requestAnimationFrame(waitForAnimationEnd);
            } else {
              isProgrammaticScrollRef.current = false;
              animationResetRafRef.current = null;
            }
          };

          animationResetRafRef.current = requestAnimationFrame(waitForAnimationEnd);
          scrollRafRef.current = null;
        });
      });
    },
    [bottomOffset],
  );

  // ============================================================================
  // EFFECT 0: Initial scroll to bottom on page load (for thread pages)
  // ✅ useLayoutEffect runs synchronously BEFORE browser paint - no visible scroll animation
  // ✅ Waits for isStoreReady to ensure server data is hydrated before scrolling
  // ============================================================================
  useLayoutEffect(() => {
    // Only scroll once on initial load when:
    // 1. initialScrollToBottom is enabled
    // 2. Haven't scrolled yet
    // 3. Messages exist
    // 4. Store is ready (hydrated with server data)
    if (!initialScrollToBottom || hasInitialScrolledRef.current || messages.length === 0 || !isStoreReady) {
      return;
    }

    // Mark as scrolled to prevent re-triggering
    hasInitialScrolledRef.current = true;
    isAtBottomRef.current = true;

    // Immediate scroll attempt - sync before paint
    const doScroll = () => {
      const scrollHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
      );
      window.scrollTo({
        top: scrollHeight,
        behavior: 'instant',
      });
    };

    // Scroll immediately (synchronous, before paint)
    doScroll();

    // Also scroll after DOM updates to catch any late-rendering content
    requestAnimationFrame(() => {
      doScroll();
      requestAnimationFrame(doScroll);
    });
  }, [initialScrollToBottom, messages.length, isStoreReady]);

  // ============================================================================
  // EFFECT 1: Track user scroll intent (sticky/unsticky state)
  // ✅ REACT 19: useEffectEvent for scroll handler - reads autoScrollThreshold without dep
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

    // ✅ STICKY LOGIC: scroll up = unstick, reach bottom = stick
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
  }, [enableNearBottomDetection]); // ✅ autoScrollThreshold removed - accessed via useEffectEvent

  // ============================================================================
  // EFFECT 2: AUTO-SCROLL ON NEW MESSAGES
  // ✅ Smooth scroll to very bottom when new messages arrive (if user is at bottom)
  // ============================================================================
  const prevMessageCountRef = useRef(messages.length);

  useEffect(() => {
    const messageCountChanged = messages.length !== prevMessageCountRef.current;
    const isNewMessage = messages.length > prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;

    // Auto-scroll to bottom when new messages arrive and user is at bottom
    if (messageCountChanged && isNewMessage && messages.length > 0 && isAtBottomRef.current) {
      // Use smooth scroll for user-initiated messages
      scrollToBottom('smooth');
    }
  }, [messages.length, scrollToBottom]);

  // ============================================================================
  // EFFECT 3: AUTO-SCROLL DURING STREAMING
  // ✅ Keep scrolling to very bottom while content streams in (if user is at bottom)
  // ============================================================================
  useEffect(() => {
    if (!_isStreaming)
      return;

    let rafId: number | null = null;
    let lastScrollHeight = document.documentElement.scrollHeight;

    // Poll for content changes during streaming - more reliable than ResizeObserver
    const checkAndScroll = () => {
      const currentScrollHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
      );

      // If content grew and user is at bottom, scroll to new bottom
      if (currentScrollHeight > lastScrollHeight && isAtBottomRef.current) {
        lastScrollHeight = currentScrollHeight;
        const targetScrollTop = currentScrollHeight - window.innerHeight + bottomOffset;
        window.scrollTo({
          top: Math.max(0, targetScrollTop),
          behavior: 'instant',
        });
      }

      rafId = requestAnimationFrame(checkAndScroll);
    };

    rafId = requestAnimationFrame(checkAndScroll);

    return () => {
      if (rafId)
        cancelAnimationFrame(rafId);
    };
  }, [_isStreaming, bottomOffset]);

  // ============================================================================
  // EFFECT 4: Track analyses - consolidated with ref for ID tracking
  // React 19: Valid effect - updating tracking state on data changes
  // ============================================================================
  useEffect(() => {
    const newAnalyses = analyses.filter(a => !scrolledToAnalysesRef.current.has(a.id));
    if (newAnalyses.length > 0) {
      newAnalyses.forEach(a => scrolledToAnalysesRef.current.add(a.id));
    }
  }, [analyses]);

  // Cleanup RAFs on unmount
  useEffect(() => {
    return () => {
      if (scrollRafRef.current) {
        cancelAnimationFrame(scrollRafRef.current);
      }
      if (animationResetRafRef.current) {
        cancelAnimationFrame(animationResetRafRef.current);
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
