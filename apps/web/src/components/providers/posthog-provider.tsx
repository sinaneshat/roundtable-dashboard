/* eslint-disable no-console */
import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';

import { getApiOriginUrl } from '@/lib/config/base-urls';

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
  environment?: string;
};

/**
 * Detect environment from hostname (client-side fallback)
 * Used when server-side env detection fails (known TanStack Start + CF issue)
 */
function detectEnvFromHostname(): 'local' | 'preview' | 'prod' {
  if (typeof window === 'undefined')
    return 'local';

  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'local';
  }
  if (hostname.includes('preview') || hostname.includes('-preview')) {
    return 'preview';
  }
  return 'prod';
}

/**
 * PostHog Provider - Synchronous loading for TanStack Start + Cloudflare Workers
 *
 * PostHog is initialized synchronously to ensure window.posthog is available
 * for toolbar authorization and other integrations.
 *
 * NOTE: Uses hostname-based env detection as fallback due to known TanStack Start
 * SSR issue where Cloudflare env vars don't propagate correctly.
 */
export default function PostHogProvider({
  children,
  apiKey,
  environment: envProp,
}: PostHogProviderProps) {
  const initStarted = useRef(false);

  // Detect actual environment from hostname (fallback for CF SSR issue)
  const detectedEnv = typeof window !== 'undefined' ? detectEnvFromHostname() : 'local';
  // Use detected env if prop says "local" but hostname says otherwise
  const environment = (envProp === 'local' && detectedEnv !== 'local') ? detectedEnv : envProp;

  // Debug: Log props on every render (client-side only)
  useEffect(() => {
    console.log('[PostHog] Provider mounted', {
      apiKey: apiKey ? `${apiKey.slice(0, 10)}...` : 'MISSING',
      envProp,
      detectedEnv,
      resolvedEnv: environment,
      hostname: window.location.hostname,
    });
  }, [apiKey, envProp, detectedEnv, environment]);

  useEffect(() => {
    // Skip SSR
    if (typeof window === 'undefined') {
      return;
    }

    // Skip truly local env (localhost/127.0.0.1)
    if (environment === 'local') {
      console.log('[PostHog] Skipped: local environment (localhost)');
      return;
    }

    // Skip missing API key
    if (!apiKey) {
      console.warn('[PostHog] Skipped: no API key provided');
      return;
    }

    // Prevent double init
    if (initStarted.current) {
      console.log('[PostHog] Skipped: already initialized');
      return;
    }
    initStarted.current = true;

    // Check if already initialized (e.g., HMR)
    if (posthog.__loaded) {
      console.log('[PostHog] Already loaded (HMR), reusing instance');
      window.posthog = posthog;
      return;
    }

    const apiHost = `${getApiOriginUrl()}/ingest`;
    console.log('[PostHog] Initializing...', {
      apiKey: `${apiKey.slice(0, 10)}...`,
      apiHost,
      environment,
    });

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
      debug: environment !== 'prod',

      // Expose to window + capture initial pageview
      loaded: (ph) => {
        console.log('[PostHog] Loaded callback fired, setting window.posthog');
        window.posthog = ph as typeof window.posthog;

        // Load toolbar if authorization hash present
        const toolbarJSON = new URLSearchParams(
          window.location.hash.substring(1),
        ).get('__posthog');
        if (toolbarJSON) {
          console.log('[PostHog] Toolbar auth detected, loading toolbar...');
          try {
            ph.loadToolbar(JSON.parse(toolbarJSON));
            console.log('[PostHog] Toolbar loaded successfully');
          } catch (e) {
            console.error('[PostHog] Failed to load toolbar:', e);
          }
        }

        ph.capture('$pageview');
        console.log('[PostHog] Initial pageview captured');
      },
    });

    // Set window.posthog immediately after init call
    window.posthog = posthog;
    console.log('[PostHog] Init complete, window.posthog set');
  }, [apiKey, environment]);

  // Skip SSR
  if (typeof window === 'undefined') {
    return <>{children}</>;
  }

  // Skip truly local env or missing API key
  if (environment === 'local' || !apiKey) {
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
