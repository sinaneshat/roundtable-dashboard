import type { QueryClient } from '@tanstack/react-query';
import { createRouter as createTanStackRouter } from '@tanstack/react-router';

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
/**
 * Default 404 component for unmatched routes
 */
function NotFoundComponent() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background">
      <h1 className="text-4xl font-bold text-foreground">404</h1>
      <p className="mt-2 text-muted-foreground">Page not found</p>
      <a href="/" className="mt-4 text-primary hover:underline">
        Go home
      </a>
    </div>
  );
}

export function getRouter() {
  const queryClient = getQueryClient();

  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    context: { queryClient },
    defaultNotFoundComponent: NotFoundComponent,
  } as unknown as Parameters<typeof createTanStackRouter>[0]);

  return router;
}

declare module '@tanstack/react-router' {
  // eslint-disable-next-line ts/consistent-type-definitions
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
