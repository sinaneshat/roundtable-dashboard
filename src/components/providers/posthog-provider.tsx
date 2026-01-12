'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import type { ReactNode } from 'react';
import { Suspense, useEffect, useRef } from 'react';

import { PageViewTracker } from './pageview-tracker';
import { PostHogIdentifyUser } from './posthog-identify-user';

type PostHogProviderProps = {
  children: ReactNode;
  apiKey?: string;
  apiHost?: string;
  environment?: string;
};

/**
 * PostHog Provider - Next.js App Router Pattern for Cloudflare/OpenNext
 *
 * @see https://posthog.com/docs/libraries/next-js
 *
 * NOTE: Top-level initialization doesn't work reliably on Cloudflare/OpenNext because
 * NEXT_PUBLIC_* env vars may not be inlined at build time. We use useEffect initialization
 * instead, with a ref to ensure single initialization.
 */

export default function PostHogProvider({
  children,
  apiKey,
  apiHost,
  environment,
}: PostHogProviderProps) {
  const initialized = useRef(false);

  useEffect(() => {
    // Skip in local environment or if missing config
    if (environment === 'local' || !apiKey || !apiHost) {
      return;
    }

    // Prevent re-initialization
    if (initialized.current || posthog.__loaded) {
      return;
    }

    initialized.current = true;

    posthog.init(apiKey, {
      // Use direct PostHog URL - OpenNext/Cloudflare rewrites don't work for external proxies
      // @see https://github.com/opennextjs/opennextjs-cloudflare/issues/594
      api_host: apiHost,
      ui_host: 'https://us.posthog.com',

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

      // Scroll Tracking
      scroll_root_selector: '#__next',

      // Debug Mode - enable in preview for troubleshooting
      debug: environment === 'preview',

      // Loaded Callback
      loaded: (ph) => {
        if (environment === 'preview') {
          // eslint-disable-next-line no-console
          console.log('[PostHog] Initialized', {
            distinctId: ph.get_distinct_id(),
            sessionId: ph.get_session_id(),
          });
        }
      },
    });
  }, [apiKey, apiHost, environment]);

  // Skip provider in local environment or if no API key
  if (environment === 'local' || !apiKey) {
    return <>{children}</>;
  }

  return (
    <PHProvider client={posthog}>
      <PostHogIdentifyUser />
      <Suspense fallback={null}>
        <PageViewTracker />
      </Suspense>
      {children}
    </PHProvider>
  );
}
