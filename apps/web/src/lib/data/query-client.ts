import {
  defaultShouldDehydrateQuery,
  isServer,
  QueryClient,
} from '@tanstack/react-query';

import { GC_TIMES } from './stale-times';

/**
 * Shared QueryClient configuration for both server and client
 * Following TanStack Query official patterns for TanStack Start SSR
 * Reference: https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr
 */

/**
 * Create a new QueryClient instance with recommended defaults
 * Following official TanStack Query pattern for SSR frameworks
 *
 * ✅ STREAMING PROTECTION: Disabled aggressive refetch behaviors
 * - refetchOnWindowFocus: false - Don't refetch when user switches tabs
 * - refetchOnReconnect: false - Don't refetch when network reconnects
 * - refetchOnMount: false - Don't refetch when component remounts
 *
 * ✅ SSR SUPPORT: Proper dehydration configuration
 * - shouldDehydrateQuery: Include pending queries for streaming
 * - shouldRedactErrors: Don't redact errors (framework handles)
 *
 * Individual queries can override these defaults as needed
 */
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      // ✅ SSG/SSR: Configure dehydration for proper serialization
      dehydrate: {
        // Include pending queries in dehydration for streaming support
        shouldDehydrateQuery: query =>
          defaultShouldDehydrateQuery(query)
          || query.state.status === 'pending',
        // Don't redact errors - let TanStack Start handle error serialization
        // This prevents hydration mismatches with error states
        shouldRedactErrors: () => false,
      },
      queries: {
        // ✅ CACHE RETENTION: Keep inactive queries in cache for 10 minutes
        // Default is 5 minutes - extending for faster sidebar navigation
        gcTime: GC_TIMES.LONG, // 10 minutes - prevents garbage collection on nav

        refetchOnMount: false,

        refetchOnReconnect: false,
        // ✅ STREAMING PROTECTION: Disable aggressive refetch behaviors globally
        // These can be overridden per-query if needed
        refetchOnWindowFocus: false,
        // With SSR, we usually want to set some default staleTime
        // above 0 to avoid refetching immediately on the client
        staleTime: GC_TIMES.SHORT, // 60 seconds - official recommended value
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

/**
 * Get or create QueryClient instance
 * Following official TanStack Query pattern for SSR frameworks
 * - Server: always make a new query client
 * - Browser: make a new query client if we don't already have one
 * This is very important, so we don't re-make a new client if React
 * suspends during the initial render
 */
export function getQueryClient() {
  if (isServer) {
    return makeQueryClient();
  }
  // Browser: make a new query client if we don't already have one
  // This is very important, so we don't re-make a new client if React
  // suspends during the initial render. This may not be needed if we
  // have a suspense boundary BELOW the creation of the query client
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}
