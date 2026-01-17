import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { ChatLayoutShell } from '@/components/layouts/chat-layout-shell';
import { SidebarLoadingFallback } from '@/components/loading';
import { ChatLayoutProviders, PreferencesStoreProvider } from '@/components/providers';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/lib/auth/client';
import { getModels } from '@/server/models';
import { getSidebarThreads } from '@/server/sidebar-threads';
import { getSubscriptions } from '@/server/subscriptions';

// Timeout for session check - if it hangs, assume auth failed
const SESSION_CHECK_TIMEOUT_MS = 5000;

export const Route = createFileRoute('/_protected')({
  loader: async () => {
    const [models, subscriptions, sidebarThreads] = await Promise.all([
      getModels(),
      getSubscriptions(),
      getSidebarThreads(),
    ]);
    return { models, subscriptions, sidebarThreads };
  },
  component: ProtectedLayout,
});

/**
 * Protected Layout with Client-Side Auth Check
 *
 * ARCHITECTURE NOTE: We use client-side auth checking instead of SSR because:
 * - API runs on port 8787, web app on 5173 (cross-origin in dev)
 * - In local dev, Vite proxy makes it same-origin for cookies
 * - Client-side requests include cookies via `credentials: 'include'`
 */
function ProtectedLayout() {
  const navigate = useNavigate();
  const loaderData = Route.useLoaderData();
  const { data: session, isPending, error } = useSession();
  const [timedOut, setTimedOut] = useState(false);

  // Timeout fallback - if session check hangs, assume auth failed
  useEffect(() => {
    if (!isPending) return;
    const timer = setTimeout(() => setTimedOut(true), SESSION_CHECK_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isPending]);

  useEffect(() => {
    // Redirect to sign-in if not authenticated, errored, or timed out
    if ((!isPending && (!session || error)) || timedOut) {
      navigate({ to: '/auth/sign-in' });
    }
  }, [isPending, session, error, timedOut, navigate]);

  // Show sidebar skeleton during auth check only (unless timed out)
  // Content skeleton is handled by each page's pendingComponent
  if (isPending && !timedOut) {
    return (
      <SidebarProvider>
        <SidebarLoadingFallback count={10} showFavorites={false} />
        <SidebarInset className="flex flex-col relative">
          {/* Minimal header matching actual NavigationHeader structure */}
          <header className="sticky top-0 left-0 right-0 z-50 flex h-14 sm:h-16 shrink-0 items-center gap-2">
            <div className="flex items-center gap-2 pt-4 px-5 md:px-6 lg:px-8 h-14 sm:h-16 w-full">
              <Skeleton className="size-8 rounded-lg" />
              <Skeleton className="h-5 w-28" />
            </div>
          </header>
          {/* Empty content area - page will show its own skeleton */}
          <div className="flex-1" />
        </SidebarInset>
      </SidebarProvider>
    );
  }

  // Show nothing while redirecting (prevents flash)
  if (!session || error) {
    return null;
  }

  // Wrap with providers so sidebar has access to stores
  return (
    <PreferencesStoreProvider>
      <ChatLayoutProviders>
        <ChatLayoutShell session={session} initialThreads={loaderData.sidebarThreads}>
          <Outlet />
        </ChatLayoutShell>
      </ChatLayoutProviders>
    </PreferencesStoreProvider>
  );
}
