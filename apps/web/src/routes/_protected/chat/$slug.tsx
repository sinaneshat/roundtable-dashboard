import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo } from 'react';

import { ThreadContentSkeleton } from '@/components/skeletons';
import { useSession } from '@/lib/auth/client';
import { threadBySlugQueryOptions } from '@/lib/data/query-options';
import dynamic from '@/lib/utils/dynamic';
import { getStreamResumptionState } from '@/server/thread';
import type { GetThreadBySlugResponse, ThreadStreamResumptionState } from '@/services/api';

// Dynamic import with ssr:false - shows skeleton during SSR and until component loads
const ChatThreadScreen = dynamic(
  () => import('@/containers/screens/chat/ChatThreadScreen'),
  { ssr: false, loading: () => <ThreadContentSkeleton /> },
);

export const Route = createFileRoute('/_protected/chat/$slug')({
  // Prefetch thread data and stream resumption state for SSR hydration
  // Uses shared queryOptions to ensure consistent caching between server and client
  loader: async ({ params, context }) => {
    const { queryClient } = context;
    const options = threadBySlugQueryOptions(params.slug);

    // ensureQueryData returns cached data or fetches if not available
    // Using shared queryOptions guarantees same config in loader and hooks
    await queryClient.ensureQueryData(options);

    // Get thread ID from cached data for stream status fetch
    const cachedData = queryClient.getQueryData<GetThreadBySlugResponse>(options.queryKey);
    const threadId = cachedData?.success && cachedData.data?.thread?.id;
    const threadTitle = cachedData?.success && cachedData.data?.thread?.title ? cachedData.data.thread.title : null;

    // Fetch stream resumption state in parallel if thread exists
    // This pre-fills the store with active stream info to prevent content flash
    let streamResumptionState: ThreadStreamResumptionState | null = null;
    if (threadId) {
      try {
        const streamStatus = await getStreamResumptionState({ data: threadId });
        if (streamStatus.success && streamStatus.data) {
          streamResumptionState = streamStatus.data;
        }
      } catch {
        // Stream status fetch is optional - continue without it
      }
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
  component: ChatThreadRoute,
});

function ChatThreadRoute() {
  const { slug } = Route.useParams();
  const { data: session } = useSession();
  const loaderData = Route.useLoaderData();

  // Use shared query options - data is already in cache from loader prefetch
  // Using same queryOptions as loader ensures no hydration mismatch or refetch
  const { data: queryData, isError, error, isPending } = useQuery(threadBySlugQueryOptions(slug));

  const threadData = queryData?.success ? queryData.data : null;

  const user = useMemo(() => ({
    id: session?.user?.id ?? '',
    name: session?.user?.name || 'You',
    image: session?.user?.image || null,
  }), [session?.user?.id, session?.user?.name, session?.user?.image]);

  // ✅ FIX: Don't show error while loading - route's pendingComponent handles loading
  // Only show error when query has completed (not pending) and there's no data
  if (isPending) {
    // Route's pendingComponent (ChatThreadSkeleton) should handle this,
    // but return null as fallback to prevent "not found" flash
    return null;
  }

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
      streamResumptionState={loaderData.streamResumptionState}
    />
  );
}
