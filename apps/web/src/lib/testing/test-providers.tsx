/**
 * Test Providers Component
 *
 * Wraps test components with necessary providers:
 * - QueryClientProvider (TanStack Query)
 * - I18nProvider (i18n)
 * - TooltipProvider (Radix UI)
 * - ChatStoreProvider (optional - requires router, excluded by default)
 * - ThreadHeaderProvider (optional - excluded by default)
 *
 * Note: ChatStoreProvider and RouterProvider require TanStack Router context.
 * Most component tests don't need these providers.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useMemo } from 'react';

import { TooltipProvider } from '@/components/ui/tooltip';
import testMessages from '@/i18n/locales/en/common.json';
import { I18nProvider } from '@/lib/i18n';

import { testLocale, testTimeZone } from './test-messages';

type TestProvidersProps = {
  children: ReactNode;
};

// Create query client for tests with retry disabled
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export function TestProviders({ children }: TestProvidersProps) {
  const queryClient = useMemo(() => createTestQueryClient(), []);

  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider locale={testLocale} messages={testMessages} timeZone={testTimeZone}>
        <TooltipProvider>
          {children}
        </TooltipProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}
