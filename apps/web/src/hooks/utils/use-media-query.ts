import { useSyncExternalStore } from 'react';

export type UseMediaQueryReturn = boolean;

/**
 * Hook for detecting media query matches with SSR support.
 * Uses useSyncExternalStore for proper hydration handling.
 *
 * @param query - Media query string (e.g., "(min-width: 768px)")
 * @param serverDefault - Default value to use during SSR (default: false)
 * @returns boolean indicating if the media query matches
 *
 * @example
 * // Desktop-first (SSR renders desktop, hydrates to actual)
 * const isDesktop = useMediaQuery("(min-width: 768px)", true)
 *
 * // Mobile-first (SSR renders mobile, hydrates to actual)
 * const isMobile = useMediaQuery("(max-width: 767px)")
 */
export function useMediaQuery(query: string, serverDefault = false): UseMediaQueryReturn {
  // Create stable subscribe function that listens to media query changes
  const subscribe = (callback: () => void) => {
    if (typeof window === 'undefined') {
      return () => {};
    }
    const media = window.matchMedia(query);
    media.addEventListener('change', callback);
    return () => media.removeEventListener('change', callback);
  };

  // Get current snapshot on client
  const getSnapshot = () => {
    if (typeof window === 'undefined') {
      return serverDefault;
    }
    return window.matchMedia(query).matches;
  };

  // Server snapshot - used during SSR
  const getServerSnapshot = () => serverDefault;

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
