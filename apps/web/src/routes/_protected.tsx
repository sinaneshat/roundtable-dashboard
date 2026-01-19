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
import { STALE_TIMES } from '@/lib/data/stale-times';
import { getSession } from '@/server/auth';

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

// ✅ OPTIMIZATION: Cache session on client to avoid server roundtrips during navigation
// The session is validated on initial page load; subsequent navigations reuse cached session
// Cookie validity is still enforced by the browser/Better Auth
let cachedClientSession: Awaited<ReturnType<typeof getSession>> = null;

/** Clear the cached session (call on sign out) */
export function clearCachedSession() {
  cachedClientSession = null;
}

export const Route = createFileRoute('/_protected')({
  // ✅ PERF: staleTime prevents loader re-execution on client navigations
  // Use the shortest stale time among our queries to ensure all data is fresh
  staleTime: STALE_TIMES.threadsSidebar, // 30s - shortest of our prefetched data
  // Server-side auth check - TanStack Start pattern
  // beforeLoad runs on both server (SSR) and client (navigation)
  beforeLoad: async ({ location }) => {
    // ✅ Client-side optimization: reuse cached session to avoid server function call
    // This prevents redundant getSession() server calls on every client navigation
    // Session validity is still ensured by cookie expiry and Better Auth
    if (typeof window !== 'undefined' && cachedClientSession) {
      return { session: cachedClientSession };
    }

    const session = await getSession();

    if (!session) {
      // Clear cache on logout/session expiry
      cachedClientSession = null;
      throw redirect({
        to: '/auth/sign-in',
        search: { redirect: location.href },
      });
    }

    // Cache on client for subsequent navigations
    if (typeof window !== 'undefined') {
      cachedClientSession = session;
    }

    // Pass session through context for child routes
    return { session };
  },
  loader: async ({ context }) => {
    const { queryClient } = context;

    // ✅ PERF: Check if we have fresh cached data before fetching
    // On client navigation, skip fetch if data is within staleTime
    const isClient = typeof window !== 'undefined';
    const modelsState = queryClient.getQueryState(modelsQueryOptions.queryKey);
    const subsState = queryClient.getQueryState(subscriptionsQueryOptions.queryKey);
    const usageState = queryClient.getQueryState(usageQueryOptions.queryKey);
    const sidebarState = queryClient.getQueryState(sidebarThreadsQueryOptions.queryKey);

    // Check if all data is fresh (within their stale times)
    const now = Date.now();
    const modelsFresh = modelsState?.dataUpdatedAt && (modelsState.dataUpdatedAt > now - STALE_TIMES.models || STALE_TIMES.models === Infinity);
    const subsFresh = subsState?.dataUpdatedAt && subsState.dataUpdatedAt > now - STALE_TIMES.subscriptions;
    const usageFresh = usageState?.dataUpdatedAt && usageState.dataUpdatedAt > now - 30_000; // usageQueryOptions uses 30s
    const sidebarFresh = sidebarState?.dataUpdatedAt && sidebarState.dataUpdatedAt > now - STALE_TIMES.threadsSidebar;

    // If on client and all data is fresh, skip the fetch entirely
    if (isClient && modelsFresh && subsFresh && usageFresh && sidebarFresh) {
      return {};
    }

    // ensureQueryData ensures data is available before rendering
    // Using shared queryOptions guarantees same config in loader and hooks
    // This prevents the "content flash" where SSR content disappears into loading state
    //
    // Pattern from TanStack Start docs:
    // - ensureQueryData returns cached data if available, otherwise fetches
    // - Same queryOptions in hooks means useQuery uses cached data immediately
    // - No stale check on hydration = no refetch = no flash
    //
    // ✅ PERF: Only fetch queries that are stale/missing
    const promises: Promise<unknown>[] = [];
    if (!modelsFresh)
      promises.push(queryClient.ensureQueryData(modelsQueryOptions));
    if (!subsFresh)
      promises.push(queryClient.ensureQueryData(subscriptionsQueryOptions));
    if (!usageFresh)
      promises.push(queryClient.ensureQueryData(usageQueryOptions));
    if (!sidebarFresh)
      promises.push(queryClient.ensureInfiniteQueryData(sidebarThreadsQueryOptions));

    if (promises.length > 0) {
      await Promise.all(promises);
    }

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
