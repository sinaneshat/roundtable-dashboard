'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

type PostHogProviderProps = {
  children: ReactNode;
  apiKey?: string;
  apiHost?: string;
  environment?: string;
};

/**
 * PostHog Analytics Provider with Lazy Loading
 *
 * Provides PostHog analytics with optimal performance using dynamic imports.
 * PostHog initialization is deferred until after initial page render.
 *
 * Disabled in local environment, enabled in preview and production.
 *
 * Performance Strategy:
 * - Component lazy loaded with next/dynamic (see app-providers.tsx)
 * - Initialization deferred with setTimeout to not block render
 * - No impact on initial page load or Core Web Vitals
 *
 * Pattern: src/components/providers/posthog-provider.tsx
 * Reference: https://posthog.com/docs/libraries/next-js
 *
 * @param props - Component props
 * @param props.children - Child components to wrap
 * @param props.apiKey - PostHog project API key (from NEXT_PUBLIC_POSTHOG_API_KEY)
 * @param props.apiHost - PostHog API host (from NEXT_PUBLIC_POSTHOG_HOST)
 * @param props.environment - Current environment (from NEXT_PUBLIC_WEBAPP_ENV)
 */
function PostHogProvider({
  children,
  apiKey,
  apiHost,
  environment,
}: PostHogProviderProps) {
  const [isInitialized, setIsInitialized] = useState(false);

  // Only load PostHog in preview and production environments
  const shouldInitialize = environment !== 'local' && apiKey && apiHost;

  useEffect(() => {
    if (!shouldInitialize || isInitialized) {
      return;
    }

    // Defer initialization to not block initial render
    const timeoutId = setTimeout(() => {
      posthog.init(apiKey!, {
        api_host: apiHost!,
        // API version date - ensures consistent behavior across PostHog updates
        defaults: '2025-05-24',
        // Only create profiles for identified users
        person_profiles: 'identified_only',
        // Manual pageview tracking via Next.js routing (see posthog-pageview.tsx)
        capture_pageview: false,
        // Track when users leave pages
        capture_pageleave: true,
        // Automatically capture clicks, form submissions, etc.
        autocapture: true,
        // Session recording configuration
        session_recording: {
          recordCrossOriginIframes: false, // Privacy: don't record cross-origin iframes
        },
        // Callback when PostHog is fully loaded
        loaded: (posthog) => {
          if (process.env.NODE_ENV === 'development') {
            posthog.debug(); // Enable debug mode in development
          }
        },
      });
      setIsInitialized(true);
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [shouldInitialize, apiKey, apiHost, isInitialized]);

  if (!shouldInitialize) {
    // In local environment, just return children without PostHog
    return <>{children}</>;
  }

  // Wrap children in PostHog provider once initialized
  if (isInitialized) {
    return <PHProvider client={posthog}>{children}</PHProvider>;
  }

  // Return children directly during initialization
  return <>{children}</>;
}

export default PostHogProvider;
