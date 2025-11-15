/**
 * Test Providers Component
 *
 * Wraps test components with necessary providers for testing:
 * - QueryClientProvider (TanStack Query)
 * - Mocked i18n (next-intl)
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';

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

// Mock i18n messages for testing
const mockMessages = {
  common: {},
};

export function TestProviders({ children }: TestProvidersProps) {
  const queryClient = createTestQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="en" messages={mockMessages}>
        {children}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}
