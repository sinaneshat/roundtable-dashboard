import {
  defaultShouldDehydrateQuery,
  isServer,
  QueryClient,
} from '@tanstack/react-query';

/**
 * Shared QueryClient configuration for both server and client
 * Following TanStack Query official patterns for Next.js App Router
 * Reference: https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr
 */

/**
 * Create a new QueryClient instance with recommended defaults
 * Following official TanStack Query pattern for Next.js App Router
 *
 * ✅ STREAMING PROTECTION: Disabled aggressive refetch behaviors
 * - refetchOnWindowFocus: false - Don't refetch when user switches tabs
 * - refetchOnReconnect: false - Don't refetch when network reconnects
 * - refetchOnMount: false - Don't refetch when component remounts
 *
 * ✅ SSG/SSR SUPPORT: Proper dehydration configuration
 * - shouldDehydrateQuery: Include pending queries for streaming
 * - shouldRedactErrors: Don't redact errors (let Next.js handle)
 *
 * Individual queries can override these defaults as needed
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // With SSR, we usually want to set some default staleTime
        // above 0 to avoid refetching immediately on the client
        staleTime: 60 * 1000, // 60 seconds - official recommended value

        // ✅ STREAMING PROTECTION: Disable aggressive refetch behaviors globally
        // These can be overridden per-query if needed
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false,
      },
      // ✅ SSG/SSR: Configure dehydration for proper serialization
      dehydrate: {
        // Include pending queries in dehydration for streaming support
        shouldDehydrateQuery: query =>
          defaultShouldDehydrateQuery(query)
          || query.state.status === 'pending',
        // Don't redact errors - let Next.js handle error serialization
        // This prevents hydration mismatches with error states
        shouldRedactErrors: () => false,
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
    return makeQueryClient();
  }
  // Browser: make a new query client if we don't already have one
  // This is very important, so we don't re-make a new client if React
  // suspends during the initial render. This may not be needed if we
  // have a suspense boundary BELOW the creation of the query client
  if (!browserQueryClient)
    browserQueryClient = makeQueryClient();
  return browserQueryClient;
}
