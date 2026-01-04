import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import type React from 'react';

import { requireAuth } from '@/app/auth/actions';
import { ChatLayoutShell } from '@/components/layouts/chat-layout-shell';
import { BRAND } from '@/constants/brand';
import { LIMITS } from '@/constants/limits';
import { getQueryClient } from '@/lib/data/query-client';
import { queryKeys } from '@/lib/data/query-keys';
import { STALE_TIMES } from '@/lib/data/stale-times';
import {
  getSubscriptionsService,
  getUserUsageStatsService,
  listModelsService,
  listThreadsService,
} from '@/services/api';
import { createMetadata } from '@/utils';

export async function generateMetadata(): Promise<Metadata> {
  return createMetadata({
    title: `Chat - ${BRAND.fullName}`,
    description: 'Manage your conversations and chat history.',
    robots: 'noindex, nofollow',
  });
}

type ChatLayoutProps = {
  children: React.ReactNode;
};

/**
 * Chat Layout - Auth Required
 * ALL /chat/* routes require authentication
 */
export default async function ChatLayout({ children }: ChatLayoutProps) {
  const queryClient = getQueryClient();

  // Require auth (redirects to sign-in if not authenticated)
  const session = await requireAuth();

  // Prefetch critical navigation data
  // Wrapped in try-catch to prevent Server Component failures in OpenNext preview
  try {
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
      // Models prefetch - staleTime Infinity means instant availability, no client refetch
      queryClient.prefetchQuery({
        queryKey: queryKeys.models.list(),
        queryFn: () => listModelsService(),
        staleTime: STALE_TIMES.models,
      }),
    ]);
  } catch (error) {
    // Log but don't crash - client will refetch on hydration
    console.error('[ChatLayout] Prefetch failed:', error);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ChatLayoutShell session={session}>
        {children}
      </ChatLayoutShell>
    </HydrationBoundary>
  );
}
