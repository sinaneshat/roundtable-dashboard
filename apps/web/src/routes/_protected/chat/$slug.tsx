import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo } from 'react';

import { ThreadContentSkeleton } from '@/components/skeletons';
import ChatThreadScreen from '@/containers/screens/chat/ChatThreadScreen';
import { useSession } from '@/lib/auth/client';
import { getAppBaseUrl } from '@/lib/config/base-urls';
import { threadBySlugQueryOptions } from '@/lib/data/query-options';
import { useTranslations } from '@/lib/i18n';
import { createEmptyLoaderData, fetchThreadData } from '@/lib/loaders';
import { rlog } from '@/lib/utils/dev-logger';

export const Route = createFileRoute('/_protected/chat/$slug')({
  component: ChatThreadRoute,
  loader: async ({ params, context }) => {
    const { queryClient } = context;

    if (!params.slug) {
      return createEmptyLoaderData();
    }

    const isServer = typeof window === 'undefined';

    return fetchThreadData({
      queryClient,
      slug: params.slug,
      isServer,
      loaderContext: 'ChatThread',
    });
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

  pendingComponent: ThreadContentSkeleton,

  pendingMs: 300,
  // SSR FIX: Use reasonable staleTime to prevent flash from route loader refetch race
  // Route loader data is hydrated first, useQuery with initialData prevents double-fetch
  staleTime: 30_000,
});

function ChatThreadRoute() {
  const t = useTranslations();
  const { slug } = Route.useParams();
  const { data: session } = useSession();
  const loaderData = Route.useLoaderData();

  // Use loaderData.threadData as initialData for seamless SSR hydration
  // CRITICAL: Only consider loader data valid if it has messages - prevents blank screen
  // when sidebar prefetch caches "shell" data (thread metadata without messages)
  const hasValidLoaderData = Boolean(
    loaderData?.threadData?.messages?.length && loaderData.threadData.messages.length > 0,
  );
  const { data: queryData, error, isError, isFetching } = useQuery({
    ...threadBySlugQueryOptions(slug ?? ''),
    enabled: Boolean(slug),
    initialData: hasValidLoaderData && loaderData.threadData
      ? { data: loaderData.threadData, success: true as const }
      : undefined,
    staleTime: hasValidLoaderData ? 10_000 : 0,
  });

  // CRITICAL FIX: Use hasValidLoaderData to decide fallback, not nullish coalescing
  // ?? only checks for null/undefined, but empty loaderData.threadData (0 messages) should NOT be used
  const threadResponse = hasValidLoaderData && loaderData?.threadData
    ? loaderData.threadData
    : (queryData?.success ? queryData.data : null);
  const changelog = loaderData?.changelog;
  const feedback = loaderData?.feedback;
  const preSearches = loaderData?.preSearches;

  // Debug: Log data source selection (parity with project-route)
  const dataSource = hasValidLoaderData ? 'loader' : (queryData?.success ? 'query' : 'none');
  rlog.init('normal-route', `url=${slug} source=${dataSource} loaderValid=${hasValidLoaderData} loaderMsgs=${loaderData?.threadData?.messages?.length ?? 0} queryOk=${queryData?.success ?? false} queryMsgs=${queryData?.success ? queryData.data?.messages?.length ?? 0 : 0}`);

  const user = useMemo(() => ({
    id: session?.user?.id ?? '',
    image: session?.user?.image || null,
    name: session?.user?.name || 'You',
  }), [session?.user?.id, session?.user?.name, session?.user?.image]);

  // Show skeleton while fetching and no data yet
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

  // Key forces remount on thread change, preventing stale store hydration
  return (
    <ChatThreadScreen
      key={thread.id}
      thread={thread}
      participants={participants}
      initialMessages={messages}
      slug={slug ?? ''}
      user={user}
      initialChangelog={changelog}
      initialFeedback={feedback}
      initialPreSearches={preSearches}
    />
  );
}
