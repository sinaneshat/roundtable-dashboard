import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { headers } from 'next/headers';
import type React from 'react';
import { Suspense } from 'react';

import { requireAuth } from '@/app/auth/actions';
import { ChatHeaderSwitch } from '@/components/chat/chat-header-switch';
import { AppSidebar } from '@/components/chat/chat-nav';
import { ThreadHeaderProvider } from '@/components/chat/thread-header-context';
import { SidebarLoadingFallback } from '@/components/loading';
import { BreadcrumbStructuredData } from '@/components/seo';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { LIMITS } from '@/constants/limits';
import { getQueryClient } from '@/lib/data/query-client';
import { queryKeys } from '@/lib/data/query-keys';
import { STALE_TIMES } from '@/lib/data/stale-times';
import { shouldSkipAuth } from '@/lib/public-routes';
import {
  getSubscriptionsService,
  listThreadsService,
} from '@/services/api';

type ChatLayoutProps = {
  children: React.ReactNode;
};

/**
 * Chat Layout - Server Component with Optimized Prefetching
 * Provides sidebar navigation and header for all /chat routes
 *
 * Prefetching strategy (server-side critical data only):
 * ✅ Threads list - First 50 items for sidebar navigation
 * ✅ Subscriptions - For NavUser billing info
 *
 * Client-side fetching (non-blocking, with loading states):
 * - Usage stats - Fetched on client with skeleton loading
 * - Models list - Fetched on client with skeleton loading
 */
export default async function ChatLayout({ children }: ChatLayoutProps) {
  const queryClient = getQueryClient();
  const headersList = await headers();
  const skipAuth = shouldSkipAuth(headersList);

  // For authenticated routes: require auth + prefetch user data
  let session = null;
  if (!skipAuth) {
    // Require auth (redirects to sign-in if not authenticated)
    session = await requireAuth();

    // Prefetch critical navigation data
    await Promise.all([
      queryClient.prefetchInfiniteQuery({
        queryKey: queryKeys.threads.lists(undefined),
        queryFn: async ({ pageParam }) => {
          const limit = pageParam ? LIMITS.STANDARD_PAGE : LIMITS.INITIAL_PAGE;
          const params: { cursor?: string; limit: number } = { limit };
          if (pageParam)
            params.cursor = pageParam;
          return listThreadsService({ query: params });
        },
        initialPageParam: undefined as string | undefined,
        getNextPageParam: lastPage =>
          lastPage.success ? lastPage.data?.pagination?.nextCursor : undefined,
        pages: 1,
        staleTime: STALE_TIMES.threads,
      }),
      queryClient.prefetchQuery({
        queryKey: queryKeys.subscriptions.list(),
        queryFn: getSubscriptionsService,
        staleTime: STALE_TIMES.subscriptions,
      }),
    ]);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <BreadcrumbStructuredData
        items={[
          { name: 'Home', url: '/' },
          { name: 'Chat', url: '/chat' },
        ]}
      />
      <ThreadHeaderProvider>
        <SidebarProvider>
          {/* ✅ OPTIMIZATION: Suspense boundary for sidebar streaming */}
          <Suspense fallback={<SidebarLoadingFallback count={10} showFavorites={false} />}>
            <AppSidebar initialSession={session} />
          </Suspense>

          {/* Body-based scrolling for native OS scroll behavior */}
          <SidebarInset id="main-scroll-container" className="flex flex-col relative">
            <ChatHeaderSwitch />

            {/* Screen components manage their own scroll via body */}
            {/* NOTE: No Suspense here - page-level loading.tsx handles loading states */}
            {children}
          </SidebarInset>
        </SidebarProvider>
      </ThreadHeaderProvider>
    </HydrationBoundary>
  );
}
