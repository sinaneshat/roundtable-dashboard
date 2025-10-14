'use client';

import type { AbstractIntlMessages } from 'next-intl';
import { NextIntlClientProvider } from 'next-intl';
import { NuqsAdapter } from 'nuqs/adapters/next/app';

import { Toaster } from '@/components/ui/toaster';

import PostHogProvider from './posthog-provider';
import QueryClientProvider from './query-client-provider';

type AppProvidersProps = {
  children: React.ReactNode;
  locale: string;
  messages: AbstractIntlMessages;
  timeZone: string;
  now: Date;
  env: {
    NEXT_PUBLIC_WEBAPP_ENV?: string;
    NEXT_PUBLIC_MAINTENANCE?: string;
    NEXT_PUBLIC_POSTHOG_API_KEY?: string;
    NEXT_PUBLIC_POSTHOG_HOST?: string;
  };
};

/**
 * AppProviders - Global provider wrapper for the entire application
 *
 * Following the latest next-intl best practices for apps without locale routing:
 * - Single provider component wraps all global providers
 * - QueryClient configuration with sensible defaults
 * - NextIntlClientProvider receives explicit messages, locale, timeZone, and now
 * - Enables static rendering by providing all props explicitly
 *
 * Pattern: src/components/providers/app-providers.tsx
 * Reference: https://next-intl.dev/docs/usage/configuration
 */
export function AppProviders({
  children,
  locale,
  messages,
  timeZone,
  now,
  env,
}: AppProvidersProps) {
  return (
    <PostHogProvider
      apiKey={env.NEXT_PUBLIC_POSTHOG_API_KEY}
      apiHost={env.NEXT_PUBLIC_POSTHOG_HOST}
      environment={env.NEXT_PUBLIC_WEBAPP_ENV}
    >
      <QueryClientProvider>
        <NuqsAdapter>
          <NextIntlClientProvider
            messages={messages}
            locale={locale}
            timeZone={timeZone}
            now={now}
          >
            {env.NEXT_PUBLIC_MAINTENANCE !== 'true'
              ? children
              : (
                  <div>Maintenance</div>
                )}
            <Toaster />
          </NextIntlClientProvider>
        </NuqsAdapter>
      </QueryClientProvider>
    </PostHogProvider>
  );
}

export default AppProviders;
