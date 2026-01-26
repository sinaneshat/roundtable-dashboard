import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo } from 'react';

import { ThreadContentSkeleton } from '@/components/skeletons';
import ChatThreadScreen from '@/containers/screens/chat/ChatThreadScreen';
import { useSession } from '@/lib/auth/client';
import { getAppBaseUrl } from '@/lib/config/base-urls';
import {
  projectQueryOptions,
  streamResumptionQueryOptions,
  threadBySlugQueryOptions,
  threadChangelogQueryOptions,
  threadFeedbackQueryOptions,
  threadPreSearchesQueryOptions,
} from '@/lib/data/query-options';
import { useTranslations } from '@/lib/i18n';
import type {
  GetProjectResponse,
  GetThreadBySlugResponse,
  GetThreadFeedbackResponse,
  GetThreadStreamResumptionStateResponse,
} from '@/services/api';
import { useIsInCreationFlow } from '@/stores/chat';

export const Route = createFileRoute('/_protected/chat/projects/$projectId/$slug')({
  component: ProjectThreadRoute,
  loader: async ({ params, context }) => {
    const { queryClient } = context;
    const isServer = typeof window === 'undefined';

    // Load project data for breadcrumbs
    let projectName: string | null = null;
    if (params.projectId) {
      const projectOptions = projectQueryOptions(params.projectId);
      try {
        await queryClient.ensureQueryData(projectOptions);
        const projectData = queryClient.getQueryData<GetProjectResponse>(projectOptions.queryKey);
        projectName = projectData?.success ? projectData.data?.name ?? null : null;
      } catch {
        // Project fetch failed, continue without project name
      }
    }

    if (!params.slug) {
      return {
        projectName,
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

    // Check cache for prefetched thread data
    const cachedThreadData = !isServer ? queryClient.getQueryData<GetThreadBySlugResponse>(options.queryKey) : null;
    const hasPrefetchMeta = cachedThreadData?.meta?.requestId === 'prefetch';

    // Early return when flow-controller prefetched data
    if (hasPrefetchMeta) {
      const threadData = cachedThreadData?.success ? cachedThreadData.data : null;
      return {
        projectName,
        threadTitle: threadData?.thread?.title ?? null,
        threadId: threadData?.thread?.id ?? null,
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
      console.error('[ProjectThread] Loader error:', error);
      return {
        projectName,
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
        const [streamResult, changelogResult, feedbackResult, preSearchesResult] = await Promise.all([
          queryClient.ensureQueryData(streamOptions).catch(() => null),
          queryClient.ensureQueryData(changelogOptions).catch(() => null),
          queryClient.ensureQueryData(feedbackOptions).catch(() => null),
          queryClient.ensureQueryData(preSearchesOptions).catch(() => null),
        ]);

        streamResumption = streamResult?.success ? streamResult.data : undefined;
        changelog = changelogResult?.success ? changelogResult.data?.items : undefined;
        feedback = feedbackResult?.success ? feedbackResult.data : undefined;
        preSearches = preSearchesResult?.success ? preSearchesResult.data?.items : undefined;
      } else {
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
        feedback = cachedFeedback?.success ? cachedFeedback.data : undefined;

        if (!cachedStream) {
          queryClient.prefetchQuery(streamOptions).catch(() => {});
        }
        if (!cachedFeedback) {
          queryClient.prefetchQuery(feedbackOptions).catch(() => {});
        }
      }
    }

    const threadData = cachedData?.success ? cachedData.data : null;
    return {
      projectName,
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
        { property: 'og:url', content: `${siteUrl}/chat/projects/${params.projectId}/${params.slug}` },
        { property: 'og:site_name', content: 'Roundtable' },
        { name: 'twitter:card', content: 'summary' },
        { name: 'twitter:site', content: '@roundtablenow' },
        { name: 'twitter:title', content: displayTitle },
        { name: 'twitter:description', content: displayDescription },
      ],
      links: [
        { rel: 'canonical', href: `${siteUrl}/chat/projects/${params.projectId}/${params.slug}` },
      ],
    };
  },

  pendingComponent: ThreadContentSkeleton,

  pendingMs: 300,
  // SSR FIX: Use reasonable staleTime to prevent flash from route loader refetch race
  // Route loader data is hydrated first, useQuery with initialData prevents double-fetch
  staleTime: 30_000,
});

function ProjectThreadRoute() {
  const t = useTranslations();
  const { slug } = Route.useParams();
  const { data: session } = useSession();
  const loaderData = Route.useLoaderData();

  const isInCreationFlow = useIsInCreationFlow();

  const hasLoaderData = Boolean(loaderData?.threadData);
  const { data: queryData, error, isError, isFetching } = useQuery({
    ...threadBySlugQueryOptions(slug ?? ''),
    enabled: Boolean(slug) && !isInCreationFlow,
    initialData: hasLoaderData && loaderData.threadData
      ? { data: loaderData.threadData, success: true as const }
      : undefined,
    staleTime: hasLoaderData ? 10_000 : 0,
  });

  const threadResponse = loaderData?.threadData ?? (queryData?.success ? queryData.data : null);
  const streamResumptionState = loaderData?.streamResumption ?? null;
  const changelog = loaderData?.changelog;
  const feedback = loaderData?.feedback;
  const preSearches = loaderData?.preSearches;

  const user = useMemo(() => ({
    id: session?.user?.id ?? '',
    image: session?.user?.image || null,
    name: session?.user?.name || 'You',
  }), [session?.user?.id, session?.user?.name, session?.user?.image]);

  if (!slug || (!threadResponse && isFetching)) {
    return <ThreadContentSkeleton />;
  }

  if (isError) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive">{t('chat.errors.loadingThread')}</h1>
          <p className="text-muted-foreground mt-2">
            {error?.message || t('chat.errors.loadingThreadDescription')}
          </p>
        </div>
      </div>
    );
  }

  if (!threadResponse) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive">{t('chat.errors.threadNotFound')}</h1>
          <p className="text-muted-foreground mt-2">
            {t('chat.errors.threadNotFoundDescription')}
          </p>
        </div>
      </div>
    );
  }

  const { messages, participants, thread } = threadResponse;

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
