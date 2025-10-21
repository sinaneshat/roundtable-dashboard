import { useEffect, useRef } from 'react';

/**
 * Custom hook for auto-scrolling to bottom when content changes
 *
 * This hook monitors a dependency (like messages array) and automatically scrolls
 * the window to the bottom when the dependency changes.
 *
 * Features:
 * - Smooth scrolling to bottom at window level
 * - Only scrolls if already near bottom (within 200px)
 * - Works with window-level scrolling (not nested scroll containers)
 * - Supports both primitive and object dependencies via JSON comparison
 *
 * @param dependency - Value to watch for changes (e.g., messages.length, { length, content, isStreaming })
 * @param enabled - Whether auto-scroll is enabled (default: true)
 */
export function useAutoScrollToBottom(dependency: unknown, enabled = true) {
  // Use JSON serialization for deep comparison of objects
  const prevDependencyRef = useRef<string>(JSON.stringify(dependency));

  useEffect(() => {
    if (!enabled)
      return;

    // Serialize dependency for comparison
    const currentDependency = JSON.stringify(dependency);

    // Check if dependency changed
    if (prevDependencyRef.current === currentDependency)
      return;
    prevDependencyRef.current = currentDependency;

    // ✅ WINDOW-LEVEL SCROLLING: Use document.documentElement for window scroll measurements
    // This is the standard way to measure and control window scrolling
    const { scrollTop, scrollHeight, clientHeight } = document.documentElement;

    // ✅ CRITICAL FIX: Always scroll when streaming, otherwise check if near bottom
    // This ensures continuous scrolling during streaming updates
    const parsed = typeof dependency === 'object' && dependency !== null ? dependency as Record<string, unknown> : null;
    const isStreamingActive = parsed?.isStreaming === true;

    // Check if we're near the bottom (within 200px)
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isNearBottom = distanceFromBottom < 200;

    // Auto-scroll if: (1) streaming is active, OR (2) we're already near the bottom
    // This ensures smooth streaming experience while respecting user's manual scrolling
    if (isStreamingActive || isNearBottom) {
      requestAnimationFrame(() => {
        // ✅ WINDOW SCROLLING: Scroll to show content, accounting for bottom padding
        // Get the actual content height by checking the chat-scroll-container
        const contentContainer = document.getElementById('chat-scroll-container');
        if (contentContainer) {
          // Calculate the bottom of the content (not the full document height)
          const contentBottom = contentContainer.offsetTop + contentContainer.scrollHeight;

          // Scroll to show the content bottom, accounting for viewport height
          // This prevents scrolling past the content into excessive bottom padding
          const targetScroll = contentBottom - window.innerHeight;

          window.scrollTo({
            top: Math.max(0, targetScroll),
            behavior: 'smooth',
          });
        } else {
          // Fallback: scroll to document height if container not found
          window.scrollTo({
            top: document.documentElement.scrollHeight,
            behavior: 'smooth',
          });
        }
      });
    }
  }, [dependency, enabled]);
}
