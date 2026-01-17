import { createFileRoute } from '@tanstack/react-router';
import { useMemo } from 'react';

import { ChatThreadSkeleton } from '@/components/loading';
import ChatThreadScreen from '@/containers/screens/chat/ChatThreadScreen';
import { useThreadBySlugQuery } from '@/hooks/queries';
import { useSession } from '@/lib/auth/client';
import { getThreadBySlugService, type GetThreadBySlugResponse } from '@/services/api';

// Extract success data type from discriminated union
type ThreadData = Extract<GetThreadBySlugResponse, { success: true }>['data'];

export const Route = createFileRoute('/_protected/chat/$slug')({
  // Loader fetches thread data for dynamic title
  loader: async ({ params }) => {
    try {
      const response = await getThreadBySlugService({ param: { slug: params.slug } });
      if (response.success) {
        return { threadData: response.data };
      }
      return { threadData: null };
    } catch {
      return { threadData: null };
    }
  },
  pendingComponent: ChatThreadSkeleton,
  // Dynamic title from loader data
  head: ({ loaderData }) => {
    const title = loaderData?.threadData?.thread?.title;
    const displayTitle = title ? `${title} - Roundtable` : 'Chat - Roundtable';
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
  const { threadData: loaderThreadData } = Route.useLoaderData();
  const { data: session } = useSession();

  // Use loader data first, fallback to React Query for updates
  const { data: queryData, isLoading, isError, error } = useThreadBySlugQuery(
    slug,
    !loaderThreadData, // Only fetch if no loader data
  );

  const threadData = loaderThreadData || (queryData?.success ? queryData.data : null);

  const user = useMemo(() => ({
    name: session?.user?.name || 'You',
    image: session?.user?.image || null,
  }), [session?.user?.name, session?.user?.image]);

  // Only show loading if no data at all
  if (isLoading && !threadData) {
    return <ChatThreadSkeleton />;
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
    />
  );
}
