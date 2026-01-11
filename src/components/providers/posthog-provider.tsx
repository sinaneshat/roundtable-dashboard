'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import type { ReactNode } from 'react';

type PostHogProviderProps = {
  children: ReactNode;
  apiKey?: string;
  environment?: string;
};

/**
 * PostHog Provider - Official Next.js App Router Pattern
 *
 * @see https://posthog.com/docs/libraries/next-js
 * @see https://github.com/posthog/posthog-js/blob/main/packages/react/README.md
 *
 * Uses top-level initialization with typeof window check for SSR safety.
 * Uses capture_pageview: 'history_change' for automatic SPA navigation tracking.
 */

// Top-level initialization - official pattern for Next.js App Router
// This runs once when the module is first imported on the client
if (typeof window !== 'undefined') {
  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_API_KEY;
  const environment = process.env.NEXT_PUBLIC_WEBAPP_ENV;

  if (apiKey && environment !== 'local') {
    posthog.init(apiKey, {
      api_host: '/ingest',
      ui_host: 'https://us.posthog.com',
      // Capture pageviews on history change (SPA navigation)
      // @see https://posthog.com/docs/product-analytics/autocapture
      capture_pageview: 'history_change',
      capture_pageleave: 'if_capture_pageview',
      person_profiles: 'identified_only',
      autocapture: true,
      capture_exceptions: true,
      session_recording: {
        recordCrossOriginIframes: false,
      },
      debug: environment === 'preview',
    });
  }
}

export default function PostHogProvider({
  children,
  apiKey,
  environment,
}: PostHogProviderProps) {
  // Skip provider in local environment or if no API key
  if (environment === 'local' || !apiKey) {
    return <>{children}</>;
  }

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
