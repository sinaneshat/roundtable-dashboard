import type { UIMessage } from 'ai';
import { useCallback, useEffect, useRef } from 'react';

import type { StoredModeratorAnalysis } from '@/api/routes/chat/schema';

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
}: UseChatScrollParams): UseChatScrollResult {
  // Track if user is near bottom of scroll (for auto-scroll opt-out)
  const isNearBottomRef = useRef(true);

  // Track which analyses have been scrolled to (prevent duplicate scrolls)
  const scrolledToAnalysesRef = useRef<Set<string>>(new Set());

  // Track last scroll event time for throttling
  const lastScrollTimeRef = useRef<number>(0);

  /**
   * Scroll to bottom of the chat
   * Can be called manually or triggered automatically by effects
   */
  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      const contentContainer = document.getElementById(scrollContainerId);

      if (contentContainer) {
        const contentBottom = contentContainer.offsetTop + contentContainer.scrollHeight;
        const targetScroll = contentBottom - window.innerHeight;

        window.scrollTo({
          top: Math.max(0, targetScroll),
          behavior,
        });
      } else {
        // Fallback: Scroll to document bottom if container not found
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;

        window.scrollTo({
          top: maxScroll,
          behavior,
        });
      }
    },
    [scrollContainerId],
  );

  // Effect 1: Track user scroll position (near bottom detection)
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

      const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      isNearBottomRef.current = distanceFromBottom < autoScrollThreshold;
    };

    // ✅ MEMORY LEAK FIX: Use AbortController signal for automatic cleanup
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

  // Effect 2: Auto-scroll on new analyses or during streaming
  // ✅ FIX: Also trigger on participant turn-taking by depending on currentParticipantIndex
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
    // - During participant streaming: Only scroll if user is near bottom (allows opt-out)
    // - New analysis: Only scroll if user is near bottom (allows opt-out)
    // - Participant turn-taking: Scroll when currentParticipantIndex changes during streaming
    // User can freely scroll during any stream type without being forced back to bottom
    const shouldScroll = (isStreaming || hasNewAnalysis) && isNearBottomRef.current;

    if (shouldScroll) {
      // Mark new analyses as scrolled
      if (hasNewAnalysis) {
        newAnalyses.forEach(a => scrolledToAnalysesRef.current.add(a.id));
      }

      // Use requestAnimationFrame to ensure DOM updates have completed
      requestAnimationFrame(() => {
        scrollToBottom(isStreaming ? 'smooth' : 'auto');
      });
    }
  }, [messages.length, analyses, isStreaming, currentParticipantIndex, scrollToBottom]);

  return {
    isNearBottomRef,
    scrollToBottom,
    scrolledToAnalysesRef,
  };
}
