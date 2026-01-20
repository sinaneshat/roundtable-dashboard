import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo } from 'react';

import { ThreadContentSkeleton } from '@/components/skeletons';
import ChatThreadScreen from '@/containers/screens/chat/ChatThreadScreen';
import { useSession } from '@/lib/auth/client';
import {
  streamResumptionQueryOptions,
  threadBySlugQueryOptions,
  threadChangelogQueryOptions,
  threadFeedbackQueryOptions,
  threadPreSearchesQueryOptions,
} from '@/lib/data/query-options';
import type { GetThreadBySlugResponse } from '@/services/api';

export const Route = createFileRoute('/_protected/chat/$slug')({
  // ✅ ROUTE-LEVEL CACHING: Match TanStack Query staleTime for efficient navigation
  // Prevents loader from re-running when revisiting same thread within 2 minutes
  // TanStack Query still manages actual data freshness; this prevents duplicate loader calls
  staleTime: 2 * 60 * 1000, // 2 minutes - matches STALE_TIMES.threadDetail

  // Prefetch thread data and stream resumption state for SSR hydration
  // Uses shared queryOptions to ensure consistent caching between server and client
  loader: async ({ params, context }) => {
    const { queryClient } = context;
    const options = threadBySlugQueryOptions(params.slug);

    // ensureQueryData internally checks staleTime and only fetches if data is stale/missing
    // @see https://tanstack.com/router/latest/docs/framework/react/guide/external-data-loading
    await queryClient.ensureQueryData(options);

    // Get thread ID from cached data for auxiliary fetches
    const cachedData = queryClient.getQueryData<GetThreadBySlugResponse>(options.queryKey);
    const threadId = cachedData?.success && cachedData.data?.thread?.id;
    const threadTitle = cachedData?.success && cachedData.data?.thread?.title ? cachedData.data.thread.title : null;

    // ✅ SSR HYDRATION: Fetch auxiliary data and return directly for immediate SSR access
    // useQuery doesn't return cached data on first SSR render, so pass via loaderData
    let preSearches;
    let changelog;
    let feedback;
    let streamResumption;

    if (threadId) {
      const streamOptions = streamResumptionQueryOptions(threadId);
      const changelogOptions = threadChangelogQueryOptions(threadId);
      const feedbackOptions = threadFeedbackQueryOptions(threadId);
      const preSearchesOptions = threadPreSearchesQueryOptions(threadId);

      // Parallel fetch - all queries run concurrently
      const [streamResult, changelogResult, feedbackResult, preSearchesResult] = await Promise.all([
        queryClient.ensureQueryData(streamOptions).catch(() => null),
        queryClient.ensureQueryData(changelogOptions).catch(() => null),
        queryClient.ensureQueryData(feedbackOptions).catch(() => null),
        queryClient.ensureQueryData(preSearchesOptions).catch(() => null),
      ]);

      // Extract data from results
      streamResumption = streamResult?.success ? streamResult.data : undefined;
      changelog = changelogResult?.success ? changelogResult.data?.items : undefined;
      feedback = feedbackResult?.success ? feedbackResult.data?.feedback : undefined;
      preSearches = preSearchesResult?.success ? preSearchesResult.data?.items : undefined;
    }

    return { threadTitle, threadId, preSearches, changelog, feedback, streamResumption };
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

  // ✅ ANTI-PATTERN FIX: Use loaderData directly instead of useQuery
  // TanStack Router integration automatically dehydrates/hydrates query cache
  // Using useQuery here is redundant and causes unnecessary client-side fetches
  // The loader already ensureQueryData for all auxiliary data, so just use loaderData
  // React Query cache is already hydrated - mutations will invalidate as needed
  const streamResumptionState = loaderData.streamResumption ?? null;
  const changelog = loaderData.changelog;
  const feedback = loaderData.feedback;
  const preSearches = loaderData.preSearches;

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
      streamResumptionState={streamResumptionState}
      initialChangelog={changelog}
      initialFeedback={feedback}
      initialPreSearches={preSearches}
    />
  );
}
