import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

import { ChatLayoutShell } from '@/components/layouts/chat-layout-shell';
import { ChatLayoutProviders } from '@/components/providers/chat-layout-providers';
import { PreferencesStoreProvider } from '@/components/providers/preferences-store-provider';
import { useSession } from '@/lib/auth/client';
import {
  modelsQueryOptions,
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

  // ✅ AUTH CHECK: Uses session from root context (already cached)
  // No duplicate getSession() call - root beforeLoad handles session fetching
  // Redirects to sign-in if not authenticated (client-side redirect)
  beforeLoad: async ({ location, context }) => {
    // Server-side: skip auth check, let client handle it after hydration
    if (typeof window === 'undefined') {
      return { session: null };
    }

    // Client-side: session from root beforeLoad
    const { session } = context;

    if (!session) {
      throw redirect({
        to: '/auth/sign-in',
        search: { redirect: location.href },
      });
    }

    // Pass session through for child routes
    return { session };
  },
  loader: async ({ context }) => {
    // Server-side: skip data fetching, let client handle after hydration
    if (typeof window === 'undefined') {
      return {};
    }

    const { queryClient } = context;

    // ensureQueryData ensures data is available before rendering
    // It internally checks staleTime and only fetches if data is stale/missing
    // Using shared queryOptions guarantees same config in loader and hooks
    // This prevents "content flash" where SSR content disappears into loading state
    //
    // Pattern from TanStack docs:
    // - ensureQueryData returns cached data if fresh, otherwise fetches
    // - Same queryOptions in hooks means useQuery uses cached data immediately
    // @see https://tanstack.com/router/latest/docs/framework/react/guide/external-data-loading
    await Promise.all([
      queryClient.ensureQueryData(modelsQueryOptions),
      queryClient.ensureQueryData(subscriptionsQueryOptions),
      queryClient.ensureQueryData(usageQueryOptions),
      queryClient.ensureInfiniteQueryData(sidebarThreadsQueryOptions),
    ]);

    return {};
  },
  component: ProtectedLayout,
  // NO pendingComponent - layout shell (sidebar, header) should remain stable
  // Each child route has its own pendingComponent for content-specific loading states
  // This prevents layout-level skeleton from overriding page-specific skeletons
});

/**
 * Protected Layout - Session verified in beforeLoad
 *
 * Auth is now checked client-side in beforeLoad after hydration.
 * If no session, user is redirected to sign-in before this component renders.
 * useSession is still used for accessing session data reactively in child components.
 */
function ProtectedLayout() {
  // Session is guaranteed by beforeLoad, use client hook for reactive access
  const { data: session } = useSession();

  // beforeLoad guarantees we have a session, but on client navigation
  // the hook may briefly return null while syncing. Use route context as fallback.
  const routeContext = Route.useRouteContext();
  const activeSession = session ?? routeContext.session;

  // SSR: Server renders with session: null for fast TTFB
  // Client: beforeLoad handles redirect to /auth/sign-in if no session
  // This brief null state during hydration shows the child route's content
  // (skeleton or actual content) while client-side auth resolves
  if (!activeSession) {
    // Render Outlet anyway - child routes have their own pendingComponent/skeleton
    // The client-side beforeLoad will redirect to login if truly unauthenticated
    // This prevents black screen while maintaining SSR content visibility
    return (
      <PreferencesStoreProvider>
        <ChatLayoutProviders>
          <ChatLayoutShell session={null}>
            <Outlet />
          </ChatLayoutShell>
        </ChatLayoutProviders>
      </PreferencesStoreProvider>
    );
  }

  // Wrap with providers so sidebar has access to stores
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
