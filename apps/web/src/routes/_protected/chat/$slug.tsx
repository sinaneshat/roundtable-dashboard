import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo } from 'react';

import { ThreadContentSkeleton } from '@/components/skeletons';
import ChatThreadScreen from '@/containers/screens/chat/ChatThreadScreen';
import { useSession } from '@/lib/auth/client';
import { getAppBaseUrl } from '@/lib/config/base-urls';
import {
  streamResumptionQueryOptions,
  threadBySlugQueryOptions,
  threadChangelogQueryOptions,
  threadFeedbackQueryOptions,
  threadPreSearchesQueryOptions,
} from '@/lib/data/query-options';
import type {
  GetThreadBySlugResponse,
  GetThreadChangelogResponse,
  GetThreadFeedbackResponse,
  GetThreadPreSearchesResponse,
  GetThreadStreamResumptionStateResponse,
} from '@/services/api';

export const Route = createFileRoute('/_protected/chat/$slug')({
  // ✅ DISABLE route-level caching to fix preloading race condition
  // React Query handles caching at the query level instead
  staleTime: 0,

  // ✅ SKELETON FLASH FIX: Only show pending component after 300ms
  pendingMs: 300,

  loader: async ({ params, context }) => {
    const { queryClient } = context;

    // ✅ GUARD: Skip loading when slug is undefined (safety check)
    // This shouldn't happen when Link uses proper params syntax
    if (!params.slug) {
      console.error('[ChatThread] Loader skipped - slug undefined');
      return { threadTitle: null, threadId: null, preSearches: undefined, changelog: undefined, feedback: undefined, streamResumption: undefined };
    }

    const options = threadBySlugQueryOptions(params.slug);
    const isServer = typeof window === 'undefined';

    // ensureQueryData internally checks staleTime and only fetches if data is stale/missing
    // @see https://tanstack.com/router/latest/docs/framework/react/guide/external-data-loading
    await queryClient.ensureQueryData(options);

    // Get thread ID from cached data for auxiliary fetches
    const cachedData = queryClient.getQueryData<GetThreadBySlugResponse>(options.queryKey);
    const threadId = cachedData?.success && cachedData.data?.thread?.id;
    const threadTitle = cachedData?.success && cachedData.data?.thread?.title ? cachedData.data.thread.title : null;

    // Auxiliary data: streamResumption, changelog, feedback, preSearches
    let preSearches;
    let changelog;
    let feedback;
    let streamResumption;

    if (threadId) {
      const streamOptions = streamResumptionQueryOptions(threadId);
      const changelogOptions = threadChangelogQueryOptions(threadId);
      const feedbackOptions = threadFeedbackQueryOptions(threadId);
      const preSearchesOptions = threadPreSearchesQueryOptions(threadId);

      if (isServer) {
        // ✅ SSR: Await all auxiliary data for proper hydration
        // useQuery doesn't return cached data on first SSR render, so pass via loaderData
        const [streamResult, changelogResult, feedbackResult, preSearchesResult] = await Promise.all([
          queryClient.ensureQueryData(streamOptions).catch(() => null),
          queryClient.ensureQueryData(changelogOptions).catch(() => null),
          queryClient.ensureQueryData(feedbackOptions).catch(() => null),
          queryClient.ensureQueryData(preSearchesOptions).catch(() => null),
        ]);

        streamResumption = streamResult?.success ? streamResult.data : undefined;
        changelog = changelogResult?.success ? changelogResult.data?.items : undefined;
        feedback = feedbackResult?.success ? feedbackResult.data?.feedback : undefined;
        preSearches = preSearchesResult?.success ? preSearchesResult.data?.items : undefined;
      } else {
        // ✅ SPA NAVIGATION: Use cached data immediately, prefetch missing in background
        // This makes thread creation navigation instant - no blocking on auxiliary data
        // Component handles missing data gracefully with ?? operators
        const cachedStream = queryClient.getQueryData<GetThreadStreamResumptionStateResponse>(streamOptions.queryKey);
        const cachedChangelog = queryClient.getQueryData<GetThreadChangelogResponse>(changelogOptions.queryKey);
        const cachedFeedback = queryClient.getQueryData<GetThreadFeedbackResponse>(feedbackOptions.queryKey);
        const cachedPreSearches = queryClient.getQueryData<GetThreadPreSearchesResponse>(preSearchesOptions.queryKey);

        // Use cached data if available
        streamResumption = cachedStream?.success ? cachedStream.data : undefined;
        changelog = cachedChangelog?.success ? cachedChangelog.data?.items : undefined;
        feedback = cachedFeedback?.success ? cachedFeedback.data?.feedback : undefined;
        preSearches = cachedPreSearches?.success ? cachedPreSearches.data?.items : undefined;

        // Prefetch missing data in background (non-blocking)
        if (!cachedStream)
          queryClient.prefetchQuery(streamOptions);
        if (!cachedChangelog)
          queryClient.prefetchQuery(changelogOptions);
        if (!cachedFeedback)
          queryClient.prefetchQuery(feedbackOptions);
        if (!cachedPreSearches)
          queryClient.prefetchQuery(preSearchesOptions);

        // ✅ STALE INFINITY FIX: Invalidate staleTime:Infinity queries on SPA navigation
        // Problem: staleTime: Infinity means TanStack Query never auto-refetches
        // Data changes happen BETWEEN visits (user navigates away during streaming)
        // Server invalidates KV cache but client TanStack Query cache stays stale
        // Solution: Invalidate queries to force fresh fetch on each visit
        // This ensures changelog accordion and pre-search results show correctly
        queryClient.invalidateQueries({ queryKey: changelogOptions.queryKey });
        queryClient.invalidateQueries({ queryKey: preSearchesOptions.queryKey });
      }
    }

    return { threadTitle, threadId, preSearches, changelog, feedback, streamResumption };
  },
  // Dynamic title from loader data
  head: ({ loaderData, params }) => {
    const siteUrl = getAppBaseUrl();
    const displayTitle = loaderData?.threadTitle
      ? `${loaderData.threadTitle} - Roundtable`
      : 'Chat - Roundtable';
    const displayDescription = loaderData?.threadTitle
      ? `View conversation: ${loaderData.threadTitle}`
      : 'View your AI conversation with multiple models.';
    return {
      meta: [
        { title: displayTitle },
        { name: 'description', content: displayDescription },
        { name: 'robots', content: 'noindex, nofollow' },
        { property: 'og:title', content: displayTitle },
        { property: 'og:description', content: displayDescription },
        { property: 'og:type', content: 'website' },
        { property: 'og:url', content: `${siteUrl}/chat/${params.slug}` },
        { property: 'og:site_name', content: 'Roundtable' },
        { name: 'twitter:card', content: 'summary' },
        { name: 'twitter:site', content: '@roundtablenow' },
        { name: 'twitter:title', content: displayTitle },
        { name: 'twitter:description', content: displayDescription },
      ],
      links: [
        { rel: 'canonical', href: `${siteUrl}/chat/${params.slug}` },
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

  // ✅ HOOKS FIX: Call all hooks unconditionally to comply with Rules of Hooks
  // useQuery with enabled:false won't fetch but satisfies hook ordering requirements
  // Use isPending instead of isLoading for React Query v5:
  // - isPending: no cached data yet (true even when enabled=false with no cache)
  // - isLoading: isPending AND isFetching (only true during active fetch)
  const { data: queryData, isPending, isError, error } = useQuery({
    ...threadBySlugQueryOptions(slug ?? ''),
    enabled: Boolean(slug), // Only fetch when slug is defined
  });

  // ✅ loaderData for auxiliary data (already prefetched in loader)
  const streamResumptionState = loaderData?.streamResumption ?? null;
  const changelog = loaderData?.changelog;
  const feedback = loaderData?.feedback;
  const preSearches = loaderData?.preSearches;

  const user = useMemo(() => ({
    id: session?.user?.id ?? '',
    name: session?.user?.name || 'You',
    image: session?.user?.image || null,
  }), [session?.user?.id, session?.user?.name, session?.user?.image]);

  // ✅ Conditional rendering AFTER all hooks are called
  // Show skeleton while slug is undefined or query is pending (no data yet)
  if (!slug || isPending) {
    return <ThreadContentSkeleton />;
  }

  // ✅ Handle query errors (e.g., network failure, server error)
  if (isError) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive">Error loading thread</h1>
          <p className="text-muted-foreground mt-2">
            {error?.message || 'An error occurred while loading the thread.'}
          </p>
        </div>
      </div>
    );
  }

  const threadData = queryData?.success ? queryData.data : null;

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
