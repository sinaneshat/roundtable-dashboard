import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import { permanentRedirect, redirect } from 'next/navigation';

import { BRAND } from '@/constants';
import ChatThreadScreen from '@/containers/screens/chat/ChatThreadScreen';
import { getQueryClient } from '@/lib/data/query-client';
import { queryKeys } from '@/lib/data/query-keys';
import { STALE_TIMES } from '@/lib/data/stale-times';
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

  const { thread, participants, messages, user } = threadResult.data;

  if (thread.isAiGeneratedTitle && thread.slug !== slug) {
    permanentRedirect(`/chat/${thread.slug}`);
  }

  // ✅ PERF FIX: Prefetch all thread data server-side to avoid client-side calls
  // Uses matching staleTime with client hooks to prevent refetch on hydration
  // Wrapped in try-catch to prevent Server Component failures
  try {
    await Promise.all([
      queryClient.prefetchQuery({
        queryKey: queryKeys.threads.changelog(thread.id),
        queryFn: () => getThreadChangelogService({ param: { id: thread.id } }),
        staleTime: STALE_TIMES.threadChangelog, // ✅ FIX: Match client hook staleTime (Infinity)
      }),
      queryClient.prefetchQuery({
        queryKey: queryKeys.threads.preSearches(thread.id),
        queryFn: () => getThreadPreSearchesService({ param: { id: thread.id } }),
        staleTime: STALE_TIMES.preSearch,
      }),
      queryClient.prefetchQuery({
        queryKey: queryKeys.threads.feedback(thread.id),
        queryFn: () => getThreadFeedbackService({ param: { id: thread.id } }),
        staleTime: STALE_TIMES.threadFeedback, // ✅ Never stale - invalidated only on mutation
      }),
    ]);
  } catch (error) {
    console.error('[ChatThreadPage] Prefetch failed:', error);
  }

  queryClient.setQueryData(
    queryKeys.threads.detail(thread.id),
    threadResult,
  );

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

  const messagesWithDates = messages.map(m => ({
    ...m,
    createdAt: new Date(m.createdAt),
  }));

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
