import type { UIMessage } from 'ai';
import { useCallback, useEffect, useRef } from 'react';

import { AnalysisStatuses } from '@/api/core/enums';
import type { StoredModeratorAnalysis, StoredPreSearch } from '@/api/routes/chat/schema';

type UseChatScrollParams = {
  messages: UIMessage[];
  analyses: StoredModeratorAnalysis[];
  isStreaming: boolean;
  scrollContainerId?: string;
  enableNearBottomDetection?: boolean;
  /**
   * Distance from bottom in pixels to consider "at bottom"
   * When user is within this distance, auto-scroll is engaged
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
   * Pre-searches array to track pre-search streaming state
   * Used to detect when pre-search content is being generated
   */
  preSearches?: StoredPreSearch[];
};

type UseChatScrollResult = {
  /**
   * Ref tracking if user is currently at bottom (auto-scroll engaged)
   * - true: User is at bottom, auto-scroll is active
   * - false: User scrolled up, auto-scroll is disabled until they return to bottom
   */
  isAtBottomRef: React.MutableRefObject<boolean>;
  /**
   * @deprecated Use isAtBottomRef instead. Kept for backwards compatibility.
   */
  isNearBottomRef: React.MutableRefObject<boolean>;
  /**
   * Scroll to bottom of the chat
   * @param behavior - Scroll animation behavior ('smooth' | 'instant')
   */
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  scrolledToAnalysesRef: React.MutableRefObject<Set<string>>;
};

/**
 * Hook for managing chat scroll behavior with body-level scrolling
 *
 * Inspired by use-stick-to-bottom library pattern:
 * - User scrolling UP immediately disengages auto-scroll (no timeout)
 * - User scrolling to bottom re-engages auto-scroll
 * - Auto-scroll only triggers when user is at bottom
 *
 * USER SCROLL CONTROL:
 * - Scrolling UP = opt-out (immediate, no timeout)
 * - Scrolling to bottom = opt-in (automatic)
 * - No fighting with user intent
 *
 * @example
 * ```tsx
 * const { scrollToBottom, isAtBottomRef } = useChatScroll({
 *   messages,
 *   analyses,
 *   isStreaming,
 * });
 *
 * // Auto-scroll happens automatically when user is at bottom
 * // User can scroll up freely without being forced back
 * // Returning to bottom re-enables auto-scroll
 * ```
 */
