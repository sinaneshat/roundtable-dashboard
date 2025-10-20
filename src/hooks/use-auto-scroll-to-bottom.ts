import { useEffect, useRef } from 'react';

/**
 * Custom hook for auto-scrolling to bottom when content changes
 *
 * This hook monitors a dependency (like messages array) and automatically scrolls
 * the page-level scroll container to the bottom when the dependency changes.
 *
 * Features:
 * - Smooth scrolling to bottom
 * - Only scrolls if already near bottom (within 200px)
 * - Works with page-level scroll container (#chat-scroll-container)
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

    const scrollContainer = document.getElementById('chat-scroll-container');
    if (!scrollContainer)
      return;

    // ✅ CRITICAL FIX: Always scroll when streaming, otherwise check if near bottom
    // This ensures continuous scrolling during streaming updates
    const parsed = typeof dependency === 'object' && dependency !== null ? dependency as Record<string, unknown> : null;
    const isStreamingActive = parsed?.isStreaming === true;

    // Check if we're near the bottom (within 200px)
    const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isNearBottom = distanceFromBottom < 200;

    // Auto-scroll if: (1) streaming is active, OR (2) we're already near the bottom
    // This ensures smooth streaming experience while respecting user's manual scrolling
    if (isStreamingActive || isNearBottom) {
      requestAnimationFrame(() => {
        // ✅ CRITICAL FIX: Account for scroll-padding-bottom when scrolling to bottom
        // Get the scroll-padding-bottom value from computed styles
        const computedStyle = window.getComputedStyle(scrollContainer);
        const scrollPaddingBottom = Number.parseFloat(computedStyle.scrollPaddingBottom) || 0;

        // Scroll to the bottom, accounting for scroll-padding-bottom
        // This ensures content is visible above the fixed input
        scrollContainer.scrollTo({
          top: scrollContainer.scrollHeight - scrollPaddingBottom,
          behavior: 'smooth',
        });
      });
    }
  }, [dependency, enabled]);
}
