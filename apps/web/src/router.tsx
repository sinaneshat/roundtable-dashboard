import type { QueryClient } from '@tanstack/react-query';
import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query';

import NotFoundScreen from '@/containers/screens/general/NotFoundScreen';
import type { SessionData } from '@/lib/auth';
import { getQueryClient } from '@/lib/data/query-client';

import { routeTree } from './routeTree.gen';

export type RouterContext = {
  queryClient: QueryClient;
  /** Session from root beforeLoad - cached per request */
  session: SessionData | null;
};

export function getRouter() {
  const queryClient = getQueryClient();

  const router = createTanStackRouter({
    routeTree,
    // Initial context - session populated by root beforeLoad
    context: { queryClient, session: null },
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    defaultNotFoundComponent: NotFoundScreen,
  });

  setupRouterSsrQueryIntegration({
    router,
    queryClient,
    wrapQueryClient: true,
  });

  return router;
}

declare module '@tanstack/react-router' {
  // eslint-disable-next-line ts/consistent-type-definitions
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
