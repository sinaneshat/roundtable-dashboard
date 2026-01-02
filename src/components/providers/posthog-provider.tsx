'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';

type PostHogProviderProps = {
  children: ReactNode;
  apiKey?: string;
  environment?: string;
};

const PostHogProviderInternal = dynamic(
  async () => {
    try {
      const [posthogModule, reactModule] = await Promise.all([
        import('posthog-js'),
        import('posthog-js/react'),
      ]);

      const posthog = posthogModule?.default;
      const PHProvider = reactModule?.PostHogProvider;

      if (!posthog || !PHProvider) {
        console.error('[PostHog] Failed to load modules');
        return {
          default: ({ children }: PostHogProviderProps) => <>{children}</>,
        };
      }

      return {
        default: function PostHogInternal({
          children,
          apiKey,
          environment,
        }: PostHogProviderProps) {
          const shouldInitialize = environment !== 'local' && apiKey;

          if (shouldInitialize) {
            try {
              posthog.init(apiKey, {
                api_host: '/ingest',
                ui_host: 'https://us.posthog.com',
                defaults: '2025-11-30',
                person_profiles: 'identified_only',
                capture_pageview: false,
                capture_pageleave: true,
                autocapture: true,
                capture_exceptions: true,
                session_recording: {
                  recordCrossOriginIframes: false,
                },
                loaded: (ph) => {
                  if (process.env.NODE_ENV === 'development') {
                    ph.debug();
                  }
                },
              });
            } catch (err) {
              console.error('[PostHog] Init failed:', err);
            }
          }

          return <PHProvider client={posthog}>{children}</PHProvider>;
        },
      };
    } catch (err) {
      console.error('[PostHog] Module load failed:', err);
      return {
        default: ({ children }: PostHogProviderProps) => <>{children}</>,
      };
    }
  },
  {
    ssr: false,
    loading: () => null,
  },
);

export default function PostHogProvider(props: PostHogProviderProps) {
  if (props.environment === 'local' || !props.apiKey) {
    return <>{props.children}</>;
  }

  return <PostHogProviderInternal {...props} />;
}
