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
 * Only initializes in production environment to avoid tracking development/preview data.
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
    // Only initialize PostHog in production environment
    const isProduction = environment === 'prod';

    if (isProduction && apiKey && apiHost) {
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

  // Only wrap children in PostHog provider if we're in production
  const isProduction = environment === 'prod';

  if (isProduction && apiKey && apiHost) {
    return <PHProvider client={posthog}>{children}</PHProvider>;
  }

  // In non-production environments, just return children without PostHog
  return <>{children}</>;
}

export default PostHogProvider;
