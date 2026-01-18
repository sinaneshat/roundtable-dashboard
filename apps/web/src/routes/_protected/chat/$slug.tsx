import { createFileRoute } from '@tanstack/react-router';
import { useMemo } from 'react';

import { ChatThreadSkeleton } from '@/components/loading';
import ChatThreadScreen from '@/containers/screens/chat/ChatThreadScreen';
import { useThreadBySlugQuery } from '@/hooks/queries';
import { useSession } from '@/lib/auth/client';
import { queryKeys } from '@/lib/data/query-keys';
import { STALE_TIMES } from '@/lib/data/stale-times';
import { getThreadBySlug } from '@/server/thread';
import type { GetThreadBySlugResponse } from '@/services/api';

export const Route = createFileRoute('/_protected/chat/$slug')({
  // Prefetch thread data into QueryClient cache for SSR hydration
  loader: async ({ params, context }) => {
    const { queryClient } = context;

    // Prefetch into TanStack Query cache - component will use same queryKey
    // Server function handles cookie forwarding via getRequest()
    await queryClient.prefetchQuery({
      queryKey: queryKeys.threads.bySlug(params.slug),
      queryFn: () => getThreadBySlug({ data: params.slug }),
      staleTime: STALE_TIMES.threadDetail,
    });

    // Return minimal loader data for head() - actual data comes from QueryClient
    const cachedData = queryClient.getQueryData<GetThreadBySlugResponse>(queryKeys.threads.bySlug(params.slug));
    return { threadTitle: cachedData?.success && cachedData.data?.thread?.title ? cachedData.data.thread.title : null };
  },
  pendingComponent: ChatThreadSkeleton,
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
  component: ChatThreadRoute,
});

function ChatThreadRoute() {
  const { slug } = Route.useParams();
  const { data: session } = useSession();

  // Use query hook - data is already in cache from loader prefetch
  const { data: queryData, isError, error } = useThreadBySlugQuery(slug);

  const threadData = queryData?.success ? queryData.data : null;

  const user = useMemo(() => ({
    id: session?.user?.id ?? '',
    name: session?.user?.name || 'You',
    image: session?.user?.image || null,
  }), [session?.user?.id, session?.user?.name, session?.user?.image]);

  if (isError || !threadData) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive">Thread not found</h1>
          <p className="text-muted-foreground mt-2">
            {error?.message || 'The conversation you are looking for does not exist.'}
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
    />
  );
}
