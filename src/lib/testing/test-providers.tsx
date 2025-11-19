/**
 * Test Providers Component
 *
 * Wraps test components with necessary providers for testing:
 * - QueryClientProvider (TanStack Query)
 * - Mocked i18n (next-intl)
 * - TooltipProvider (Radix UI)
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';

import { ThreadHeaderProvider } from '@/components/chat/thread-header-context';
import { ChatStoreProvider } from '@/components/providers/chat-store-provider';
import { TooltipProvider } from '@/components/ui/tooltip';

// ✅ Official next-intl testing pattern: Centralized test messages
// Reference: https://next-intl-docs.vercel.app/docs/environments/testing
import { testLocale, testMessages, testTimeZone } from './test-messages';

type TestProvidersProps = {
  children: ReactNode;
};

// Create a new QueryClient instance for each test to ensure isolation
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
      <NextIntlClientProvider
        locale={testLocale}
        messages={testMessages}
        timeZone={testTimeZone}
      >
        <ChatStoreProvider>
          <ThreadHeaderProvider>
            <TooltipProvider>
              {children}
            </TooltipProvider>
          </ThreadHeaderProvider>
        </ChatStoreProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}
