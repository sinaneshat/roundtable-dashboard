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
 *
 * @param dependency - Value to watch for changes (e.g., messages.length)
 * @param enabled - Whether auto-scroll is enabled (default: true)
 */
export function useAutoScrollToBottom(dependency: unknown, enabled = true) {
  const prevDependencyRef = useRef(dependency);

  useEffect(() => {
    if (!enabled)
      return;

    // Check if dependency changed
    if (prevDependencyRef.current === dependency)
      return;
    prevDependencyRef.current = dependency;

    const scrollContainer = document.getElementById('chat-scroll-container');
    if (!scrollContainer)
      return;

    // Check if we're near the bottom (within 200px)
    const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isNearBottom = distanceFromBottom < 200;

    // Only auto-scroll if we're already near the bottom
    // This prevents disrupting user's manual scrolling
    if (isNearBottom) {
      requestAnimationFrame(() => {
        scrollContainer.scrollTo({
          top: scrollContainer.scrollHeight,
          behavior: 'smooth',
        });
      });
    }
  }, [dependency, enabled]);
}
