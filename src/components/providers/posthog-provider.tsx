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

const PostHogProviderInternal = dynamic(
  () =>
    import('posthog-js').then((posthogModule) => {
      const posthog = posthogModule.default;

      return import('posthog-js/react').then((reactModule) => {
        const PHProvider = reactModule.PostHogProvider;

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
  if (props.environment === 'local' || !props.apiKey || !props.apiHost) {
    return <>{props.children}</>;
  }

  return <PostHogProviderInternal {...props} />;
}
