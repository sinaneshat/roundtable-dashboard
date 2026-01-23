import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

import { ChatLayoutShell } from '@/components/layouts/chat-layout-shell';
import { ChatLayoutProviders } from '@/components/providers/chat-layout-providers';
import { PreferencesStoreProvider } from '@/components/providers/preferences-store-provider';
import { useSessionQuerySync } from '@/hooks/utils';
import { useSession } from '@/lib/auth/client';
import {
  modelsQueryOptions,
  sidebarProjectsQueryOptions,
  sidebarThreadsQueryOptions,
  subscriptionsQueryOptions,
  usageQueryOptions,
} from '@/lib/data/query-options';

export const Route = createFileRoute('/_protected')({
  // ✅ LAYOUT ROUTE CACHING: Prevent loader re-runs on child route navigations
  // Layout data (models, subscriptions, usage, threads) is cached by TanStack Query
  // Route staleTime prevents the loader from executing unnecessarily
  // This stops the pendingComponent from flashing on every /chat/* navigation
  staleTime: 5 * 60 * 1000, // 5 minutes - layout data rarely needs refresh

  // ✅ AUTH CHECK: Uses session from root context (SSR or client)
  // Root beforeLoad fetches session on server via cookies
  // Redirects to sign-in if not authenticated (works on both server and client)
  beforeLoad: async ({ location, context }) => {
    const { session } = context;

    if (!session) {
      throw redirect({
        to: '/auth/sign-in',
        search: { redirect: location.href },
      });
    }

    return { session };
  },
  loader: async ({ context }) => {
    const { queryClient, session } = context;

    // Skip data fetch if no session (unauthenticated)
    if (!session) {
      return {};
    }

    // Prefetch layout data - works on both server and client
    // Server functions automatically forward cookies via cookieMiddleware
    try {
      await Promise.all([
        queryClient.ensureQueryData(modelsQueryOptions),
        queryClient.ensureQueryData(subscriptionsQueryOptions),
        queryClient.ensureQueryData(usageQueryOptions),
        queryClient.ensureInfiniteQueryData(sidebarThreadsQueryOptions),
        queryClient.ensureInfiniteQueryData(sidebarProjectsQueryOptions),
      ]);
    } catch (error) {
      console.error('[PROTECTED] Loader prefetch error:', error);
      // Continue with empty data - components will handle loading states
    }

    return {};
  },
  component: ProtectedLayout,
  // NO pendingComponent - layout shell (sidebar, header) should remain stable
  // Each child route has its own pendingComponent for content-specific loading states
  // This prevents layout-level skeleton from overriding page-specific skeletons
});

/**
 * Protected Layout - Session from SSR or client
 *
 * SSR: Session fetched on server via cookies, layout renders with real data
 * Client: useSession hook provides reactive updates (sign-out, etc.)
 * Single render path eliminates hydration mismatches
 *
 * Note: PreferencesStoreProvider must be synchronous - components depend on it during SSR
 */
function ProtectedLayout() {
  // Route context has session from beforeLoad (server or client)
  const routeContext = Route.useRouteContext();

  // Client session hook for reactive updates (sign-out, etc.)
  // Falls back to route context for SSR hydration
  const { data: clientSession } = useSession();
  const activeSession = clientSession ?? routeContext.session;

  // Auto-invalidate query cache when userId changes (logout->login, impersonation, etc.)
  useSessionQuerySync();

  // Single render path - always render layout shell
  // If no session on server, shell renders with null (minimal UI)
  // Client will redirect to login if truly unauthenticated
  return (
    <PreferencesStoreProvider>
      <ChatLayoutProviders>
        <ChatLayoutShell session={activeSession}>
          <Outlet />
        </ChatLayoutShell>
      </ChatLayoutProviders>
    </PreferencesStoreProvider>
  );
}
