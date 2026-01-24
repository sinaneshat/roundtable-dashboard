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
import { rlog } from '@/lib/utils/dev-logger';
import type {
  GetThreadBySlugResponse,
  GetThreadFeedbackResponse,
  GetThreadStreamResumptionStateResponse,
} from '@/services/api';
import { useIsInCreationFlow } from '@/stores/chat';

export const Route = createFileRoute('/_protected/chat/$slug')({
  staleTime: 0,
  pendingMs: 300,

  loader: async ({ params, context }) => {
    const { queryClient } = context;

    if (!params.slug) {
      return {
        threadTitle: null,
        threadId: null,
        threadData: null,
        preSearches: undefined,
        changelog: undefined,
        feedback: undefined,
        streamResumption: undefined,
      };
    }

    const options = threadBySlugQueryOptions(params.slug);
    const isServer = typeof window === 'undefined';

    rlog.init('loader', `slug=${params.slug} server=${isServer ? 1 : 0}`);

    // Check cache for prefetched thread data (from flow-controller)
    const cachedThreadData = !isServer ? queryClient.getQueryData<GetThreadBySlugResponse>(options.queryKey) : null;
    const hasPrefetchMeta = cachedThreadData?.meta?.requestId === 'prefetch';

    // Early return when flow-controller prefetched data
    if (hasPrefetchMeta && cachedThreadData?.success) {
      const threadData = cachedThreadData.data;
      rlog.init('loader', `prefetch-hit: ${threadData.thread.slug} msgs=${threadData.messages.length}`);
      return {
        threadTitle: threadData.thread.title ?? null,
        threadId: threadData.thread.id ?? null,
        threadData,
        preSearches: undefined,
        changelog: undefined,
        feedback: undefined,
        streamResumption: undefined,
      };
    }

    try {
      await queryClient.ensureQueryData(options);
    } catch (error) {
      console.error('[ChatThread] Loader error:', error);
      return {
        threadTitle: null,
        threadId: null,
        threadData: null,
        preSearches: undefined,
        changelog: undefined,
        feedback: undefined,
        streamResumption: undefined,
      };
    }

    const cachedData = queryClient.getQueryData<GetThreadBySlugResponse>(options.queryKey);
    const threadId = cachedData?.success && cachedData.data?.thread?.id;
    const threadTitle = cachedData?.success && cachedData.data?.thread?.title ? cachedData.data.thread.title : null;

    rlog.init('loader', `ensured: ${threadTitle} msgs=${cachedData?.success ? cachedData.data.messages.length : 0}`);

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
        // On server, await all for proper hydration
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
        // On client, check cache first, then prefetch missing data
        const cachedChangelog = queryClient.getQueryData(changelogOptions.queryKey);
        const cachedPreSearches = queryClient.getQueryData(preSearchesOptions.queryKey);

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

        const cachedStream = queryClient.getQueryData<GetThreadStreamResumptionStateResponse>(streamOptions.queryKey);
        const cachedFeedback = queryClient.getQueryData<GetThreadFeedbackResponse>(feedbackOptions.queryKey);

        streamResumption = cachedStream?.success ? cachedStream.data : undefined;
        feedback = cachedFeedback?.success ? cachedFeedback.data?.feedback : undefined;

        // Prefetch missing auxiliary data in background
        if (!cachedStream)
          queryClient.prefetchQuery(streamOptions).catch(() => {});
        if (!cachedFeedback)
          queryClient.prefetchQuery(feedbackOptions).catch(() => {});
      }
    }

    const threadData = cachedData?.success ? cachedData.data : null;
    return {
      threadTitle,
      threadId,
      threadData,
      preSearches,
      changelog,
      feedback,
      streamResumption,
    };
  },

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

  component: ChatThreadRoute,
  pendingComponent: ThreadContentSkeleton,
});

function ChatThreadRoute() {
  const { slug } = Route.useParams();
  const { data: session } = useSession();
  const loaderData = Route.useLoaderData();

  const isInCreationFlow = useIsInCreationFlow();

  // Use loaderData.threadData as initialData for seamless SSR hydration
  const hasLoaderData = Boolean(loaderData?.threadData);
  const { data: queryData, isError, error, isFetching } = useQuery({
    ...threadBySlugQueryOptions(slug ?? ''),
    enabled: Boolean(slug) && !isInCreationFlow,
    initialData: hasLoaderData && loaderData.threadData
      ? { success: true as const, data: loaderData.threadData }
      : undefined,
    staleTime: hasLoaderData ? 10_000 : 0,
  });

  // Fallback pattern: loaderData first, then queryData
  const threadResponse = loaderData?.threadData ?? (queryData?.success ? queryData.data : null);
  const streamResumptionState = loaderData?.streamResumption ?? null;
  const changelog = loaderData?.changelog;
  const feedback = loaderData?.feedback;
  const preSearches = loaderData?.preSearches;

  rlog.init('route', `url=${slug} loaderData=${loaderData?.threadData?.thread?.slug ?? '-'}(${loaderData?.threadData?.messages?.length ?? 0}msg) queryData=${queryData?.success ? 'ok' : 'none'}`);

  const user = useMemo(() => ({
    id: session?.user?.id ?? '',
    name: session?.user?.name || 'You',
    image: session?.user?.image || null,
  }), [session?.user?.id, session?.user?.name, session?.user?.image]);

  // Show skeleton while fetching and no data yet
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

  rlog.init('route-pass', `thread=${thread.slug}(${thread.id?.slice(-8)}) msgs=${messages.length} parts=${participants.length}`);

  return (
    <ChatThreadScreen
      thread={thread}
      participants={participants}
      initialMessages={messages}
      slug={slug ?? ''}
      user={user}
      streamResumptionState={streamResumptionState}
      initialChangelog={changelog}
      initialFeedback={feedback}
      initialPreSearches={preSearches}
    />
  );
}
