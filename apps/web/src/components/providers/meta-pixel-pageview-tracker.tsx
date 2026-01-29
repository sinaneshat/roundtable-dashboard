/**
 * Meta Pixel PageView Tracker Component
 *
 * Handles SPA pageview tracking for Meta Pixel.
 * Initial pageview is fired in MetaPixelProvider on mount.
 * This component handles subsequent navigation pageviews.
 */

import { useLocation } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

/**
 * Meta Pixel PageView Tracker
 *
 * Place this inside MetaPixelProvider to track pageviews on SPA navigation.
 */
export function MetaPixelPageViewTracker() {
  const { pathname } = useLocation();
  const lastTrackedPath = useRef<string>('');
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Skip SSR
    if (typeof window === 'undefined') {
      return;
    }

    // Skip if fbq not loaded
    if (!window.fbq) {
      return;
    }

    // Avoid duplicate tracking
    if (lastTrackedPath.current === pathname) {
      return;
    }

    // Skip first render - initial pageview fired in MetaPixelProvider
    const shouldCapture = !isFirstRender.current;
    isFirstRender.current = false;
    lastTrackedPath.current = pathname;

    // Fire PageView for subsequent navigations
    if (shouldCapture) {
      window.fbq('track', 'PageView');
    }
  }, [pathname]);

  return null;
}
