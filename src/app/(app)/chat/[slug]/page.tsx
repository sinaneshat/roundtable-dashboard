import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { BRAND } from '@/constants';
import { ChatThreadScreen } from '@/containers/screens/chat';
import { ChatThreadStateProvider } from '@/contexts/chat-thread-state-context';
import { getQueryClient } from '@/lib/data/query-client';
import { queryKeys } from '@/lib/data/query-keys';
import { STALE_TIME_PRESETS, STALE_TIMES } from '@/lib/data/stale-times';
import { getThreadAnalysesService, getThreadBySlugService, getThreadChangelogService, getThreadFeedbackService } from '@/services/api';
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
    canonicalUrl: `/chat/${slug}`,
    image: `/chat/${slug}/opengraph-image`,
  });
}

/**
 * Chat Thread Page - OPTIMIZED SERVER-SIDE PRE-FETCHING
 *
 * SERVER COMPONENT: Fetches data directly on server + pre-fetches critical data
 * - Thread data fetched directly (user-specific) - participants, messages included
 * - Critical data pre-fetched: changelog, analyses, feedback, thread detail
 * - Models pre-fetched at layout level (no duplication needed)
 * - Passes raw data as props to Client Component
 * - Client Component uses useChat with initialMessages
 *
 * Pre-fetching Strategy:
 * ✅ Thread data: Direct fetch (includes participants, messages)
 * ✅ Changelog: Pre-fetched (30s stale time)
 * ✅ Analyses: Pre-fetched (30s stale time)
 * ✅ Feedback: Pre-fetched (2min stale time) - for like/dislike buttons
 * ✅ Thread detail: Cache populated with thread data - for useThreadQuery
 * ✅ Models: Pre-fetched at layout level (Infinity stale time)
 *
 * This eliminates all client-side loading states for critical data
 * https://nextjs.org/docs/app/building-your-application/rendering/server-components
 */
export default async function ChatThreadPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const queryClient = getQueryClient();

  // OFFICIAL PATTERN: Fetch data directly in Server Component
  // No QueryClient, no prefetch, no hydration - just raw data fetching
  const threadResult = await getThreadBySlugService({ param: { slug } });

  // Handle error states
  if (!threadResult?.success || !threadResult.data?.thread) {
    redirect('/chat');
  }

  const { thread, participants, messages, user } = threadResult.data;

  // ✅ OPTIMIZATION: Pre-fetch all critical data in parallel for zero loading states
  await Promise.all([
    // 1. Prefetch changelog - configuration changes shown in UI
    queryClient.prefetchQuery({
      queryKey: queryKeys.threads.changelog(thread.id),
      queryFn: () => getThreadChangelogService({ param: { id: thread.id } }),
      staleTime: STALE_TIMES.changelog, // 30 seconds - matches client-side query
    }),

    // 2. Prefetch moderator analyses - round analysis cards
    queryClient.prefetchQuery({
      queryKey: queryKeys.threads.analyses(thread.id),
      queryFn: () => getThreadAnalysesService({ param: { id: thread.id } }),
      staleTime: STALE_TIMES.analyses, // 30 seconds - matches client-side query
    }),

    // 3. ✅ NEW: Prefetch thread feedback - like/dislike button states
    // This eliminates loading state for feedback buttons
    // CRITICAL: Must extract response.data to match what useThreadFeedbackQuery returns
    queryClient.prefetchQuery({
      queryKey: queryKeys.threads.feedback(thread.id),
      queryFn: async () => {
        const response = await getThreadFeedbackService({ param: { id: thread.id } });
        if (!response.success) {
          throw new Error('Failed to fetch feedback');
        }
        return response.data; // Extract data array to match query hook behavior
      },
      staleTime: STALE_TIME_PRESETS.medium, // 2 minutes - matches client-side query
    }),
  ]);

  // 4. ✅ NEW: Populate thread detail cache with data we already have
  // useThreadQuery expects this cache key, so we pre-populate it to avoid extra fetch
  // This is more efficient than calling prefetchQuery since we already have the data
  queryClient.setQueryData(
    queryKeys.threads.detail(thread.id),
    threadResult,
  );

  // ✅ MODELS: Already pre-fetched at layout level (chat-layout.tsx)
  // No need to duplicate the pre-fetch here

  // OFFICIAL PATTERN: Pass raw data as props to Client Component
  // Client Component will use useChat with initialMessages
  // Changelog is prefetched and accessed via useThreadChangelogQuery hook
  // NavigationHeader in layout will automatically show thread actions for this route

  // Convert API response dates (strings) to Date objects for component
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
      <ChatThreadStateProvider>
        <ChatThreadScreen
          thread={threadWithDates}
          participants={participantsWithDates}
          initialMessages={messagesWithDates}
          slug={slug}
          user={user}
        />
      </ChatThreadStateProvider>
    </HydrationBoundary>
  );
}
