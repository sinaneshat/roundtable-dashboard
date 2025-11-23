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
  autoScrollThreshold?: number;
  /**
   * Throttle delay for scroll event handler in ms
   * Default: 100ms
   */
  scrollThrottleMs?: number;
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
  /**
   * Debounce delay for scroll calls in ms
   * Prevents jumpy scrolling from rapid content updates
   * Default: 50ms
   */
  scrollDebounceMs?: number;
};

type UseChatScrollResult = {
  isNearBottomRef: React.MutableRefObject<boolean>;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  scrolledToAnalysesRef: React.MutableRefObject<Set<string>>;
};

/**
 * Hook for managing chat scroll behavior
 *
 * Provides unified scroll management for chat messages and analyses with:
 * - Near-bottom detection (prevents auto-scroll when user scrolls up)
 * - Auto-scroll during streaming (only if user is near bottom) - OPT-IN
 * - Auto-scroll on new analysis (only if user is near bottom) - OPT-IN
 * - Manual scroll control
 *
 * USER SCROLL CONTROL:
 * - User can freely scroll during ANY stream type (text, object, analysis)
 * - Auto-scroll ONLY triggers when user is already near bottom (within 200px)
 * - Scrolling up opts out of auto-scroll until user scrolls back to bottom
 *
 * @param params - Configuration for scroll behavior
 * @param params.messages - Array of UI messages (used to trigger scroll on new messages)
 * @param params.analyses - Array of moderator analyses (used to trigger scroll on new analyses)
 * @param params.isStreaming - Whether participant streaming is in progress
 * @param params.scrollContainerId - ID of the scroll container element (default: 'chat-scroll-container')
 * @param params.enableNearBottomDetection - Whether to enable near-bottom detection (default: true)
 * @param params.autoScrollThreshold - Distance from bottom in pixels to consider "near bottom" (default: 200)
 * @param params.scrollThrottleMs - Throttle time in milliseconds for scroll events (default: 100)
 * @param params.currentParticipantIndex - Current participant index during streaming (triggers scroll on participant turn-taking)
 * @param params.bottomOffset - Extra offset in pixels to scroll past bottom for sticky elements (default: 0)
 * @param params.preSearches - Array of pre-searches to detect pre-search streaming state (default: [])
 * @param params.scrollDebounceMs - Debounce time in milliseconds for scroll calls to prevent jumpy behavior (default: 50)
 * @returns Object containing refs and scroll control functions
 *
 * @example
 * ```tsx
 * const { scrollToBottom, isNearBottomRef } = useChatScroll({
 *   messages,
 *   analyses,
 *   isStreaming,
 *   scrollContainerId: 'chat-scroll-container',
 *   enableNearBottomDetection: true,
 * });
 *
 * // Scroll is automatic during streaming ONLY if user near bottom (opt-in)
 * // Scroll is automatic on new analysis ONLY if user near bottom (opt-in)
 * // User can scroll freely during any stream without being forced back
 *
 * // Manual scroll (for programmatic control):
 * <button onClick={() => scrollToBottom('smooth')}>
 *   Scroll to Bottom
 * </button>
 * ```
 */
