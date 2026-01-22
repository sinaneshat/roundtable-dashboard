import type { PostHog } from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

import { getApiOriginUrl } from '@/lib/config/base-urls';

import { PageViewTracker } from './pageview-tracker';
import { PostHogIdentifyUser } from './posthog-identify-user';

declare global {
  // eslint-disable-next-line ts/consistent-type-definitions
  interface Window {
    posthog?: PostHog;
  }
}

type PostHogProviderProps = {
  children: ReactNode;
  apiKey?: string;
  environment?: string;
};

/**
 * PostHog Provider - Async loading for TanStack Start + Cloudflare Workers
 *
 * Simple async loading via dynamic import - non-blocking but initializes quickly.
 * Heavy features disabled to reduce processing overhead.
 *
 * @see https://posthog.com/docs/libraries/react
 */
export default function PostHogProvider({
  children,
  apiKey,
  environment,
}: PostHogProviderProps) {
  const [client, setClient] = useState<PostHog | null>(null);
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

    import('posthog-js')
      .then((module) => {
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

          // Performance: Disable heavy features on first load
          advanced_disable_feature_flags_on_first_load: true,
          disable_session_recording: true,
          disable_surveys: true,
          disable_scroll_properties: true,
          disable_web_experiments: true,

          // Pageview: Manual control for SPA accuracy
          capture_pageview: false,
          capture_pageleave: 'if_capture_pageview',

          // Core tracking
          person_profiles: 'identified_only',
          autocapture: true,
          capture_exceptions: true,
          capture_heatmaps: false,
          capture_dead_clicks: false,

          // Session recording config (when enabled)
          session_recording: {
            maskAllInputs: true,
            maskTextSelector: '[data-private], .ph-mask',
            blockClass: 'ph-no-capture',
            blockSelector: '[data-ph-no-capture]',
            recordCrossOriginIframes: false,
          },
          enable_recording_console_log: false,

          // Other config
          scroll_root_selector: '#root',
          debug: environment !== 'prod',

          // Expose to window + capture initial pageview
          loaded: (ph) => {
            if (typeof window !== 'undefined') {
              window.posthog = ph as typeof window.posthog;

              // Load toolbar if authorization hash present
              const toolbarJSON = new URLSearchParams(
                window.location.hash.substring(1),
              ).get('__posthog');
              if (toolbarJSON) {
                try {
                  ph.loadToolbar(JSON.parse(toolbarJSON));
                } catch (e) {
                  console.error('[PostHog] Failed to load toolbar:', e);
                }
              }
            }
            ph.capture('$pageview');
          },
        });

        setClient(posthog);
      })
      .catch((error) => {
        console.error('[PostHog] Failed to load:', error);
      });
  }, [apiKey, environment]);

  // Render children immediately - PostHog loads async
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
