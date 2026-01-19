import type { QueryClient } from '@tanstack/react-query';
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
 * Create router with QueryClient context
 * TanStack Start requires getRouter to return a new instance each time
 *
 * Type assertion rationale:
 * - TanStack Router's RouterOptions<TRouteTree, ...> has strict generic constraints
 * - strictNullChecks disabled in tsconfig causes type incompatibility with router context
 * - Structural type compatibility: All required fields present and correctly typed at runtime
 * - RouterContext properly defined and matches TanStack Router's context expectations
 * - Alternative: Enable strictNullChecks (requires codebase-wide null handling updates)
 */
export function getRouter() {
  const queryClient = getQueryClient();

  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    context: { queryClient },
    defaultNotFoundComponent: NotFoundScreen,
  } as Parameters<typeof createTanStackRouter>[0]);

  return router;
}

declare module '@tanstack/react-router' {
  // eslint-disable-next-line ts/consistent-type-definitions
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
