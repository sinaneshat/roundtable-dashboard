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
  GetThreadFeedbackResponse,
  GetThreadStreamResumptionStateResponse,
} from '@/services/api';
import { useIsInCreationFlow } from '@/stores/chat';

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

    // ✅ FIX: Check cache FIRST for SPA navigation (flow-controller pre-populates cache)
    // For threadDetail with staleTime: 0, ensureQueryData always refetches even with cache.
    // Skip fetch if cache exists AND has prefetch meta (indicating fresh data from flow-controller)
    const cachedThreadData = !isServer ? queryClient.getQueryData<GetThreadBySlugResponse>(options.queryKey) : null;
    const hasPrefetchMeta = cachedThreadData?.meta?.requestId === 'prefetch';

    // ✅ FIX: Early return when flow-controller prefetched data - skip all auxiliary fetches
    // During creation flow, thread data is fresh and no auxiliary data exists yet
    if (hasPrefetchMeta) {
      const threadData = cachedThreadData?.success ? cachedThreadData.data : null;
      return {
        threadTitle: threadData?.thread?.title ?? null,
        threadId: threadData?.thread?.id ?? null,
        threadData,
        preSearches: undefined,
        changelog: undefined,
        feedback: undefined,
        streamResumption: undefined,
      };
    }

    // ensureQueryData internally checks staleTime and only fetches if data is stale/missing
    // @see https://tanstack.com/router/latest/docs/framework/react/guide/external-data-loading
    // ✅ FIX: Wrap in try-catch to handle SSR errors gracefully (e.g., 401 unauthorized)
    // On error, return empty data and let component handle via useQuery
    try {
      await queryClient.ensureQueryData(options);
    } catch (error) {
      console.error('[ChatThread] Loader error:', error);
      // Return empty loader data - component will re-fetch via useQuery
      return { threadTitle: null, threadId: null, preSearches: undefined, changelog: undefined, feedback: undefined, streamResumption: undefined };
    }

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
        // ✅ SPA NAVIGATION: Check cache FIRST before ensureQueryData
        // - New thread: flow-controller pre-populates cache → use cached data (no network)
        // - Existing thread: fetches if cache empty/invalidated, uses cache if valid
        // - Thread→Thread: Previous thread cache invalidated by leaveThread pattern
        const cachedChangelog = queryClient.getQueryData(changelogOptions.queryKey);
        const cachedPreSearches = queryClient.getQueryData(preSearchesOptions.queryKey);

        // ✅ FIX: Only fetch what's NOT already in cache
        const [changelogResult, preSearchesResult] = await Promise.all([
          cachedChangelog
            ? Promise.resolve(cachedChangelog)
            : queryClient.ensureQueryData(changelogOptions).catch(() => null),
          cachedPreSearches
            ? Promise.resolve(cachedPreSearches)
            : queryClient.ensureQueryData(preSearchesOptions).catch(() => null),
        ]);
        changelog = changelogResult?.success ? changelogResult.data?.items : undefined;
        preSearches = preSearchesResult?.success ? preSearchesResult.data?.items : undefined;

        // Other auxiliary data - use cache + prefetch pattern (non-blocking)
        const cachedStream = queryClient.getQueryData<GetThreadStreamResumptionStateResponse>(streamOptions.queryKey);
        const cachedFeedback = queryClient.getQueryData<GetThreadFeedbackResponse>(feedbackOptions.queryKey);

        streamResumption = cachedStream?.success ? cachedStream.data : undefined;
        feedback = cachedFeedback?.success ? cachedFeedback.data?.feedback : undefined;

        if (!cachedStream)
          queryClient.prefetchQuery(streamOptions);
        if (!cachedFeedback)
          queryClient.prefetchQuery(feedbackOptions);
      }
    }

    // Return threadData from loader for SSR - useQuery doesn't have access to server-prefetched data on first render
    const threadData = cachedData?.success ? cachedData.data : null;
    return { threadTitle, threadId, threadData, preSearches, changelog, feedback, streamResumption };
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

  // ✅ FIX: Check if we're in creation flow - data already in store, no need to fetch
  const isInCreationFlow = useIsInCreationFlow();

  // Use loaderData as primary source (available on SSR)
  // useQuery provides client-side updates/refetches
  // ✅ SKELETON FLASH FIX: When loaderData has threadData (from SSR or prefetch cache),
  // use it as initialData and extend staleTime to prevent immediate refetch
  const hasLoaderData = Boolean(loaderData?.threadData);
  const { data: queryData, isError, error, isFetching } = useQuery({
    ...threadBySlugQueryOptions(slug ?? ''),
    // ✅ FIX: Disable query during creation flow - data already in Zustand store
    enabled: Boolean(slug) && !isInCreationFlow,
    // ✅ FIX: Use loader data as initial data to prevent flash
    initialData: hasLoaderData && loaderData.threadData
      ? { success: true as const, data: loaderData.threadData }
      : undefined,
    // ✅ FIX: Extend staleTime when data came from loader to prevent immediate refetch
    // 10s grace period for fresh data - thread detail will be refetched on subsequent navigations
    staleTime: hasLoaderData ? 10_000 : 0,
  });

  // Prefer loader data (SSR/prefetch), fall back to query data (client updates)
  // During creation flow, loader should have prefetch cache data from flow-controller
  const threadResponse = loaderData?.threadData ?? (queryData?.success ? queryData.data : null);

  // loaderData for auxiliary data (already prefetched in loader)
  const streamResumptionState = loaderData?.streamResumption ?? null;
  const changelog = loaderData?.changelog;
  const feedback = loaderData?.feedback;
  const preSearches = loaderData?.preSearches;

  const user = useMemo(() => ({
    id: session?.user?.id ?? '',
    name: session?.user?.name || 'You',
    image: session?.user?.image || null,
  }), [session?.user?.id, session?.user?.name, session?.user?.image]);

  // Show skeleton only when:
  // 1. No slug (invalid route state)
  // 2. No thread data from loader AND currently fetching (initial client load without SSR)
  if (!slug || (!threadResponse && isFetching)) {
    return <ThreadContentSkeleton />;
  }

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

  if (!threadResponse) {
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

  const { thread, participants, messages } = threadResponse;

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
