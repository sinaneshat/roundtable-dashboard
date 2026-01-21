import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import type { ReactNode } from 'react';

import { getApiOriginUrl } from '@/lib/config/base-urls';

import { PageViewTracker } from './pageview-tracker';
import { PostHogIdentifyUser } from './posthog-identify-user';

type PostHogProviderProps = {
  children: ReactNode;
  apiKey?: string;
  environment?: string;
};

// Module-level singleton flag - ensures PostHog is initialized only once
let posthogInitialized = false;

/**
 * Initialize PostHog synchronously at module level.
 * This ensures window.posthog is available immediately for toolbar support.
 *
 * Uses reverse proxy through API to bypass ad blockers:
 * - api_host: routes through our API at /ingest/*
 * - ui_host: direct PostHog for toolbar/debug features
 */
function initPostHog(apiKey: string, environment: string) {
  // Skip on server
  if (typeof window === 'undefined')
    return null;

  // Return existing instance if already initialized
  if (posthogInitialized)
    return posthog;

  // Skip in local environment or if missing config
  if (environment === 'local' || !apiKey)
    return null;

  // Use reverse proxy through API to bypass ad blockers
  const apiHost = `${getApiOriginUrl()}/ingest`;

  posthog.init(apiKey, {
    // Route through our API reverse proxy to bypass ad blockers
    api_host: apiHost,
    ui_host: 'https://us.posthog.com',

    // Expose to window for toolbar support
    loaded: (ph) => {
      if (typeof window !== 'undefined') {
        // eslint-disable-next-line ts/no-explicit-any
        (window as any).posthog = ph;
      }
    },

    // Pageview Tracking
    capture_pageview: 'history_change',
    capture_pageleave: 'if_capture_pageview',

    // User Identification
    person_profiles: 'identified_only',

    // Autocapture Features
    autocapture: true,
    capture_dead_clicks: true,
    capture_heatmaps: true,

    // Exception Tracking
    capture_exceptions: true,

    // Session Recording with Privacy Protection
    disable_session_recording: false,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: '[data-private], .ph-mask',
      blockClass: 'ph-no-capture',
      blockSelector: '[data-ph-no-capture]',
      recordCrossOriginIframes: false,
    },
    enable_recording_console_log: false,

    // Scroll Tracking - TanStack Start uses #root by default
    scroll_root_selector: '#root',

    // Debug Mode - enabled in non-prod for troubleshooting
    debug: environment !== 'prod',
  });

  posthogInitialized = true;
  return posthog;
}

/**
 * PostHog Provider - TanStack Start Pattern for Cloudflare Workers
 *
 * @see https://posthog.com/docs/libraries/react
 *
 * Uses reverse proxy through API to bypass ad blockers.
 * PostHog is initialized synchronously on first client render to ensure
 * window.posthog is available for toolbar support.
 */
export default function PostHogProvider({
  children,
  apiKey,
  environment,
}: PostHogProviderProps) {
  // Initialize synchronously on first client render
  const client = initPostHog(apiKey ?? '', environment ?? 'local');

  // Skip provider if no client (local env, missing config, or SSR)
  if (!client) {
    return <>{children}</>;
  }

  return (
    <PHProvider client={client}>
      <PostHogIdentifyUser />
      <PageViewTracker />
      {children}
    </PHProvider>
  );
}
