'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import type { ReactNode } from 'react';
import { useEffect } from 'react';

type PostHogProviderProps = {
  children: ReactNode;
  apiKey?: string;
  apiHost?: string;
  environment?: string;
};

/**
 * PostHog Analytics Provider
 *
 * Provides PostHog analytics capabilities for the application.
 * Disabled in local environment, enabled in preview and production.
 *
 * Following official PostHog Next.js patterns:
 * - Client-side initialization with useEffect
 * - PostHogProvider wrapper for React hooks
 * - Environment-based conditional initialization
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
  useEffect(() => {
    // Initialize PostHog in preview and production environments (disabled in local)
    const shouldInitialize = environment !== 'local';

    if (shouldInitialize && apiKey && apiHost) {
      // Initialize PostHog - it handles duplicate initialization internally
      posthog.init(apiKey, {
        api_host: apiHost,
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
    }
  }, [apiKey, apiHost, environment]);

  // Wrap children in PostHog provider if not in local environment
  const shouldInitialize = environment !== 'local';

  if (shouldInitialize && apiKey && apiHost) {
    return <PHProvider client={posthog}>{children}</PHProvider>;
  }

  // In local environment, just return children without PostHog
  return <>{children}</>;
}

export default PostHogProvider;
