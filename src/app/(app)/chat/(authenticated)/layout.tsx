import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type React from 'react';

import { requireAuth } from '@/app/auth/actions';
import { ChatLayoutShell } from '@/components/layouts/chat-layout-shell';
import { LIMITS } from '@/constants/limits';
import { getQueryClient } from '@/lib/data/query-client';
import { queryKeys } from '@/lib/data/query-keys';
import { STALE_TIMES } from '@/lib/data/stale-times';
import {
  getSubscriptionsService,
  getUserUsageStatsService,
  listThreadsService,
} from '@/services/api';

type AuthenticatedLayoutProps = {
  children: React.ReactNode;
};

/**
 * Authenticated Chat Layout
 * Handles auth enforcement + prefetching for protected routes
 */
export default async function AuthenticatedChatLayout({ children }: AuthenticatedLayoutProps) {
  const queryClient = getQueryClient();

  // Require auth (redirects to sign-in if not authenticated)
  const session = await requireAuth();

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
    queryClient.prefetchQuery({
      queryKey: queryKeys.usage.stats(),
      queryFn: getUserUsageStatsService,
      staleTime: STALE_TIMES.quota,
    }),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ChatLayoutShell session={session}>
        {children}
      </ChatLayoutShell>
    </HydrationBoundary>
  );
}
