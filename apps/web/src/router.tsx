import type { QueryClient } from '@tanstack/react-query';
import { dehydrate, hydrate, QueryClientProvider } from '@tanstack/react-query';
import { createRouter as createTanStackRouter } from '@tanstack/react-router';

import NotFoundScreen from '@/containers/screens/general/NotFoundScreen';
import { getQueryClient } from '@/lib/data/query-client';

import { routeTree } from './routeTree.gen';

/**
 * Router context type for TanStack Start
 * QueryClient is passed via context for use in route loaders
 */
export type RouterContext = {
  queryClient: QueryClient;
};

/**
 * Create router with QueryClient context and React Query SSR integration
 * TanStack Start requires getRouter to return a new instance each time
 *
 * ✅ SSR FIX: Added dehydrate/hydrate for proper React Query SSR support
 * - dehydrate: Serializes QueryClient state on server for client transfer
 * - hydrate: Rehydrates QueryClient state on client from server data
 * - Wrap: Provides QueryClientProvider at router level for proper context
 *
 * Type assertion rationale:
 * - TanStack Router's RouterOptions<TRouteTree, ...> has strict generic constraints
 * - strictNullChecks disabled in tsconfig causes type incompatibility with router context
 * - Structural type compatibility: All required fields present and correctly typed at runtime
 * - RouterContext properly defined and matches TanStack Router's context expectations
 */
export function getRouter() {
  const queryClient = getQueryClient();

  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    // ✅ CRITICAL: When using TanStack Query as external cache, set to 0
    // This ensures Router's internal cache doesn't conflict with Query's cache
    // All preloads are marked stale, allowing Query to manage data freshness
    // @see https://tanstack.com/router/latest/docs/framework/react/guide/preloading#preloading-with-external-libraries
    defaultPreloadStaleTime: 0,
    context: { queryClient },
    defaultNotFoundComponent: NotFoundScreen,
    // ✅ SSR: Dehydrate QueryClient state on server for transfer to client
    // This serializes all prefetched query data into the HTML payload
    dehydrate: () => ({
      queryClientState: dehydrate(queryClient),
    }),
    // ✅ SSR: Hydrate QueryClient state on client from server data
    // This populates the client query cache with server-fetched data
    hydrate: (dehydratedState) => {
      hydrate(queryClient, dehydratedState.queryClientState);
    },
    // ✅ SSR: Wrap router with QueryClientProvider at the router level
    // This ensures consistent QueryClient instance across server and client
    Wrap: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    ),
  } as Parameters<typeof createTanStackRouter>[0]);

  return router;
}

declare module '@tanstack/react-router' {
  // eslint-disable-next-line ts/consistent-type-definitions
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
