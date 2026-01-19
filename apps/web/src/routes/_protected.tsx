import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

import { ChatLayoutShell } from '@/components/layouts/chat-layout-shell';
import { SidebarLoadingFallback } from '@/components/loading';
import { ChatLayoutProviders, PreferencesStoreProvider } from '@/components/providers';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { QuickStartSkeleton, Skeleton, StickyInputSkeleton } from '@/components/ui/skeleton';
import { useSession } from '@/lib/auth/client';
import {
  modelsQueryOptions,
  sidebarThreadsQueryOptions,
  subscriptionsQueryOptions,
  usageQueryOptions,
} from '@/lib/data/query-options';
import { getSession } from '@/server/auth';

/**
 * Protected Layout Skeleton
 * Shown while beforeLoad auth check and loader prefetching runs
 * Matches the actual ChatLayoutShell structure for smooth transition
 */
function ProtectedLayoutSkeleton() {
  return (
    <SidebarProvider>
      <SidebarLoadingFallback count={10} />
      <SidebarInset className="flex flex-col relative">
        {/* Header skeleton */}
        <header className="sticky top-0 left-0 right-0 z-50 flex h-14 sm:h-16 shrink-0 items-center gap-2">
          <div className="flex items-center gap-2 pt-4 px-5 md:px-6 lg:px-8 h-14 sm:h-16 w-full">
            <Skeleton className="size-8 rounded-lg" />
            <Skeleton className="h-5 w-28" />
          </div>
        </header>

        {/* Main content skeleton - matches ChatOverviewScreen layout */}
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <div className="w-full max-w-2xl space-y-8">
            {/* Logo/Welcome area */}
            <div className="text-center space-y-4">
              <div className="size-16 rounded-2xl bg-accent animate-pulse mx-auto" />
              <div className="h-8 w-64 rounded-xl bg-accent animate-pulse mx-auto" />
              <div className="h-5 w-96 max-w-full rounded-lg bg-accent/70 animate-pulse mx-auto" />
            </div>

            {/* Quick start suggestions skeleton */}
            <div className="rounded-2xl bg-card/50 overflow-hidden">
              <QuickStartSkeleton count={4} />
            </div>

            {/* Input area skeleton */}
            <StickyInputSkeleton />
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

    // ensureQueryData ensures data is available before rendering
    // Using shared queryOptions guarantees same config in loader and hooks
    // This prevents the "content flash" where SSR content disappears into loading state
    //
    // Pattern from TanStack Start docs:
    // - ensureQueryData returns cached data if available, otherwise fetches
    // - Same queryOptions in hooks means useQuery uses cached data immediately
    // - No stale check on hydration = no refetch = no flash
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
