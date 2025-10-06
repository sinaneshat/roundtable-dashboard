'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * ChatGPT-like Auto-Scroll Hook
 *
 * Automatically scrolls to bottom as content streams in, with smart user override detection.
 *
 * Features:
 * - Auto-scrolls when new content arrives (messages, streaming)
 * - Detects when user scrolls up and disables auto-scroll
 * - Re-enables auto-scroll when user scrolls back to bottom
 * - Shows/hides scroll-to-bottom button based on scroll position
 * - Smooth scrolling behavior for better UX
 *
 * Usage:
 * ```tsx
 * const { scrollRef, showScrollButton, scrollToBottom } = useAutoScroll({
 *   messages,
 *   isStreaming,
 * });
 *
 * <ScrollArea ref={scrollRef}>
 *   {messages.map(...)}
 * </ScrollArea>
 * {showScrollButton && <ScrollToBottomButton onClick={scrollToBottom} />}
 * ```
 */

type UseAutoScrollOptions = {
  /**
   * Messages array to track for changes
   */
  messages: unknown[];
  /**
   * Whether content is currently streaming
   */
  isStreaming?: boolean;
  /**
   * Distance from bottom (in pixels) to consider "at bottom"
   * @default 100
   */
  threshold?: number;
  /**
   * Enable smooth scrolling behavior
   * @default true
   */
  smooth?: boolean;
};

type UseAutoScrollReturn = {
  /**
   * Ref to attach to the scrollable container
   */
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /**
   * Whether to show the scroll-to-bottom button
   */
  showScrollButton: boolean;
  /**
   * Function to manually scroll to bottom
   */
  scrollToBottom: () => void;
  /**
   * Whether auto-scroll is currently enabled (user hasn't scrolled up)
   */
  isAutoScrollEnabled: boolean;
};

export function useAutoScroll({
  messages,
  isStreaming = false,
  threshold = 100,
  smooth = true,
}: UseAutoScrollOptions): UseAutoScrollReturn {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const userScrolledRef = useRef(false);
  const lastScrollHeightRef = useRef(0);

  /**
   * Check if user is at the bottom of the scroll container
   */
  const isAtBottom = useCallback(() => {
    const element = scrollRef.current;
    if (!element)
      return false;

    const { scrollTop, scrollHeight, clientHeight } = element;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    // console.log('isAtBottom check:', { scrollTop, scrollHeight, clientHeight, distanceFromBottom, threshold });
    return distanceFromBottom <= threshold;
  }, [threshold]);

  /**
   * Scroll to the bottom of the container
   */
  const scrollToBottom = useCallback(() => {
    const element = scrollRef.current;
    if (!element)
      return;

    if (smooth) {
      element.scrollTo({
        top: element.scrollHeight,
        behavior: 'smooth',
      });
    } else {
      element.scrollTop = element.scrollHeight;
    }

    // Re-enable auto-scroll when user manually scrolls to bottom
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- Manual user action to scroll to bottom
    setIsAutoScrollEnabled(true);
    userScrolledRef.current = false;
  }, [smooth]);

  /**
   * Handle user scroll events
   * Detects when user scrolls up (opting out of auto-scroll)
   */
  useEffect(() => {
    const element = scrollRef.current;
    if (!element)
      return;

    const handleScroll = () => {
      const atBottom = isAtBottom();

      // Update scroll button visibility
      setShowScrollButton(!atBottom);

      // If user scrolled up (not at bottom), disable auto-scroll
      if (!atBottom && !userScrolledRef.current) {
        userScrolledRef.current = true;
        setIsAutoScrollEnabled(false);
      }

      // If user scrolled back to bottom, re-enable auto-scroll
      if (atBottom && userScrolledRef.current) {
        userScrolledRef.current = false;
        setIsAutoScrollEnabled(true);
      }
    };

    element.addEventListener('scroll', handleScroll, { passive: true });
    return () => element.removeEventListener('scroll', handleScroll);
  }, [isAtBottom]);

  /**
   * Auto-scroll when content changes (messages or streaming)
   * Only scrolls if auto-scroll is enabled (user hasn't scrolled up)
   * CRITICAL: Respects user's scroll position even during streaming
   */
  useEffect(() => {
    const element = scrollRef.current;
    if (!element)
      return;

    // Only auto-scroll if user hasn't manually scrolled up
    // This respects user choice even during streaming
    if (!isAutoScrollEnabled) {
      return;
    }

    // For streaming: scroll immediately to follow content as it grows
    // For new messages: use smooth scroll for better UX
    if (isStreaming) {
      // Check if scroll height actually changed (content is growing)
      const currentScrollHeight = element.scrollHeight;
      if (currentScrollHeight !== lastScrollHeightRef.current) {
        element.scrollTop = element.scrollHeight;
        lastScrollHeightRef.current = currentScrollHeight;
      }
    } else {
      scrollToBottom();
    }
  }, [messages, isStreaming, isAutoScrollEnabled, scrollToBottom]);

  /**
   * Continuously scroll during streaming (using requestAnimationFrame)
   * This ensures we scroll even when content is streaming within the same message
   * CRITICAL: Only auto-scrolls if user hasn't manually scrolled up
   */
  useEffect(() => {
    if (!isStreaming || !isAutoScrollEnabled)
      return;

    const element = scrollRef.current;
    if (!element)
      return;

    let rafId: number;
    let lastKnownScrollHeight = element.scrollHeight;

    const scrollLoop = () => {
      // Check if user has scrolled up during streaming
      if (!isAutoScrollEnabled) {
        return;
      }

      const currentScrollHeight = element.scrollHeight;

      // Only scroll if content changed and auto-scroll is still enabled
      if (currentScrollHeight !== lastKnownScrollHeight) {
        element.scrollTop = element.scrollHeight;
        lastKnownScrollHeight = currentScrollHeight;
        lastScrollHeightRef.current = currentScrollHeight;
      }

      // Continue checking while streaming
      rafId = requestAnimationFrame(scrollLoop);
    };

    // Start the scroll loop immediately
    rafId = requestAnimationFrame(scrollLoop);

    // Cleanup on unmount or when streaming stops
    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [isStreaming, isAutoScrollEnabled]);

  /**
   * Initialize scroll position on mount
   */
  useEffect(() => {
    const element = scrollRef.current;
    if (!element)
      return;

    // Scroll to bottom on initial render
    element.scrollTop = element.scrollHeight;
    lastScrollHeightRef.current = element.scrollHeight;
  }, []);

  return {
    scrollRef,
    showScrollButton,
    scrollToBottom,
    isAutoScrollEnabled,
  };
}
