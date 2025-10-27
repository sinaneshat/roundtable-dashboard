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
 * - Auto-scroll during streaming (only if user is near bottom)
 * - Auto-scroll on new analysis (always, regardless of position)
 * - Manual scroll control
 *
 * @param params - Configuration for scroll behavior
 * @param params.messages - Array of UI messages (used to trigger scroll on new messages)
 * @param params.analyses - Array of moderator analyses (used to trigger scroll on new analyses)
 * @param params.isStreaming - Whether participant streaming is in progress
 * @param params.scrollContainerId - ID of the scroll container element (default: 'chat-scroll-container')
 * @param params.enableNearBottomDetection - Whether to enable near-bottom detection (default: true)
 * @param params.autoScrollThreshold - Distance from bottom in pixels to consider "near bottom" (default: 200)
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
 * // Scroll is automatic during streaming (if near bottom)
 * // Scroll is automatic when new analysis appears (always)
 * // User can manually scroll and opt out of auto-scroll
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
}: UseChatScrollParams): UseChatScrollResult {
  // Track if user is near bottom of scroll (for auto-scroll opt-out)
  const isNearBottomRef = useRef(true);

  // Track which analyses have been scrolled to (prevent duplicate scrolls)
  const scrolledToAnalysesRef = useRef<Set<string>>(new Set());

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
  useEffect(() => {
    if (!enableNearBottomDetection) {
      // Always consider near bottom if detection is disabled
      isNearBottomRef.current = true;
      return undefined;
    }

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      isNearBottomRef.current = distanceFromBottom < autoScrollThreshold;
    };

    window.addEventListener('scroll', handleScroll);

    // Run once on mount to set initial state
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, [enableNearBottomDetection, autoScrollThreshold]);

  // Effect 2: Auto-scroll on new analyses or during streaming
  useEffect(() => {
    if (messages.length === 0) {
      return;
    }

    // Check for new analyses that haven't been scrolled to yet
    const newAnalyses = analyses.filter(a => !scrolledToAnalysesRef.current.has(a.id));
    const hasNewAnalysis = newAnalyses.length > 0;
    const shouldScrollForAnalysis = hasNewAnalysis && !isStreaming;

    // Determine if we should scroll
    // - During streaming: Only scroll if user is near bottom (allows opt-out)
    // - New analysis: Always scroll (significant event)
    const shouldScroll = (isStreaming && isNearBottomRef.current) || shouldScrollForAnalysis;

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
  }, [messages.length, analyses, isStreaming, scrollToBottom]);

  return {
    isNearBottomRef,
    scrollToBottom,
    scrolledToAnalysesRef,
  };
}
