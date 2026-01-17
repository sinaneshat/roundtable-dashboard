/**
 * Test Providers Component
 *
 * Wraps test components with necessary providers:
 * - QueryClientProvider (TanStack Query)
 * - NextIntlClientProvider (i18n)
 * - ChatStoreProvider (Zustand store)
 * - ThreadHeaderProvider (Thread context)
 * - TooltipProvider (Radix UI)
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { ThreadHeaderProvider } from '@/components/chat/thread-header-context';
import { ChatStoreProvider } from '@/components/providers';
import { TooltipProvider } from '@/components/ui/tooltip';
import testMessages from '@/i18n/locales/en/common.json';
import { NextIntlClientProvider } from '@/lib/compat';

import { testLocale, testTimeZone } from './test-messages';

type TestProvidersProps = {
  children: ReactNode;
};

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
  const queryClient = createTestQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale={testLocale} messages={testMessages} timeZone={testTimeZone}>
        <ChatStoreProvider>
          <ThreadHeaderProvider>
            <TooltipProvider>{children}</TooltipProvider>
          </ThreadHeaderProvider>
        </ChatStoreProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}
