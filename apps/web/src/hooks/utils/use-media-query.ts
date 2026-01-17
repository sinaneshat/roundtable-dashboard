import { useEffect, useState } from 'react';

export type UseMediaQueryReturn = boolean;

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
export function useMediaQuery(query: string): UseMediaQueryReturn {
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

    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [query]);

  return matches;
}
