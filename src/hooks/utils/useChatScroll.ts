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
  // ✅ SCROLL FIX: Track message-specific content, NOT body height
  // This prevents snapping when accordions expand/collapse during streaming
  //
  // STRATEGY: Instead of ResizeObserver on document.body (too broad),
  // track actual message content changes:
  // 1. New messages added → scroll
  // 2. Streaming message content grows → scroll with heavy debounce
  // 3. Accordion/layout shifts → NO scroll (not tracked)
  // ============================================================================
  const lastMessageCountRef = useRef(messages.length);
  const lastContentLengthRef = useRef(0);
  const scrollDebounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // ✅ CRITICAL: Only scroll when participants are actively streaming
    // When not streaming, changelogs and other layout changes won't trigger scroll
    if (!isStreaming) {
      // Clear debounce on streaming stop
      if (scrollDebounceRef.current) {
        clearTimeout(scrollDebounceRef.current);
        scrollDebounceRef.current = null;
      }
      return;
    }

    // ✅ SCROLL FIX: Track TWO things:
    // 1. Message count changes (new messages added)
    // 2. Last message content length (streaming content growth)
    const messageCountGrew = messages.length > lastMessageCountRef.current;
    lastMessageCountRef.current = messages.length;

    // Calculate total content length of last 2 messages (streaming messages)
    // This detects content growth during streaming without tracking body height
    // UIMessage uses 'parts' array, we extract text content from text parts
    const lastMessages = messages.slice(-2);
    const currentContentLength = lastMessages.reduce((total, msg) => {
      const textContent = msg.parts
        ?.filter(part => part.type === 'text')
        .map(part => ('text' in part ? part.text : ''))
        .join('') || '';
      return total + textContent.length;
    }, 0);
    const contentGrew = currentContentLength > lastContentLengthRef.current;
    const contentDelta = currentContentLength - lastContentLengthRef.current;
    lastContentLengthRef.current = currentContentLength;

    // Only scroll if sticky AND content actually changed
    if (!isAtBottomRef.current) {
      return;
    }

    // Skip if no meaningful change (prevents layout shift scrolls)
    // A new message should always scroll, content growth needs meaningful delta
    if (!messageCountGrew && (!contentGrew || contentDelta < 20)) {
      return;
    }

    // ✅ SCROLL FIX: Debounce scroll to prevent rapid-fire scrolling
    // Multiple message chunks arrive quickly during streaming
    // Use longer debounce for content growth vs new messages
    if (scrollDebounceRef.current) {
      clearTimeout(scrollDebounceRef.current);
    }

    const debounceMs = messageCountGrew ? 50 : 200; // Faster for new messages, slower for content growth
    scrollDebounceRef.current = setTimeout(() => {
      if (isAtBottomRef.current && isStreaming) {
        scrollToBottom('smooth');
      }
      scrollDebounceRef.current = null;
    }, debounceMs);

    return () => {
      if (scrollDebounceRef.current) {
        clearTimeout(scrollDebounceRef.current);
        scrollDebounceRef.current = null;
      }
    };
  }, [isStreaming, messages, scrollToBottom]);

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
