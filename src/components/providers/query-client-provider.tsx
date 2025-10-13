'use client';

import { QueryClientProvider as QueryClientProviderWrapper } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { getQueryClient } from '@/lib/data/query-client';

/**
 * Client-side QueryClient provider
 * Creates a stable QueryClient instance for the entire app
 *
 * Note: This is ONLY for API data fetching with TanStack Query
 * Better Auth has its own client and doesn't use TanStack Query
 */
function QueryClientProvider({ children }: { children: ReactNode }) {
  // Use useState to ensure we only create the client once on the client side
  const [queryClient] = useState(() => getQueryClient());

  return (
    <QueryClientProviderWrapper client={queryClient}>
      {children}
    </QueryClientProviderWrapper>
  );
}

export default QueryClientProvider;
