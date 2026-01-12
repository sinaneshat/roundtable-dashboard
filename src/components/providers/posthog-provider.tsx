'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import type { ReactNode } from 'react';
import { Suspense } from 'react';

import { PageViewTracker } from './pageview-tracker';
import { PostHogIdentifyUser } from './posthog-identify-user';

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
// WHY: Next.js App Router with client components needs top-level init to prevent re-initialization
// on every render. Using `capture_pageview: 'history_change'` for automatic SPA navigation tracking.
if (typeof window !== 'undefined') {
  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_API_KEY;
  const apiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  const environment = process.env.NEXT_PUBLIC_WEBAPP_ENV;

  if (apiKey && apiHost && environment !== 'local') {
    posthog.init(apiKey, {
      // Use direct PostHog URL - OpenNext/Cloudflare rewrites don't work for external proxies
      // @see https://github.com/opennextjs/opennextjs-cloudflare/issues/594
      api_host: apiHost,
      ui_host: 'https://us.posthog.com',

      // Pageview Tracking
      // @see https://posthog.com/docs/product-analytics/autocapture
      capture_pageview: 'history_change', // Automatic SPA navigation tracking
      capture_pageleave: 'if_capture_pageview', // Track when users leave pages

      // User Identification
      person_profiles: 'identified_only', // Only create profiles for identified users

      // Autocapture Features
      autocapture: true, // Automatic event capture for clicks, form submissions, etc.
      capture_dead_clicks: true, // Track clicks that don't result in actions (rage clicks, dead clicks)
      capture_heatmaps: true, // Enable heatmap data collection for engagement visualization

      // Exception Tracking
      capture_exceptions: true, // Automatic error tracking

      // Session Recording with Privacy Protection
      // @see https://posthog.com/docs/session-replay
      disable_session_recording: false,
      session_recording: {
        // CRITICAL: Mask all inputs to protect passwords, emails, credit cards
        maskAllInputs: true,
        // Mask text in sensitive areas (use data-private attribute)
        maskTextSelector: '[data-private], .ph-mask',
        // Block entire sections from recording (payment forms, API keys)
        blockClass: 'ph-no-capture',
        blockSelector: '[data-ph-no-capture]',
        // Don't record cross-origin iframes
        recordCrossOriginIframes: false,
      },
      // Disable console log recording to prevent accidental PII capture
      enable_recording_console_log: false,

      // Scroll Tracking
      // For Next.js App Router, use #__next as the scroll root for proper scroll depth tracking
      scroll_root_selector: '#__next',

      // Debug Mode
      debug: environment === 'preview', // Enable debug logs in preview environment

      // Bootstrap Options (for faster initial load)
      // If you have feature flags, you can bootstrap them here to avoid initial load delay:
      // bootstrap: {
      //   featureFlags: {
      //     'flag-key': true,
      //   },
      // },

      // Loaded Callback - For debugging and initialization confirmation
      loaded: (posthog) => {
        if (environment === 'preview') {
          // eslint-disable-next-line no-console -- Debug logging for preview environment
          console.log('[PostHog] Loaded successfully', {
            distinctId: posthog.get_distinct_id(),
            sessionId: posthog.get_session_id(),
            config: posthog.config,
          });
        }
      },
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

  return (
    <PHProvider client={posthog}>
      <PostHogIdentifyUser />
      {/* Suspense required for useSearchParams in PageViewTracker - Next.js ISR/SSG requirement */}
      <Suspense fallback={null}>
        <PageViewTracker />
      </Suspense>
      {children}
    </PHProvider>
  );
}
