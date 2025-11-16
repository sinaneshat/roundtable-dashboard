'use client';

import { useEffect, useState } from 'react';

/**
 * Hook for detecting media query matches
 * Based on shadcn/ui responsive pattern
 *
 * @param query - Media query string (e.g., "(min-width: 768px)")
 * @returns boolean indicating if the media query matches
 *
 * @example
 * const isDesktop = useMediaQuery("(min-width: 768px)")
 * const isMobile = useMediaQuery("(max-width: 767px)")
 */
export function useMediaQuery(query: string): boolean {
  // Lazy initialization to avoid setState in useEffect on mount
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined')
      return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    // Check if window is defined (client-side)
    if (typeof window === 'undefined')
      return;

    const media = window.matchMedia(query);

    // Create event listener that updates state when media query changes
    const listener = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    // Add resize listener (no need to check on mount, already done in lazy init)
    // Modern browsers
    if (media.addEventListener) {
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    } else {
      // Legacy browsers (Safari < 14)
      media.addListener(listener);
      return () => media.removeListener(listener);
    }
  }, [query]);

  return matches;
}
