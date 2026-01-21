import { NuqsAdapter } from 'nuqs/adapters/tanstack-router';
import type { ReactNode } from 'react';

import { GlobalErrorBoundary } from '@/components/errors/global-error-boundary';
import { Toaster } from '@/components/ui/toaster';
import type { AbstractIntlMessages } from '@/lib/i18n';
import { I18nProvider, useTranslations } from '@/lib/i18n';
import dynamic from '@/lib/utils/dynamic';
import type { ModelPreferencesState } from '@/stores/preferences';

import PostHogProvider from './posthog-provider';
import { PreferencesStoreProvider } from './preferences-store-provider';
import { ServiceWorkerProvider } from './service-worker-provider';

// Lazy-loaded - only shown when app version changes
const VersionUpdateModal = dynamic(
  () => import('@/components/modals/version-update-modal').then(m => ({ default: m.VersionUpdateModal })),
  { ssr: false },
);

function MaintenanceMessage() {
  const t = useTranslations();
  return <div>{t('common.maintenance')}</div>;
}

type AppProvidersProps = {
  children: ReactNode;
  locale: string;
  messages: AbstractIntlMessages;
  timeZone: string;
  now?: Date;
  env: {
    VITE_WEBAPP_ENV?: string;
    VITE_MAINTENANCE?: string;
    VITE_POSTHOG_API_KEY?: string;
  };
  initialPreferences?: ModelPreferencesState | null;
};

/**
 * App-level providers for TanStack Start
 * Note: QueryClientProvider is in __root.tsx via router context
 * NuqsAdapter uses tanstack-router adapter for URL state sync
 */
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
    <ServiceWorkerProvider>
      <PostHogProvider
        apiKey={env.VITE_POSTHOG_API_KEY}
        environment={env.VITE_WEBAPP_ENV}
      >
        <PreferencesStoreProvider initialState={initialPreferences}>
          <NuqsAdapter>
            <I18nProvider
              messages={messages}
              locale={locale}
              timeZone={timeZone}
              now={now}
            >
              <GlobalErrorBoundary>
                {env.VITE_MAINTENANCE === 'true' ? <MaintenanceMessage /> : children}
              </GlobalErrorBoundary>
              <VersionUpdateModal />
              <Toaster />
            </I18nProvider>
          </NuqsAdapter>
        </PreferencesStoreProvider>
      </PostHogProvider>
    </ServiceWorkerProvider>
  );
}
