import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import { permanentRedirect, redirect } from 'next/navigation';

import { BRAND } from '@/constants';
import ChatThreadScreen from '@/containers/screens/chat/ChatThreadScreen';
import { getQueryClient } from '@/lib/data/query-client';
import { queryKeys } from '@/lib/data/query-keys';
import { STALE_TIMES } from '@/lib/data/stale-times';
import { verifyAndFetchFreshMessages } from '@/lib/utils';
import { getThreadBySlugService, getThreadChangelogService, getThreadFeedbackService, getThreadPreSearchesService, getThreadStreamResumptionStateService } from '@/services/api';
import { createMetadata } from '@/utils';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  return createMetadata({
    title: `Chat - ${BRAND.fullName}`,
    description: 'Collaborate with AI models in real-time conversations',
    robots: 'noindex, nofollow',
    url: `/chat/${slug}`,
    canonicalUrl: `/chat/${slug}`,
    // Let Next.js auto-detect opengraph-image.tsx - don't pass explicit image path
  });
}

export default async function ChatThreadPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const queryClient = getQueryClient();

  // Fetch thread with error handling for 404s
  let threadResult;
  try {
    threadResult = await getThreadBySlugService({ param: { slug } });
  } catch (error) {
    console.error('[ChatThreadPage] Failed to fetch thread:', error);
    redirect('/chat');
  }

  if (!threadResult?.success || !threadResult.data?.thread) {
    redirect('/chat');
  }

  const { thread, participants, messages: initialMessages, user } = threadResult.data;

  if (thread.isAiGeneratedTitle && thread.slug !== slug) {
    permanentRedirect(`/chat/${thread.slug}`);
  }

  // Fetch stream resumption state FIRST - needed for message verification
  let streamResumptionState = null;
  try {
    const streamStateResult = await getThreadStreamResumptionStateService({
      param: { threadId: thread.id },
    });
    if (streamStateResult?.success && streamStateResult.data) {
      streamResumptionState = streamStateResult.data;
    }
  } catch (error) {
    console.error('[ChatThreadPage] Failed to fetch stream resumption state:', error);
  }

  // ✅ SSR CONSISTENCY: Verify messages match stream status, retry if D1 is stale
  // This ensures proper SSR paint without client-side fallback fetches
  // Returns messages with Date objects already transformed
  const { messages: messagesWithDates } = await verifyAndFetchFreshMessages({
    threadId: thread.id,
    currentMessages: initialMessages,
    streamResumptionState,
  });

  // ✅ PERF: Fire-and-forget prefetches - don't block page render
  // Prefetches populate cache but we don't await - page renders instantly
  void Promise.all([
    queryClient.prefetchQuery({
      queryKey: queryKeys.threads.changelog(thread.id),
      queryFn: () => getThreadChangelogService({ param: { id: thread.id } }),
      staleTime: STALE_TIMES.threadChangelog,
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.threads.preSearches(thread.id),
      queryFn: () => getThreadPreSearchesService({ param: { id: thread.id } }),
      staleTime: STALE_TIMES.preSearch,
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.threads.feedback(thread.id),
      queryFn: () => getThreadFeedbackService({ param: { id: thread.id } }),
      staleTime: STALE_TIMES.threadFeedback,
    }),
  ]).catch(() => {
    // Silently fail - client will refetch if needed
  });

  queryClient.setQueryData(
    queryKeys.threads.detail(thread.id),
    threadResult,
  );

  const threadWithDates = {
    ...thread,
    createdAt: new Date(thread.createdAt),
    updatedAt: new Date(thread.updatedAt),
    lastMessageAt: thread.lastMessageAt ? new Date(thread.lastMessageAt) : null,
  };

  const participantsWithDates = participants.map(p => ({
    ...p,
    createdAt: new Date(p.createdAt),
    updatedAt: new Date(p.updatedAt),
  }));

  // Messages already transformed by verifyAndFetchFreshMessages

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ChatThreadScreen
        thread={threadWithDates}
        participants={participantsWithDates}
        initialMessages={messagesWithDates}
        slug={slug}
        user={user}
        streamResumptionState={streamResumptionState}
      />
    </HydrationBoundary>
  );
}
