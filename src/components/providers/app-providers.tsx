'use client';

import { NextIntlClientProvider } from 'next-intl';
import { NuqsAdapter } from 'nuqs/adapters/next/app';

import { Toaster } from '@/components/ui/toaster';

import PostHogProvider from './posthog-provider';
import QueryClientProvider from './query-client-provider';

type AppProvidersProps = {
  children: React.ReactNode;
  locale: string;
  translations: Record<string, unknown>;
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
 * Following the established pattern from /docs/frontend-patterns.md:
 * - Single provider component wraps all global providers
 * - QueryClient configuration with sensible defaults
 * - Development tools conditionally included
 *
 * Pattern: src/components/providers/app-providers.tsx
 */
export function AppProviders({
  children,
  locale,
  translations,
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
            messages={translations}
            locale={locale}
            timeZone="UTC"
          >
            {env.NEXT_PUBLIC_MAINTENANCE !== 'true'
              ? children
              : (
                  <div>Maintenance</div>
                )}
          </NextIntlClientProvider>
        </NuqsAdapter>
        <Toaster />
      </QueryClientProvider>
    </PostHogProvider>
  );
}

export default AppProviders;
