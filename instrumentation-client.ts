/**
 * PostHog Client-Side Instrumentation
 *
 * This file is automatically loaded by Next.js 15+ for client-side instrumentation.
 * It initializes the PostHog JavaScript SDK for browser-based analytics.
 *
 * Official PostHog Next.js pattern:
 * - Runs once when the client bundle loads
 * - Provides global PostHog instance for client-side usage
 * - Complements the PostHogProvider for React hooks
 * - Disabled in local environment, enabled in preview and production
 *
 * Reference: https://posthog.com/docs/libraries/next-js
 * Pattern: instrumentation-client.ts (root level)
 */

import posthog from 'posthog-js';

// Initialize PostHog client-side
// This runs once when the client-side bundle loads
if (typeof window !== 'undefined') {
  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_API_KEY;
  const environment = process.env.NEXT_PUBLIC_WEBAPP_ENV;

  // Disable in local environment, enable in preview and production
  if (environment !== 'local' && apiKey) {
    posthog.init(apiKey, {
      api_host: '/ingest', // Reverse proxy path (bypasses ad blockers)
      ui_host: 'https://us.posthog.com', // Required for toolbar/features
      defaults: '2025-11-30', // API version for consistent behavior
      person_profiles: 'identified_only',
      capture_pageview: false, // Manual pageview tracking
      capture_pageleave: true,
      autocapture: true,
      capture_exceptions: true, // Auto-capture unhandled errors + promise rejections
      session_recording: {
        recordCrossOriginIframes: false,
      },
      loaded: (posthog) => {
        if (process.env.NODE_ENV === 'development') {
          posthog.debug();
        }
      },
    });
  }
}
