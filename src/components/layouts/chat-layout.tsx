import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type React from 'react';
import { Suspense } from 'react';

import { NavigationHeader } from '@/components/chat/chat-header';
import { AppSidebar } from '@/components/chat/chat-nav';
import { ThreadHeaderProvider } from '@/components/chat/thread-header-context';
import { ContentLoadingFallback, SidebarLoadingFallback } from '@/components/loading';
import { BreadcrumbStructuredData } from '@/components/seo';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { getQueryClient } from '@/lib/data/query-client';
import { queryKeys } from '@/lib/data/query-keys';
import { STALE_TIMES } from '@/lib/data/stale-times';
import {
  getSubscriptionsService,
  getUserUsageStatsService,
  listThreadsService,
} from '@/services/api';
import { listModelsService } from '@/services/api/models';

type ChatLayoutProps = {
  children: React.ReactNode;
  modal?: React.ReactNode;
};

/**
 * Chat Layout - Server Component with Optimized Prefetching
 * Provides sidebar navigation and header for all /chat routes
 *
 * PERFORMANCE OPTIMIZATION: Server-side prefetching for critical data
 *
 * Prefetching strategy:
 * ✅ Threads list (infinite query) - First 50 items for sidebar
 * ✅ Usage stats - For usage metrics display
 * ✅ Subscriptions - For NavUser billing info
 * ✅ Models list - 100 dynamic models from OpenRouter (24h cache)
 *
 * Why this approach:
 * ✅ Eliminates loading states on initial page load
 * ✅ Data is immediately available when components mount
 * ✅ Proper staleTime prevents unnecessary refetches
 * ✅ Subsequent navigations use cached data (no refetch)
 * ✅ Provides optimal first-load experience
 *
 * Data fetching strategy:
 * - Threads: prefetchInfiniteQuery with 50 items (staleTime: 30s)
 * - Usage: prefetchQuery (staleTime: 1min)
 * - Subscriptions: prefetchQuery (staleTime: 2min)
 * - Models: prefetchQuery (staleTime: Infinity - never refetch)
 *
 * First load experience:
 * - Zero loading states (data pre-hydrated)
 * - Instant sidebar rendering with full data
 * - Model selection dropdowns immediately populated
 * - Quick start cards instantly available with proper models
 * - Subsequent navigations: instant (cached)
 *
 * Pattern from Next.js 15 + TanStack Query best practices:
 * - Server Components prefetch and hydrate critical data
 * - Client Components consume hydrated cache
 * - Layout prefetching provides optimal UX for user dashboards
 */
export default async function ChatLayout({ children, modal }: ChatLayoutProps) {
  const queryClient = getQueryClient();

  // Prefetch all critical data in parallel for optimal performance
  // This eliminates loading states and provides instant data on first load
  await Promise.all([
    // 1. Prefetch threads list (infinite query) - First 50 items for sidebar
    queryClient.prefetchInfiniteQuery({
      queryKey: queryKeys.threads.lists(undefined), // No search query for initial load
      queryFn: async ({ pageParam }) => {
        // First page: 50 items (matches client-side hook behavior)
        const limit = pageParam ? 20 : 50;
        const params: { cursor?: string; limit: number } = { limit };
        if (pageParam)
          params.cursor = pageParam;

        return listThreadsService({ query: params });
      },
      initialPageParam: undefined as string | undefined,
      getNextPageParam: lastPage =>
        lastPage.success ? lastPage.data?.pagination?.nextCursor : undefined,
      pages: 1, // Only prefetch first page (50 items sufficient for sidebar)
      staleTime: STALE_TIMES.threads, // 30 seconds - matches client hook
    }),

    // 2. Prefetch usage stats for UsageMetrics component
    queryClient.prefetchQuery({
      queryKey: queryKeys.usage.stats(),
      queryFn: getUserUsageStatsService,
      staleTime: STALE_TIMES.usage, // 1 minute - matches client hook
    }),

    // 3. Prefetch subscriptions for NavUser component
    queryClient.prefetchQuery({
      queryKey: queryKeys.subscriptions.list(),
      queryFn: getSubscriptionsService,
      staleTime: STALE_TIMES.subscriptions, // 2 minutes - matches client hook
    }),

    // 4. ✅ Prefetch models list - Top 50 models from OpenRouter
    // SINGLE SOURCE OF TRUTH: All model data comes from backend
    // 24h cache on server, Infinity staleTime on client
    // Ensures model dropdowns, quick start, and participant selection are instantly available
    queryClient.prefetchQuery({
      queryKey: queryKeys.models.list(),
      queryFn: () => listModelsService(),
      staleTime: STALE_TIMES.models, // Infinity - never refetch (models are cached 24h on server)
    }),
  ]);

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
            <AppSidebar />
          </Suspense>

          <SidebarInset className="h-svh relative">
            <NavigationHeader />

            {/* ✅ OPTIMIZATION: Suspense boundary for main content streaming */}
            {/* Content fills viewport below fixed header - THIS IS THE PRIMARY SCROLL CONTAINER */}
            {/* Page-level scrolling happens here, not in inner divs */}
            {/* top-16 (64px) for header clearance, no bottom offset - content padding handles spacing */}
            <div id="chat-scroll-container" className="absolute inset-0 top-16 overflow-y-auto overflow-x-hidden">
              <Suspense fallback={<ContentLoadingFallback />}>
                {children}
              </Suspense>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </ThreadHeaderProvider>
      {modal}
    </HydrationBoundary>
  );
}
