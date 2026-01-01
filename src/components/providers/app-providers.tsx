'use client';

import type { AbstractIntlMessages } from 'next-intl';
import { NextIntlClientProvider } from 'next-intl';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import type { ReactNode } from 'react';
import { Suspense, useEffect } from 'react';

import { GlobalErrorBoundary } from '@/components/errors/global-error-boundary';
import { VersionUpdateModal } from '@/components/modals/version-update-modal';
import { Toaster } from '@/components/ui/toaster';
import type { ModelPreferencesState } from '@/stores/preferences';

import { ChatStoreProvider } from './chat-store-provider';
import { PostHogPageview } from './posthog-pageview';
import PostHogProvider from './posthog-provider';
import { PreferencesStoreProvider } from './preferences-store-provider';
import { QueryClientProvider } from './query-client-provider';

type AppProvidersProps = {
  children: ReactNode;
  locale: string;
  messages: AbstractIntlMessages;
  timeZone: string;
  now?: Date;
  env: {
    NEXT_PUBLIC_WEBAPP_ENV?: string;
    NEXT_PUBLIC_MAINTENANCE?: string;
    NEXT_PUBLIC_POSTHOG_API_KEY?: string;
    NEXT_PUBLIC_POSTHOG_HOST?: string;
  };
  initialPreferences?: ModelPreferencesState | null;
};

export function AppProviders({
  children,
  locale,
  messages,
  timeZone,
  now,
  env,
  initialPreferences,
}: AppProvidersProps) {
  useEffect(() => {
    if (env.NEXT_PUBLIC_WEBAPP_ENV === 'local' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister();
        }
      });
      if ('caches' in window) {
        caches.keys().then((names) => {
          for (const name of names) {
            caches.delete(name);
          }
        });
      }
    }
  }, [env.NEXT_PUBLIC_WEBAPP_ENV]);

  return (
    <PostHogProvider
      apiKey={env.NEXT_PUBLIC_POSTHOG_API_KEY}
      apiHost={env.NEXT_PUBLIC_POSTHOG_HOST}
      environment={env.NEXT_PUBLIC_WEBAPP_ENV}
    >
      <Suspense fallback={null}>
        <PostHogPageview />
      </Suspense>
      <QueryClientProvider>
        <PreferencesStoreProvider initialState={initialPreferences}>
          <ChatStoreProvider>
            <NuqsAdapter>
              <NextIntlClientProvider
                messages={messages}
                locale={locale}
                timeZone={timeZone}
                now={now}
              >
                <GlobalErrorBoundary>
                  {env.NEXT_PUBLIC_MAINTENANCE === 'true' ? <div>Maintenance</div> : children}
                </GlobalErrorBoundary>
                <VersionUpdateModal />
                <Toaster />
              </NextIntlClientProvider>
            </NuqsAdapter>
          </ChatStoreProvider>
        </PreferencesStoreProvider>
      </QueryClientProvider>
    </PostHogProvider>
  );
}
