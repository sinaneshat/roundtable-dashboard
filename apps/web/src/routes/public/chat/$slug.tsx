import { createFileRoute } from '@tanstack/react-router';

import { PublicChatSkeleton } from '@/components/loading';
import PublicChatThreadScreen from '@/containers/screens/chat/PublicChatThreadScreen';
import { usePublicThreadQuery } from '@/hooks/queries';
import { getApiBaseUrl, getAppBaseUrl } from '@/lib/config/base-urls';
import { queryKeys } from '@/lib/data/query-keys';
import { GC_TIMES, STALE_TIME_PRESETS, STALE_TIMES } from '@/lib/data/stale-times';
import type { PublicThreadData } from '@/services/api';
import { getPublicThreadService } from '@/services/api';

export const Route = createFileRoute('/public/chat/$slug')({
  // Prefetch public thread into QueryClient cache for SSR hydration
  loader: async ({ params, context }) => {
    const { queryClient } = context;

    // Prefetch into TanStack Query cache - component will use same queryKey
    await queryClient.prefetchQuery({
      queryKey: queryKeys.threads.public(params.slug),
      queryFn: () => getPublicThreadService({ param: { slug: params.slug } }),
      staleTime: STALE_TIMES.publicThreadDetail,
    });

    // Return cached data for head() metadata
    const cachedData = queryClient.getQueryData(queryKeys.threads.public(params.slug));
    // Type guard: check if cached data has expected shape
    const hasData = cachedData && typeof cachedData === 'object' && 'success' in cachedData && 'data' in cachedData;
    const initialData: PublicThreadData | null = hasData && cachedData.success ? cachedData.data as PublicThreadData : null;
    return { initialData };
  },
  // ISR: Cache for 1 hour, allow stale for 7 days while revalidating
  headers: () => ({
    'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=604800',
  }),
  // Client-side caching
  staleTime: STALE_TIME_PRESETS.long, // 5 minutes client-side fresh data
  gcTime: GC_TIMES.LONG, // 10 minutes garbage collection
  pendingComponent: PublicChatSkeleton,
  head: ({ loaderData, params }) => {
    const thread = loaderData?.initialData?.thread;
    const participants = loaderData?.initialData?.participants || [];
    const messages = loaderData?.initialData?.messages || [];

    const title = thread?.title || 'Shared AI Conversation';
    const modelCount = participants.length;
    const messageCount = messages.length;

    // Rich description with stats
    const description = thread?.title
      ? `"${thread.title}" - AI discussion with ${modelCount} model${modelCount !== 1 ? 's' : ''} and ${messageCount} message${messageCount !== 1 ? 's' : ''} on Roundtable`
      : 'View this collaborative AI brainstorming session on Roundtable';

    // Dynamic URLs based on environment
    const siteUrl = getAppBaseUrl();
    const apiUrl = getApiBaseUrl();
    const pageUrl = `${siteUrl}/public/chat/${params.slug}`;
    const ogImageUrl = `${apiUrl}/og/chat?slug=${params.slug}`;

    return {
      meta: [
        { title: `${title} - Roundtable` },
        { name: 'description', content: description },
        // Open Graph
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:type', content: 'article' },
        { property: 'og:url', content: pageUrl },
        { property: 'og:image', content: ogImageUrl },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:site_name', content: 'Roundtable' },
        // Twitter Card
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: title },
        { name: 'twitter:description', content: description },
        { name: 'twitter:image', content: ogImageUrl },
        // SEO
        { name: 'robots', content: 'index, follow' },
        // Article metadata
        { property: 'article:section', content: 'AI Conversations' },
      ],
      links: [
        { rel: 'canonical', href: pageUrl },
      ],
    };
  },
  component: PublicChatThread,
});

function PublicChatThread() {
  const { slug } = Route.useParams();

  // Use query hook - data is already in cache from loader prefetch
  const { data: queryData } = usePublicThreadQuery(slug);
  const threadData = queryData?.success ? queryData.data : null;

  return <PublicChatThreadScreen slug={slug} initialData={threadData} />;
}
