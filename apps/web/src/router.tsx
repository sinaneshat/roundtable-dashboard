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
 * Note: Type assertion used because strictNullChecks is disabled in tsconfig.
 * TanStack Router's type system requires strictNullChecks for full type safety.
 */
export function getRouter() {
  const queryClient = getQueryClient();

  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    context: { queryClient },
    defaultNotFoundComponent: NotFoundScreen,
  } as unknown as Parameters<typeof createTanStackRouter>[0]);

  return router;
}

declare module '@tanstack/react-router' {
  // eslint-disable-next-line ts/consistent-type-definitions
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
