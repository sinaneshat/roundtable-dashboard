import { PostHogProvider as PHProvider } from 'posthog-js/react';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

import { getApiOriginUrl } from '@/lib/config/base-urls';

import { PageViewTracker } from './pageview-tracker';
import { PostHogIdentifyUser } from './posthog-identify-user';

type PostHogProviderProps = {
  children: ReactNode;
  apiKey?: string;
  environment?: string;
};

/**
 * PostHog Provider - Performance Optimized for TanStack Start + Cloudflare Workers
 *
 * Uses deferred initialization via dynamic import to avoid blocking initial paint.
 * PostHog bundle (~150KB) loads AFTER first contentful paint.
 *
 * Optimizations:
 * - Dynamic import: Bundle loads in background
 * - Feature flags disabled on first load: No extra network request until identify()
 * - Session recording deferred: Enabled after user interaction via useDeferredSessionRecording
 * - Manual pageview: Captured in loaded callback after init completes
 *
 * @see https://posthog.com/docs/libraries/react
 */
export default function PostHogProvider({
  children,
  apiKey,
  environment,
}: PostHogProviderProps) {
  const [client, setClient] = useState<typeof import('posthog-js').default | null>(null);
  const initStarted = useRef(false);

  useEffect(() => {
    // Skip SSR
    if (typeof window === 'undefined')
      return;

    // Skip local env or missing config
    if (environment === 'local' || !apiKey)
      return;

    // Prevent double init
    if (initStarted.current)
      return;
    initStarted.current = true;

    // Dynamic import - doesn't block initial paint
    import('posthog-js').then((module) => {
      const posthog = module.default;

      // Check if already initialized (e.g., HMR)
      if (posthog.__loaded) {
        setClient(posthog);
        return;
      }

      const apiHost = `${getApiOriginUrl()}/ingest`;

      posthog.init(apiKey, {
        // Route through our API reverse proxy to bypass ad blockers
        api_host: apiHost,
        ui_host: 'https://us.posthog.com',

        // PERFORMANCE: Don't fetch flags until identify()
        advanced_disable_feature_flags_on_first_load: true,

        // PERFORMANCE: Defer session recording until user interaction
        disable_session_recording: true,

        // Manual pageview control (capture after init)
        capture_pageview: false,
        capture_pageleave: 'if_capture_pageview',

        // User identification
        person_profiles: 'identified_only',

        // Lightweight autocapture features
        autocapture: true,
        capture_dead_clicks: true,
        capture_heatmaps: true,

        // Exception tracking
        capture_exceptions: true,

        // Session recording config (when enabled via startSessionRecording)
        session_recording: {
          maskAllInputs: true,
          maskTextSelector: '[data-private], .ph-mask',
          blockClass: 'ph-no-capture',
          blockSelector: '[data-ph-no-capture]',
          recordCrossOriginIframes: false,
        },
        enable_recording_console_log: false,

        // Scroll tracking - TanStack Start uses #root by default
        scroll_root_selector: '#root',

        // Debug mode - enabled in non-prod for troubleshooting
        debug: environment !== 'prod',

        // Expose to window for toolbar support
        loaded: (ph) => {
          if (typeof window !== 'undefined') {
            // eslint-disable-next-line ts/no-explicit-any
            (window as any).posthog = ph;
          }
          // Capture initial pageview that was deferred
          ph.capture('$pageview');
        },
      });

      setClient(posthog);
    });
  }, [apiKey, environment]);

  // Render children immediately - PostHog loads in background
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
