import type { PostHog } from 'posthog-js';
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
 * Schedule a callback to run when the browser is idle.
 * Falls back to setTimeout if requestIdleCallback is not available.
 */
function scheduleWhenIdle(callback: () => void, timeout = 2000): void {
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(callback, { timeout });
  } else {
    setTimeout(callback, 50); // Small delay to let initial paint complete
  }
}

/**
 * PostHog Provider - Performance Optimized for TanStack Start + Cloudflare Workers
 *
 * Uses TRUE async loading via script injection to avoid blocking initial paint.
 * The PostHog bundle (~150KB) is loaded from our reverse proxy AFTER first paint.
 *
 * Performance Optimizations:
 * 1. requestIdleCallback: Defers loading until browser is idle
 * 2. Script injection: True async loading (not bundled with app)
 * 3. Minimal config: Heavy features disabled on first load
 * 4. Manual pageview: Captured after init completes in loaded callback
 *
 * Heavy features disabled:
 * - Session recording (enable via useDeferredSessionRecording)
 * - Surveys (opt-in only)
 * - Feature flags on first load (fetched on identify)
 * - Heatmaps, dead click detection (lightweight but deferred)
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

    // Schedule PostHog initialization when browser is idle
    // This ensures initial paint is not blocked
    scheduleWhenIdle(() => {
      // Dynamic import the library - this doesn't block initial paint
      // because we're already past first paint when this runs
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

          // ═══════════════════════════════════════════════════════════════
          // PERFORMANCE: Disable heavy features on first load
          // ═══════════════════════════════════════════════════════════════

          // Don't fetch feature flags until identify() - saves network request
          advanced_disable_feature_flags_on_first_load: true,

          // Defer session recording - enable via useDeferredSessionRecording
          disable_session_recording: true,

          // Disable surveys on load - reduces initial processing
          disable_surveys: true,

          // Disable scroll depth tracking - minor perf gain
          disable_scroll_properties: true,

          // Disable web experiments - not using A/B testing on load
          disable_web_experiments: true,

          // ═══════════════════════════════════════════════════════════════
          // PAGEVIEW: Manual control for accurate tracking
          // ═══════════════════════════════════════════════════════════════

          capture_pageview: false, // Manual in loaded callback
          capture_pageleave: 'if_capture_pageview',

          // ═══════════════════════════════════════════════════════════════
          // CORE TRACKING: Keep essential features lightweight
          // ═══════════════════════════════════════════════════════════════

          // Only create person profiles on identify
          person_profiles: 'identified_only',

          // Keep basic autocapture for button clicks, form submissions
          autocapture: true,

          // Exception tracking - essential for error monitoring
          capture_exceptions: true,

          // Disable heatmaps - enable via dashboard if needed
          capture_heatmaps: false,

          // Disable dead click detection on load
          capture_dead_clicks: false,

          // ═══════════════════════════════════════════════════════════════
          // SESSION RECORDING CONFIG (when enabled later)
          // ═══════════════════════════════════════════════════════════════

          session_recording: {
            maskAllInputs: true,
            maskTextSelector: '[data-private], .ph-mask',
            blockClass: 'ph-no-capture',
            blockSelector: '[data-ph-no-capture]',
            recordCrossOriginIframes: false,
          },
          enable_recording_console_log: false,

          // ═══════════════════════════════════════════════════════════════
          // OTHER CONFIG
          // ═══════════════════════════════════════════════════════════════

          // Scroll tracking root for TanStack Start
          scroll_root_selector: '#root',

          // Debug mode in non-prod
          debug: environment !== 'prod',

          // Expose to window for toolbar + capture initial pageview
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
    });
  }, [apiKey, environment]);

  // Render children immediately - PostHog loads in background after idle
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
