import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';

import { BRAND } from '@/constants';
import { ChatThreadScreen } from '@/containers/screens/chat';
import { getQueryClient } from '@/lib/data/query-client';
import { queryKeys } from '@/lib/data/query-keys';
import { STALE_TIMES } from '@/lib/data/stale-times';
import { getThreadBySlugService, getThreadMessagesService } from '@/services/api';
import { createMetadata } from '@/utils/metadata';

// Force dynamic rendering for user-specific thread data
export const dynamic = 'force-dynamic';

/**
 * Generate metadata for chat thread page
 * Private pages should not be indexed
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  return createMetadata({
    title: `Chat - ${BRAND.fullName}`,
    description: 'Collaborate with AI models in real-time conversations',
    robots: 'noindex, nofollow', // Don't index private chat pages
    url: `/chat/${slug}`,
  });
}

/**
 * Chat Thread Page - Server Component with Prefetching
 * Prefetches thread data and messages on server for instant hydration
 */
export default async function ChatThreadPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const queryClient = getQueryClient();

  // Prefetch thread data on server for instant hydration
  // This prevents loading states and provides better UX
  const threadResult = await queryClient.fetchQuery({
    queryKey: queryKeys.threads.bySlug(slug),
    queryFn: () => getThreadBySlugService(slug),
    staleTime: STALE_TIMES.threadDetail, // 10 seconds - MUST match client-side hook
  });

  // If thread has assistant messages, prefetch messages with session data
  // This ensures session wrappers render immediately without loading states
  if (threadResult?.success && threadResult.data?.thread) {
    const threadId = threadResult.data.thread.id;
    const hasAssistantMessages = threadResult.data.messages?.some(msg => msg.role === 'assistant');

    if (hasAssistantMessages) {
      await queryClient.prefetchQuery({
        queryKey: queryKeys.threads.messages(threadId),
        queryFn: () => getThreadMessagesService(threadId),
        staleTime: STALE_TIMES.messages, // 10 seconds - MUST match client-side hook
      });
    }
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ChatThreadScreen slug={slug} />
    </HydrationBoundary>
  );
}
