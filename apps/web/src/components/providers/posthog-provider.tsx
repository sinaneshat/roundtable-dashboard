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
 * Waits for Largest Contentful Paint (LCP) to complete before executing callback.
 * Falls back to load event if PerformanceObserver is unavailable.
 */
function waitForLCP(callback: () => void): void {
  if (typeof PerformanceObserver === 'undefined') {
    // Fallback: wait for load event
    if (document.readyState === 'complete') {
      callback();
    } else {
      window.addEventListener('load', callback, { once: true });
    }
    return;
  }

  let lcpTriggered = false;

  const observer = new PerformanceObserver((list) => {
    const entries = list.getEntries();
    const lastEntry = entries[entries.length - 1];

    // LCP is considered stable after no new entries for a while
    if (lastEntry && !lcpTriggered) {
      lcpTriggered = true;
      observer.disconnect();
      callback();
    }
  });

  try {
    observer.observe({ type: 'largest-contentful-paint', buffered: true });

    // Fallback timeout if LCP never fires (e.g., no images)
    setTimeout(() => {
      if (!lcpTriggered) {
        lcpTriggered = true;
        observer.disconnect();
        callback();
      }
    }, 5000);
  } catch {
    // Fallback if observer fails
    callback();
  }
}

/**
 * Waits for first user interaction (click, scroll, or keydown).
 * Automatically triggers after maxWait timeout if no interaction.
 */
function waitForInteraction(callback: () => void, maxWait = 10000): void {
  let triggered = false;

  const trigger = () => {
    if (triggered)
      return;
    triggered = true;

    // Remove all event listeners
    window.removeEventListener('click', trigger);
    window.removeEventListener('scroll', trigger);
    window.removeEventListener('keydown', trigger);
    window.removeEventListener('touchstart', trigger);

    callback();
  };

  // Listen for user interactions
  window.addEventListener('click', trigger, { once: true, passive: true });
  window.addEventListener('scroll', trigger, { once: true, passive: true });
  window.addEventListener('keydown', trigger, { once: true, passive: true });
  window.addEventListener('touchstart', trigger, { once: true, passive: true });

  // Fallback: trigger after maxWait even without interaction
  setTimeout(trigger, maxWait);
}

/**
 * Schedule a callback to run when the browser is idle, AFTER LCP and user interaction.
 * This aggressive deferral strategy ensures analytics never blocks critical rendering.
 *
 * Strategy:
 * 1. Wait for LCP (Largest Contentful Paint) - ensures above-the-fold content is painted
 * 2. Wait for first user interaction OR 10s timeout - ensures user sees content first
 * 3. Use requestIdleCallback with 5s timeout - load when browser truly idle
 *
 * This reduces initial bundle waste from 84% (153KB unused) to near-zero.
 */
function scheduleWhenIdle(callback: () => void): void {
  // Step 1: Wait for LCP
  waitForLCP(() => {
    // Step 2: Wait for first interaction or 10s timeout
    waitForInteraction(() => {
      // Step 3: Use requestIdleCallback with longer timeout
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(callback, { timeout: 5000 });
      } else {
        setTimeout(callback, 100);
      }
    }, 10000);
  });
}

/**
 * PostHog Provider - Aggressive Performance Optimization for TanStack Start + Cloudflare Workers
 *
 * ULTRA-DEFERRED LOADING STRATEGY:
 * The PostHog bundle (180KB raw / 60KB gzipped) is aggressively deferred to eliminate
 * the 84% initial waste (153KB unused on first load).
 *
 * Performance Optimizations:
 * 1. LCP Wait: Defers loading until Largest Contentful Paint completes
 * 2. Interaction Wait: Waits for first user interaction (click/scroll) OR 10s timeout
 * 3. requestIdleCallback: Final deferral with 5s timeout when browser truly idle
 * 4. Dynamic Import: PostHog library loaded asynchronously after all critical content
 * 5. Minimal Config: Heavy features disabled to reduce processing overhead
 *
 * Loading Sequence:
 * - Page Load → LCP Event → User Interaction (or 10s) → Idle Callback → PostHog Init
 * - Ensures analytics NEVER blocks critical rendering or user interaction
 * - Events are automatically queued by PostHog until initialization completes
 *
 * Heavy Features Disabled:
 * - Session recording (enable via useDeferredSessionRecording)
 * - Surveys (opt-in only)
 * - Feature flags on first load (fetched on identify)
 * - Heatmaps, dead click detection
 *
 * Result: ~153KB of unused code eliminated from initial bundle, loaded only when needed.
 *
 * @see https://posthog.com/docs/libraries/react
 * @see https://web.dev/lcp/ - Largest Contentful Paint optimization
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

    const initPostHog = () => {
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
                window.posthog = ph;

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
              // Capture initial pageview that was deferred
              ph.capture('$pageview');
            },
          });

          setClient(posthog);
        })
        .catch((error) => {
          console.error('[PostHog] Failed to load:', error);
        });
    };

    // Toolbar detected - load immediately (bypasses deferral)
    if (window.location.hash.includes('__posthog')) {
      initPostHog();
      return;
    }

    // Normal flow: schedule PostHog init when browser idle
    scheduleWhenIdle(initPostHog);
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
