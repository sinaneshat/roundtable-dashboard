import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import type React from 'react';

import { requireAuth } from '@/app/auth/actions';
import { ChatLayoutShell } from '@/components/layouts/chat-layout-shell';
import { BRAND } from '@/constants';
import { getQueryClient } from '@/lib/data/query-client';
import { queryKeys } from '@/lib/data/query-keys';
import { STALE_TIMES } from '@/lib/data/stale-times';
import { getUserUsageStatsService, listModelsService } from '@/services/api';
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
 * All routes under this layout require authentication.
 * Public routes like /chat/pricing use separate layouts.
 */
export default async function ChatLayout({ children }: ChatLayoutProps) {
  const queryClient = getQueryClient();
  const session = await requireAuth();

  // Prefetch shared data for authenticated chat routes
  // Models (infinite cache) + usage stats for sidebar display
  try {
    await Promise.all([
      queryClient.prefetchQuery({
        queryKey: queryKeys.models.list(),
        queryFn: () => listModelsService(),
        staleTime: STALE_TIMES.models,
      }),
      queryClient.prefetchQuery({
        queryKey: queryKeys.usage.stats(),
        queryFn: getUserUsageStatsService,
        staleTime: STALE_TIMES.quota,
      }),
    ]);
  } catch (error) {
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
