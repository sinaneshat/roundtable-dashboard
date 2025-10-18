import { isServer, QueryClient } from '@tanstack/react-query';

/**
 * Shared QueryClient configuration for both server and client
 * Following TanStack Query official patterns for Next.js App Router
 * Reference: https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr
 */

/**
 * Create a new QueryClient instance with recommended defaults
 * Following official TanStack Query pattern for Next.js App Router
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // With SSR, we usually want to set some default staleTime
        // above 0 to avoid refetching immediately on the client
        staleTime: 60 * 1000, // 60 seconds - official recommended value
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

/**
 * Get or create QueryClient instance
 * Following official TanStack Query pattern for Next.js App Router
 * - Server: always make a new query client
 * - Browser: make a new query client if we don't already have one
 * This is very important, so we don't re-make a new client if React
 * suspends during the initial render
 */
export function getQueryClient() {
  if (isServer) {
    // Server: always make a new query client
    return makeQueryClient();
  } else {
    // Browser: make a new query client if we don't already have one
    // This is very important, so we don't re-make a new client if React
    // suspends during the initial render. This may not be needed if we
    // have a suspense boundary BELOW the creation of the query client
    if (!browserQueryClient)
      browserQueryClient = makeQueryClient();
    return browserQueryClient;
  }
}
