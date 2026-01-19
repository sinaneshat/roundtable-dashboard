import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo } from 'react';

import { ThreadContentSkeleton } from '@/components/skeletons';
import ChatThreadScreen from '@/containers/screens/chat/ChatThreadScreen';
import { useSession } from '@/lib/auth/client';
import {
  threadBySlugQueryOptions,
  threadChangelogQueryOptions,
  threadFeedbackQueryOptions,
} from '@/lib/data/query-options';
import { STALE_TIMES } from '@/lib/data/stale-times';
import { getStreamResumptionState } from '@/server/thread';
import type { GetThreadBySlugResponse, ThreadStreamResumptionState } from '@/services/api';

export const Route = createFileRoute('/_protected/chat/$slug')({
  // ✅ PERF: staleTime prevents loader re-execution on quick client navigations
  // Data is considered fresh for 2 minutes (matches threadDetail staleTime)
  // This eliminates duplicate fetches when navigating between threads
  staleTime: STALE_TIMES.threadDetail,
  // Prefetch thread data and stream resumption state for SSR hydration
  // Uses shared queryOptions to ensure consistent caching between server and client
  loader: async ({ params, context }) => {
    const { queryClient } = context;
    const options = threadBySlugQueryOptions(params.slug);

    // ✅ PERF: Check if we have fresh cached data before fetching
    // This prevents unnecessary server function calls on client navigation
    const existingState = queryClient.getQueryState(options.queryKey);
    const hasFreshCache = existingState?.data
      && existingState.dataUpdatedAt > Date.now() - STALE_TIMES.threadDetail;

    // Only fetch if cache is stale or missing
    if (!hasFreshCache) {
      await queryClient.ensureQueryData(options);
    }

    // Get thread ID from cached data for stream status fetch
    const cachedData = queryClient.getQueryData<GetThreadBySlugResponse>(options.queryKey);
    const threadId = cachedData?.success && cachedData.data?.thread?.id;
    const threadTitle = cachedData?.success && cachedData.data?.thread?.title ? cachedData.data.thread.title : null;

    // ✅ PERF: Skip auxiliary fetches on client navigation when cache is fresh
    // The flow-controller pre-populates this data during thread creation
    // Only fetch on SSR (first load) or when cache was stale
    let streamResumptionState: ThreadStreamResumptionState | null = null;
    if (threadId && !hasFreshCache) {
      // ✅ SSR: Prefetch changelog and feedback in parallel with stream status
      // This ensures data is in cache before component renders, preventing client refetch
      const changelogOptions = threadChangelogQueryOptions(threadId);
      const feedbackOptions = threadFeedbackQueryOptions(threadId);

      // Parallel prefetch - all queries run concurrently
      await Promise.all([
        // Stream resumption state (non-query, direct fetch)
        getStreamResumptionState({ data: threadId })
          .then((streamStatus) => {
            if (streamStatus.success && streamStatus.data) {
              streamResumptionState = streamStatus.data;
            }
          })
          .catch(() => { /* Stream status is optional */ }),
        // Changelog - uses shared queryOptions for SSR hydration
        queryClient.ensureQueryData(changelogOptions).catch(() => { /* Changelog is optional */ }),
        // Feedback - uses shared queryOptions for SSR hydration
        queryClient.ensureQueryData(feedbackOptions).catch(() => { /* Feedback is optional */ }),
      ]);
    }

    return { threadTitle, streamResumptionState };
  },
  // Dynamic title from loader data
  head: ({ loaderData }) => {
    const displayTitle = loaderData?.threadTitle
      ? `${loaderData.threadTitle} - Roundtable`
      : 'Chat - Roundtable';
    return {
      meta: [
        { title: displayTitle },
        { name: 'robots', content: 'noindex, nofollow' },
      ],
    };
  },
  // ✅ SSR: Direct component - renders on server with loader data
  component: ChatThreadRoute,
  // pendingComponent shown during route transitions
  pendingComponent: ThreadContentSkeleton,
});

function ChatThreadRoute() {
  const { slug } = Route.useParams();
  const { data: session } = useSession();
  const loaderData = Route.useLoaderData();

  // ✅ SSR FIX: Use useSuspenseQuery with ensureQueryData pattern from TanStack Router docs
  // - Loader uses ensureQueryData to prefetch + dehydrate data to client
  // - useSuspenseQuery guarantees data is available (suspends if not, but never happens with ensureQueryData)
  // - No isPending check needed - data is always available after SSR hydration
  // - Errors are caught by route errorComponent
  const { data: queryData } = useSuspenseQuery(threadBySlugQueryOptions(slug));

  const threadData = queryData?.success ? queryData.data : null;

  const user = useMemo(() => ({
    id: session?.user?.id ?? '',
    name: session?.user?.name || 'You',
    image: session?.user?.image || null,
  }), [session?.user?.id, session?.user?.name, session?.user?.image]);

  // Handle case where API returned success: false or unexpected data structure
  if (!threadData) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive">Thread not found</h1>
          <p className="text-muted-foreground mt-2">
            The conversation you are looking for does not exist.
          </p>
        </div>
      </div>
    );
  }

  const { thread, participants, messages } = threadData;

  return (
    <ChatThreadScreen
      thread={thread}
      participants={participants}
      initialMessages={messages}
      slug={slug}
      user={user}
      streamResumptionState={loaderData.streamResumptionState}
    />
  );
}