export function useChatScroll({
  messages,
  analyses,
  isStreaming,
  scrollContainerId = 'chat-scroll-container',
  enableNearBottomDetection = true,
  autoScrollThreshold = 200,
  scrollThrottleMs = 100,
  currentParticipantIndex,
  bottomOffset = 0,
  preSearches = [],
  scrollDebounceMs = 50,
}: UseChatScrollParams): UseChatScrollResult {
  // Track if user is near bottom of scroll (for auto-scroll opt-out)
  const isNearBottomRef = useRef(true);

  // Track which analyses have been scrolled to (prevent duplicate scrolls)
  const scrolledToAnalysesRef = useRef<Set<string>>(new Set());

  // Track last scroll event time for throttling
  const lastScrollTimeRef = useRef<number>(0);

  // Track debounced scroll timeout for preventing jumpy behavior
  const scrollDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Compute streaming states from analyses and pre-searches
  // ✅ FIX: Detect ANY streaming activity, not just participant streaming
  // ✅ ENUM PATTERN: Use AnalysisStatuses constants instead of string literals
  const hasAnalysisStreaming = analyses.some(
    a => a.status === AnalysisStatuses.STREAMING || a.status === AnalysisStatuses.PENDING,
  );
  const hasPreSearchStreaming = preSearches.some(
    ps => ps.status === AnalysisStatuses.STREAMING || ps.status === AnalysisStatuses.PENDING,
  );

  // Combined streaming state for ResizeObserver
  const isAnyStreaming = isStreaming || hasAnalysisStreaming || hasPreSearchStreaming;

  /**
   * Scroll to bottom of the chat
   * Uses window/body scrolling for native OS scroll behavior
   * Can be called manually or triggered automatically by effects
   * ✅ FIX: Debounced to prevent jumpy scrolling from rapid content updates
   */
  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      // Clear any pending debounced scroll
      if (scrollDebounceRef.current) {
        clearTimeout(scrollDebounceRef.current);
      }

      // Debounce scroll calls to prevent jumpy behavior
      scrollDebounceRef.current = setTimeout(() => {
        // Use body/window scrolling for native OS scroll behavior
        // Add bottomOffset to account for sticky elements (input, gradients)
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight + bottomOffset;

        window.scrollTo({
          top: maxScroll,
          behavior,
        });

        scrollDebounceRef.current = null;
      }, scrollDebounceMs);
    },
    [bottomOffset, scrollDebounceMs],
  );

  // Cleanup debounce timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollDebounceRef.current) {
        clearTimeout(scrollDebounceRef.current);
      }
    };
  }, []);

  // Effect 1: Track user scroll position (near bottom detection)
  // Uses window scroll for native OS scroll behavior
  // ✅ MEMORY LEAK FIX: Use AbortController for guaranteed cleanup
  useEffect(() => {
    if (!enableNearBottomDetection) {
      // Always consider near bottom if detection is disabled
      isNearBottomRef.current = true;
      return undefined;
    }

    // ✅ MEMORY LEAK FIX: AbortController ensures listener is removed even during fast unmounts
    const abortController = new AbortController();
    let cleanedUp = false;

    const handleScroll = () => {
      // ✅ MEMORY LEAK FIX: Prevent execution after cleanup
      if (cleanedUp)
        return;

      // Throttle scroll events for better performance
      const now = Date.now();
      if (now - lastScrollTimeRef.current < scrollThrottleMs) {
        return;
      }
      lastScrollTimeRef.current = now;

      // Use window/document for body-based scrolling
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = window.innerHeight;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      isNearBottomRef.current = distanceFromBottom < autoScrollThreshold;
    };

    // ✅ MEMORY LEAK FIX: Use AbortController signal for automatic cleanup
    // Listen on window for body-based scrolling
    window.addEventListener('scroll', handleScroll, {
      passive: true,
      signal: abortController.signal,
    });

    // Run once on mount to set initial state
    handleScroll();

    return () => {
      // ✅ MEMORY LEAK FIX: Mark as cleaned up and abort all listeners
      cleanedUp = true;
      abortController.abort();
    };
  }, [enableNearBottomDetection, autoScrollThreshold, scrollThrottleMs]);

  // Effect 2: Auto-scroll on new analyses or state changes
  // ✅ FIX: Also trigger on participant turn-taking by depending on currentParticipantIndex
  // ✅ FIX: Also trigger during analysis/pre-search streaming, not just participant streaming
  useEffect(() => {
    if (messages.length === 0) {
      return;
    }

    // Check for new analyses that haven't been scrolled to yet
    const newAnalyses = analyses.filter(a => !scrolledToAnalysesRef.current.has(a.id));
    const hasNewAnalysis = newAnalyses.length > 0;

    // ✅ FIX: REMOVED forced scroll during analysis streaming
    // Previously: Auto-scrolled when new completed analysis appeared, ignoring user position
    // Now: Only scroll if user is near bottom (opt-in behavior)

    // Determine if we should scroll
    // - During ANY streaming (participant, analysis, pre-search): Only scroll if user is near bottom
    // - New analysis: Only scroll if user is near bottom (allows opt-out)
    // - Participant turn-taking: Scroll when currentParticipantIndex changes during streaming
    // User can freely scroll during any stream type without being forced back to bottom
    const shouldScroll = (isAnyStreaming || hasNewAnalysis) && isNearBottomRef.current;

    if (shouldScroll) {
      // Mark new analyses as scrolled
      if (hasNewAnalysis) {
        newAnalyses.forEach(a => scrolledToAnalysesRef.current.add(a.id));
      }

      // Use requestAnimationFrame to ensure DOM updates have completed
      // scrollToBottom is already debounced to prevent jumpy behavior
      requestAnimationFrame(() => {
        scrollToBottom('smooth');
      });
    }
  }, [messages.length, analyses, isAnyStreaming, currentParticipantIndex, scrollToBottom]);

  // Effect 3: Auto-scroll on content resize during ANY streaming
  // ✅ FIX: Watch for height changes during ALL streaming types (participant, analysis, pre-search)
  // This handles the case where content updates without changing messages.length
  // Previously only ran during participant streaming, missing analysis/pre-search object generation
  useEffect(() => {
    if (!isAnyStreaming)
      return;

    const contentContainer = document.getElementById(scrollContainerId);
    if (!contentContainer)
      return;

    const resizeObserver = new ResizeObserver(() => {
      if (isNearBottomRef.current) {
        // scrollToBottom is already debounced to prevent jumpy behavior
        requestAnimationFrame(() => {
          scrollToBottom('smooth');
        });
      }
    });

    resizeObserver.observe(contentContainer);

    return () => {
      resizeObserver.disconnect();
    };
  }, [isAnyStreaming, scrollContainerId, scrollToBottom]);

  return {
    isNearBottomRef,
    scrollToBottom,
    scrolledToAnalysesRef,
  };
}
