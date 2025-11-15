'use client';

import type { AbstractIntlMessages } from 'next-intl';
import { NextIntlClientProvider } from 'next-intl';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { Suspense } from 'react';

import { VersionUpdateModal } from '@/components/changelog-modal';
import { Toaster } from '@/components/ui/toaster';

import { ChatStoreProvider } from './chat-store-provider';
import { PostHogPageview } from './posthog-pageview';
import PostHogProvider from './posthog-provider';
import QueryClientProvider from './query-client-provider';

type AppProvidersProps = {
  children: React.ReactNode;
  locale: string;
  messages: AbstractIntlMessages;
  timeZone: string;
  now?: Date; // ✅ Optional to prevent hydration mismatch
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
      {/* PostHog pageview tracking for Next.js App Router */}
      {/* Wrapped in Suspense to prevent blocking static generation (Next.js 15 requirement) */}
      <Suspense fallback={null}>
        <PostHogPageview />
      </Suspense>
      <QueryClientProvider>
        {/* ✅ ZUSTAND PATTERN: Chat store provider wraps entire app */}
        <ChatStoreProvider>
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
              <VersionUpdateModal />
              <Toaster />
            </NextIntlClientProvider>
          </NuqsAdapter>
        </ChatStoreProvider>
      </QueryClientProvider>
    </PostHogProvider>
  );
}

export default AppProviders;