export function useChatScroll({
  messages,
  analyses,
  isStreaming,
  scrollContainerId = 'chat-scroll-container',
  enableNearBottomDetection = true,
  autoScrollThreshold = 100,
  currentParticipantIndex,
  bottomOffset = 0,
  preSearches = [],
}: UseChatScrollParams): UseChatScrollResult {
  // ✅ SIMPLIFIED: Single state for "is at bottom" - no complex lock mechanism
  // true = user is at bottom, auto-scroll engaged
  // false = user scrolled up, auto-scroll disabled
  const isAtBottomRef = useRef(true);

  // Track which analyses have been scrolled to (prevent duplicate scrolls)
  const scrolledToAnalysesRef = useRef<Set<string>>(new Set());

  // Track if we're currently doing a programmatic scroll
  const isProgrammaticScrollRef = useRef(false);

  // Track last scroll position to detect scroll direction
  const lastScrollTopRef = useRef<number>(0);

  // Compute streaming states from analyses and pre-searches
  const hasAnalysisStreaming = analyses.some(
    a => a.status === AnalysisStatuses.STREAMING || a.status === AnalysisStatuses.PENDING,
  );
  const hasPreSearchStreaming = preSearches.some(
    ps => ps.status === AnalysisStatuses.STREAMING || ps.status === AnalysisStatuses.PENDING,
  );
  const isAnyStreaming = isStreaming || hasAnalysisStreaming || hasPreSearchStreaming;

  /**
   * Scroll to bottom of the chat
   * Uses window/body scrolling for native OS scroll behavior
   */
  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      // Mark as programmatic scroll
      isProgrammaticScrollRef.current = true;

      const maxScroll = document.documentElement.scrollHeight - window.innerHeight + bottomOffset;

      window.scrollTo({
        top: Math.max(0, maxScroll),
        behavior,
      });

      // Re-engage auto-scroll since we're going to bottom
      isAtBottomRef.current = true;

      // Reset programmatic flag after scroll completes
      // Use longer delay for smooth scrolling
      const delay = behavior === 'smooth' ? 500 : 100;
      setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, delay);
    },
    [bottomOffset],
  );

  // Effect 1: Track scroll position and user intent
  // ✅ SIMPLIFIED: Just track if at bottom, no complex detection
  useEffect(() => {
    if (!enableNearBottomDetection) {
      isAtBottomRef.current = true;
      return undefined;
    }

    const abortController = new AbortController();

    const handleScroll = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = window.innerHeight;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

      // Detect scroll direction
      const scrollDelta = scrollTop - lastScrollTopRef.current;
      const isScrollingUp = scrollDelta < -5; // Small threshold to filter noise

      lastScrollTopRef.current = scrollTop;

      // ✅ KEY LOGIC (inspired by use-stick-to-bottom):
      // - If user scrolls UP (and it's not programmatic) → disable auto-scroll
      // - If user is at bottom → enable auto-scroll
      // - If scrolling down (scrollDelta > 5) but not at bottom → keep current state

      if (!isProgrammaticScrollRef.current && isScrollingUp) {
        // User is actively scrolling UP → disable auto-scroll
        isAtBottomRef.current = false;
      } else if (distanceFromBottom <= autoScrollThreshold) {
        // User is at bottom → enable auto-scroll
        isAtBottomRef.current = true;
      }
      // If scrolling down but not at bottom, keep current state
      // This prevents re-engaging while user is scrolling down through content
    };

    window.addEventListener('scroll', handleScroll, {
      passive: true,
      signal: abortController.signal,
    });

    // Initialize state
    lastScrollTopRef.current = window.scrollY || document.documentElement.scrollTop;
    handleScroll();

    return () => {
      abortController.abort();
    };
  }, [enableNearBottomDetection, autoScrollThreshold]);

  // Effect 2: Auto-scroll on new content during streaming
  useEffect(() => {
    if (messages.length === 0) {
      return;
    }

    // ✅ SIMPLIFIED: Only scroll if at bottom
    if (!isAtBottomRef.current) {
      return;
    }

    // Check for new analyses
    const newAnalyses = analyses.filter(a => !scrolledToAnalysesRef.current.has(a.id));
    const hasNewAnalysis = newAnalyses.length > 0;

    const shouldScroll = isAnyStreaming || hasNewAnalysis;

    if (shouldScroll) {
      if (hasNewAnalysis) {
        newAnalyses.forEach(a => scrolledToAnalysesRef.current.add(a.id));
      }

      requestAnimationFrame(() => {
        if (isAtBottomRef.current) {
          scrollToBottom('smooth');
        }
      });
    }
  }, [messages.length, analyses, isAnyStreaming, currentParticipantIndex, scrollToBottom]);

  // Effect 3: Auto-scroll on content resize during streaming
  useEffect(() => {
    if (!isAnyStreaming)
      return;

    const contentContainer = document.getElementById(scrollContainerId);
    if (!contentContainer)
      return;

    let lastHeight = document.documentElement.scrollHeight;
    let rafId: number | null = null;

    const resizeObserver = new ResizeObserver(() => {
      // ✅ SIMPLIFIED: Only scroll if at bottom
      if (!isAtBottomRef.current) {
        return;
      }

      const newHeight = document.documentElement.scrollHeight;
      const heightDelta = newHeight - lastHeight;

      // Only scroll if content actually grew by meaningful amount
      if (heightDelta < 20) {
        return;
      }

      lastHeight = newHeight;

      // Cancel pending RAF to prevent stacking
      if (rafId) {
        cancelAnimationFrame(rafId);
      }

      rafId = requestAnimationFrame(() => {
        if (isAtBottomRef.current) {
          scrollToBottom('smooth');
        }
        rafId = null;
      });
    });

    resizeObserver.observe(contentContainer);

    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      resizeObserver.disconnect();
    };
  }, [isAnyStreaming, scrollContainerId, scrollToBottom]);

  return {
    isAtBottomRef,
    isNearBottomRef: isAtBottomRef, // Backwards compatibility alias
    scrollToBottom,
    scrolledToAnalysesRef,
  };
}
