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
 * Pattern: src/components/providers/posthog-provider.tsx
 *
 * @param children - Child components to wrap
 * @param apiKey - PostHog project API key (from NEXT_PUBLIC_POSTHOG_API_KEY)
 * @param apiHost - PostHog API host (from NEXT_PUBLIC_POSTHOG_HOST)
 * @param environment - Current environment (from NEXT_PUBLIC_WEBAPP_ENV)
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
      // Check if PostHog is already initialized to avoid duplicate initialization
      // PostHog uses __loaded flag internally (not part of public API, but safe to check)
      if (!('__loaded' in posthog) || !posthog.__loaded) {
        posthog.init(apiKey, {
          api_host: apiHost,
          person_profiles: 'identified_only', // Only create profiles for identified users
          capture_pageview: false, // We'll capture pageviews manually via Next.js routing
          capture_pageleave: true, // Track when users leave pages
          autocapture: true, // Automatically capture clicks, form submissions, etc.
          session_recording: {
            recordCrossOriginIframes: false, // Don't record cross-origin iframes for privacy
          },
          // Performance optimizations
          loaded: () => {
            // PostHog initialized successfully
          },
        });
      }
    } else if (!isProduction) {
      // PostHog is disabled in non-production environments
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
