import type { QueryClient } from '@tanstack/react-query';
import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query';
import { lazy } from 'react';

import type { SessionData } from '@/lib/auth';
import { makeQueryClient } from '@/lib/data/query-client';

import { routeTree } from './routeTree.gen';

const NotFoundScreen = lazy(() => import('@/containers/screens/general/NotFoundScreen'));

export type RouterContext = {
  queryClient: QueryClient;
  /** Session from root beforeLoad - cached per request */
  session: SessionData | null;
};

/**
 * Router factory following official TanStack Start + React Query SSR pattern
 * @see https://tanstack.com/router/latest/docs/integrations/query
 * @see https://tanstack.com/start/latest/docs/framework/react/examples/start-basic-react-query
 *
 * Creates fresh QueryClient per router instance (SSR-safe)
 * setupRouterSsrQueryIntegration automatically:
 * - Wraps router with QueryClientProvider
 * - Handles SSR dehydration/hydration
 * - Streams queries that resolve during server render
 * - Handles redirect() from queries/mutations
 */
export function getRouter() {
  const queryClient = makeQueryClient();

  const router = createTanStackRouter({
    routeTree,
    context: { queryClient, session: null },
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    defaultNotFoundComponent: NotFoundScreen,
    // Note: defaultSsr: false is configured in start.ts via createStart()
  });

  setupRouterSsrQueryIntegration({
    router,
    queryClient,
  });

  return router;
}

declare module '@tanstack/react-router' {
  // eslint-disable-next-line ts/consistent-type-definitions
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
