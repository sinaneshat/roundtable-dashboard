'use client';

import dynamic from 'next/dynamic';
import type { AbstractIntlMessages } from 'next-intl';
import { NextIntlClientProvider, useTranslations } from 'next-intl';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import type { ReactNode } from 'react';

import { GlobalErrorBoundary } from '@/components/errors/global-error-boundary';
import { Toaster } from '@/components/ui/toaster';
import type { ModelPreferencesState } from '@/stores/preferences';

import { ChatStoreProvider } from './chat-store-provider';
import PostHogProvider from './posthog-provider';
import { PreferencesStoreProvider } from './preferences-store-provider';
import { QueryClientProvider } from './query-client-provider';

// Lazy-loaded - only shown when app version changes
const VersionUpdateModal = dynamic(
  () => import('@/components/modals/version-update-modal').then(m => m.VersionUpdateModal),
  { ssr: false },
);

function MaintenanceMessage() {
  const t = useTranslations('common');
  return <div>{t('maintenance')}</div>;
}

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
  return (
    <PostHogProvider
      apiKey={env.NEXT_PUBLIC_POSTHOG_API_KEY}
      apiHost={env.NEXT_PUBLIC_POSTHOG_HOST}
      environment={env.NEXT_PUBLIC_WEBAPP_ENV}
    >
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
                  {env.NEXT_PUBLIC_MAINTENANCE === 'true' ? <MaintenanceMessage /> : children}
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
