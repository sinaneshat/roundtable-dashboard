import { WebAppEnvs } from '@roundtable/shared/enums';
import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';

import { getApiOriginUrl, getWebappEnv } from '@/lib/config/base-urls';

import { PageViewTracker } from './pageview-tracker';
import { PostHogIdentifyUser } from './posthog-identify-user';

declare global {
  // eslint-disable-next-line ts/consistent-type-definitions
  interface Window {
    posthog?: typeof posthog;
  }
}

type PostHogProviderProps = {
  children: ReactNode;
  apiKey?: string;
};

/**
 * PostHog Provider - Deferred loading for TanStack Start + Cloudflare Workers
 *
 * PostHog is loaded after browser idle via IdleLazyProvider for optimization.
 * API key passed as prop from root loader (TanStack Start pattern).
 * Environment detection via import.meta.env (Vite build-time replacement).
 */
export default function PostHogProvider({
  children,
  apiKey,
}: PostHogProviderProps) {
  const initStarted = useRef(false);

  // Environment detection via hydrated env vars from server
  const environment = getWebappEnv();
  const isLocal = environment === WebAppEnvs.LOCAL;

  useEffect(() => {
    // Skip SSR
    if (typeof window === 'undefined') {
      return;
    }

    // Skip local env (localhost/127.0.0.1)
    if (isLocal) {
      return;
    }

    // Skip missing API key
    if (!apiKey) {
      return;
    }

    // Prevent double init
    if (initStarted.current) {
      return;
    }
    initStarted.current = true;

    // Check if already initialized (e.g., HMR)
    if (posthog.__loaded) {
      window.posthog = posthog;
      return;
    }

    const apiHost = `${getApiOriginUrl()}/ingest`;

    posthog.init(apiKey, {
      // Route through our API reverse proxy to bypass ad blockers
      api_host: apiHost,
      ui_host: 'https://us.posthog.com',

      // Pageview: Manual control for SPA accuracy
      capture_pageview: false,
      capture_pageleave: 'if_capture_pageview',

      // Core tracking
      person_profiles: 'identified_only',
      autocapture: true,
      capture_exceptions: true,
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: '[data-private], .ph-mask',
        blockClass: 'ph-no-capture',
        blockSelector: '[data-ph-no-capture]',
        recordCrossOriginIframes: false,
      },

      // Other config
      scroll_root_selector: '#root',
      // Disable debug mode to prevent verbose console logging
      debug: false,

      // Expose to window + capture initial pageview
      loaded: (ph) => {
        window.posthog = ph as typeof window.posthog;
        ph.capture('$pageview');
      },
    });

    // Set window.posthog immediately after init call
    window.posthog = posthog;
  }, [apiKey, environment, isLocal]);

  // Skip SSR
  if (typeof window === 'undefined') {
    return <>{children}</>;
  }

  // Skip local env or missing API key
  if (isLocal || !apiKey) {
    return <>{children}</>;
  }

  return (
    <PHProvider client={posthog}>
      <PostHogIdentifyUser />
      <PageViewTracker />
      {children}
    </PHProvider>
  );
}
