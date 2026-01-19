import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

import { ChatLayoutShell } from '@/components/layouts/chat-layout-shell';
import { SidebarLoadingFallback } from '@/components/loading';
import { ChatLayoutProviders, PreferencesStoreProvider } from '@/components/providers';
import { HeaderSkeleton, LogoAreaSkeleton } from '@/components/skeletons';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/lib/auth/client';
import {
  modelsQueryOptions,
  sidebarThreadsQueryOptions,
  subscriptionsQueryOptions,
  usageQueryOptions,
} from '@/lib/data/query-options';

/**
 * Protected Layout Skeleton
 * Shown while beforeLoad auth check and loader prefetching runs
 *
 * This is a GENERIC skeleton that works for any child route.
 * Shows sidebar + header + centered loading indicator.
 * Each child route's pendingComponent shows route-specific skeletons.
 */
function ProtectedLayoutSkeleton() {
  return (
    <SidebarProvider>
      <SidebarLoadingFallback count={10} />
      <SidebarInset className="flex flex-col relative">
        {/* Header skeleton */}
        <HeaderSkeleton variant="simple" />

        {/* Generic centered loading content - works for any child route */}
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-6 text-center px-4">
            {/* Logo area - uses shared LogoAreaSkeleton */}
            <LogoAreaSkeleton size="large" showTitle showTagline />

            {/* Simple loading indicator */}
            <div className="w-full max-w-md space-y-4">
              <Skeleton className="h-4 w-3/4 mx-auto" />
              <Skeleton className="h-4 w-1/2 mx-auto" />
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export const Route = createFileRoute('/_protected')({
  // ✅ LAYOUT ROUTE CACHING: Prevent loader re-runs on child route navigations
  // Layout data (models, subscriptions, usage, threads) is cached by TanStack Query
  // Route staleTime prevents the loader from executing unnecessarily
  // This stops the pendingComponent from flashing on every /chat/* navigation
  staleTime: 5 * 60 * 1000, // 5 minutes - layout data rarely needs refresh

  // ✅ AUTH CHECK: Uses session from root context (already cached)
  // No duplicate getSession() call - root beforeLoad handles session fetching
  // Redirects to sign-in if not authenticated (server-side redirect)
  beforeLoad: async ({ location, context }) => {
    // Session already fetched and cached by root beforeLoad
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
  pendingComponent: ProtectedLayoutSkeleton,
});

/**
 * Protected Layout - Session verified in beforeLoad
 *
 * Auth is now checked server-side in beforeLoad using the getSession server function.
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

  if (!activeSession) {
    // This shouldn't happen with beforeLoad guard, but handle gracefully
    return null;
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
