import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
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
} from '@/lib/data/query-options';
import type { GetThreadBySlugResponse } from '@/services/api';

export const Route = createFileRoute('/_protected/chat/$slug')({
  // NOTE: No route-level staleTime - TanStack Query manages data freshness
  // @see https://tanstack.com/router/latest/docs/framework/react/guide/preloading#preloading-with-external-libraries
  //
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

    // Prefetch auxiliary data in parallel - ensureQueryData handles freshness checks
    // All queries use shared queryOptions for proper SSR dehydration/hydration
    if (threadId) {
      const streamOptions = streamResumptionQueryOptions(threadId);
      const changelogOptions = threadChangelogQueryOptions(threadId);
      const feedbackOptions = threadFeedbackQueryOptions(threadId);

      // Parallel prefetch - all queries run concurrently
      // Each uses ensureQueryData for proper cache integration and SSR hydration
      await Promise.all([
        queryClient.ensureQueryData(streamOptions).catch(() => { /* Stream status is optional */ }),
        queryClient.ensureQueryData(changelogOptions).catch(() => { /* Changelog is optional */ }),
        queryClient.ensureQueryData(feedbackOptions).catch(() => { /* Feedback is optional */ }),
      ]);
    }

    return { threadTitle, threadId };
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

  // Stream resumption state - prefetched in loader, now hydrated via query cache
  // Uses useQuery (not suspense) since stream state is optional
  const { data: streamData } = useQuery({
    ...streamResumptionQueryOptions(loaderData.threadId ?? ''),
    enabled: !!loaderData.threadId,
  });

  const threadData = queryData?.success ? queryData.data : null;
  const streamResumptionState = streamData?.success ? streamData.data : null;

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
    />
  );
}
