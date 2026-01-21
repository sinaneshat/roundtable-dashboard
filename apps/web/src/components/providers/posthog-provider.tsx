import type { PostHog } from 'posthog-js';
import type { ReactNode } from 'react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';

import { PageViewTracker } from './pageview-tracker';
import { PostHogIdentifyUser } from './posthog-identify-user';

type PostHogProviderProps = {
  children: ReactNode;
  apiKey?: string;
  apiHost?: string;
  environment?: string;
};

// Lazy load the PostHog React provider
const PHProvider = lazy(() =>
  import('posthog-js/react').then(mod => ({ default: mod.PostHogProvider })),
);

/**
 * PostHog Provider - TanStack Start Pattern for Cloudflare Workers
 *
 * @see https://posthog.com/docs/libraries/react
 *
 * NOTE: Environment variables are passed as props from the root layout to ensure
 * they are available during SSR. PostHog is lazy-loaded to reduce initial bundle size.
 */

export default function PostHogProvider({
  children,
  apiKey,
  apiHost,
  environment,
}: PostHogProviderProps) {
  const initialized = useRef(false);
  const [posthogClient, setPosthogClient] = useState<PostHog | null>(null);

  useEffect(() => {
    // Skip in local environment or if missing config
    if (environment === 'local' || !apiKey || !apiHost) {
      return;
    }

    // Prevent re-initialization (use ref only - no internal property access)
    if (initialized.current) {
      return;
    }

    initialized.current = true;

    // Lazy load PostHog to reduce initial bundle size
    import('posthog-js').then((mod) => {
      const posthog = mod.default;

      // Expose to window for PostHog toolbar support
      // Must be set before init() so toolbar can find it
      if (typeof window !== 'undefined') {
        // eslint-disable-next-line ts/no-explicit-any
        (window as any).posthog = posthog;
      }

      posthog.init(apiKey, {
        // Use direct PostHog URL for TanStack Start on Cloudflare
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

        // Scroll Tracking - TanStack Start uses #root by default
        scroll_root_selector: '#root',

        // Debug Mode - disabled in all environments to prevent console noise
        debug: false,
      });
      setPosthogClient(posthog);
    });
  }, [apiKey, apiHost, environment]);

  // Skip provider in local environment or if no API key
  if (environment === 'local' || !apiKey) {
    return <>{children}</>;
  }

  // Render children immediately, wrap with provider once PostHog is loaded
  if (!posthogClient) {
    return <>{children}</>;
  }

  return (
    <Suspense fallback={children}>
      <PHProvider client={posthogClient}>
        <PostHogIdentifyUser />
        <Suspense fallback={null}>
          <PageViewTracker />
        </Suspense>
        {children}
      </PHProvider>
    </Suspense>
  );
}
