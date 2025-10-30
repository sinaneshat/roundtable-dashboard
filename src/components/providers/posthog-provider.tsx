'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';
import { useEffect } from 'react';

type PostHogProviderProps = {
  children: ReactNode;
  apiKey?: string;
  apiHost?: string;
  environment?: string;
};

/**
 * PostHog Analytics Provider with Lazy Loading
 *
 * Self-contained provider that handles dynamic loading internally.
 * PostHog initialization is deferred until after initial page render.
 *
 * Disabled in local environment, enabled in preview and production.
 *
 * Performance Strategy:
 * - Dynamic import handled internally (not in parent)
 * - Client-only loading with ssr: false
 * - Initialization deferred to not block render
 * - No impact on initial page load or Core Web Vitals
 *
 * Pattern: src/components/providers/posthog-provider.tsx
 * Reference: https://posthog.com/docs/libraries/next-js
 *
 * @param props - Component props
 * @param props.children - Child components to wrap
 * @param props.apiKey - PostHog project API key (from NEXT_PUBLIC_POSTHOG_API_KEY)
 * @param props.apiHost - PostHog API host (from NEXT_PUBLIC_POSTHOG_HOST)
 * @param props.environment - Current environment (from NEXT_PUBLIC_WEBAPP_ENV)
 */

// ✅ DYNAMIC IMPORT: Lazy load PostHog libs only when needed
const PostHogProviderInternal = dynamic(
  () =>
    import('posthog-js').then((posthogModule) => {
      const posthog = posthogModule.default;

      // Import PHProvider
      return import('posthog-js/react').then((reactModule) => {
        const PHProvider = reactModule.PostHogProvider;

        // Return component that uses both
        return {
          default: function PostHogInternal({
            children,
            apiKey,
            apiHost,
            environment,
          }: PostHogProviderProps) {
            const shouldInitialize = environment !== 'local' && apiKey && apiHost;

            useEffect(() => {
              if (!shouldInitialize) {
                return;
              }

              if (posthog.__loaded) {
                return;
              }

              const timeoutId = setTimeout(() => {
                posthog.init(apiKey!, {
                  api_host: apiHost!,
                  defaults: '2025-05-24',
                  person_profiles: 'identified_only',
                  capture_pageview: false,
                  capture_pageleave: true,
                  autocapture: true,
                  session_recording: {
                    recordCrossOriginIframes: false,
                  },
                  loaded: (posthog) => {
                    if (process.env.NODE_ENV === 'development') {
                      posthog.debug();
                    }
                  },
                });
              }, 0);

              return () => clearTimeout(timeoutId);
            }, [shouldInitialize, apiKey, apiHost]);

            return <PHProvider client={posthog}>{children}</PHProvider>;
          },
        };
      });
    }),
  {
    ssr: false,
    loading: () => null,
  },
);

export default function PostHogProvider(props: PostHogProviderProps) {
  // In local, skip PostHog entirely
  if (props.environment === 'local' || !props.apiKey || !props.apiHost) {
    return <>{props.children}</>;
  }

  return <PostHogProviderInternal {...props} />;
}
