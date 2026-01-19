import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

import { ChatLayoutShell } from '@/components/layouts/chat-layout-shell';
import { SidebarLoadingFallback } from '@/components/loading';
import { ChatLayoutProviders, PreferencesStoreProvider } from '@/components/providers';
import { HeaderSkeleton, LogoAreaSkeleton, QuickStartSkeleton, StickyInputSkeleton } from '@/components/skeletons';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
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
        {/* Header skeleton - uses shared HeaderSkeleton */}
        <HeaderSkeleton variant="simple" />

        {/* Main content skeleton - matches ChatOverviewScreen layout */}
        <div className="flex-1 relative">
          <div className="container max-w-4xl mx-auto px-5 md:px-6 relative flex flex-col items-center pt-6 sm:pt-8 pb-4">
            <div className="w-full">
              <div className="flex flex-col items-center gap-4 sm:gap-6 text-center relative">
                {/* Logo area - uses shared LogoAreaSkeleton */}
                <LogoAreaSkeleton size="large" showTitle showTagline />

                {/* Quick start suggestions skeleton */}
                <div className="w-full mt-6 sm:mt-8">
                  <div className="rounded-2xl bg-card/50 overflow-hidden border border-border/30">
                    <QuickStartSkeleton count={4} />
                  </div>
                </div>

                {/* Input area skeleton */}
                <div className="w-full mt-14">
                  <StickyInputSkeleton className="relative" />
                </div>
              </div>
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
