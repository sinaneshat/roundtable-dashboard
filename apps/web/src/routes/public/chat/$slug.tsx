import { createFileRoute } from '@tanstack/react-router';

import { PublicChatSkeleton } from '@/components/loading';
import PublicChatThreadScreen from '@/containers/screens/chat/PublicChatThreadScreen';
import { getApiBaseUrl, getAppBaseUrl } from '@/lib/config/base-urls';
import { queryKeys } from '@/lib/data/query-keys';
import { STALE_TIMES } from '@/lib/data/stale-times';
import type { PublicThreadData } from '@/services/api';
import { getPublicThreadService } from '@/services/api';

export const Route = createFileRoute('/public/chat/$slug')({
  // NOTE: No route-level staleTime/gcTime - TanStack Query manages data freshness
  // @see https://tanstack.com/router/latest/docs/framework/react/guide/preloading#preloading-with-external-libraries
  //
  // ✅ SSR: Use ensureQueryData to guarantee data is available before rendering
  // prefetchQuery doesn't guarantee data and can cause "not found" flash during hydration
  loader: async ({ params, context }) => {
    const { queryClient } = context;

    // ensureQueryData guarantees data is in cache before component renders
    // This prevents the "content not found" flash during SSR hydration
    // TanStack Query's staleTime controls when data needs refetching
    const response = await queryClient.ensureQueryData({
      queryKey: queryKeys.threads.public(params.slug),
      queryFn: () => getPublicThreadService({ param: { slug: params.slug } }),
      staleTime: STALE_TIMES.publicThreadDetail,
    });

    // Extract data for head() metadata and component props
    const initialData: PublicThreadData | null = response?.success ? response.data : null;
    return { initialData };
  },
  // ISR: Cache for 1 hour, allow stale for 7 days while revalidating
  headers: () => ({
    'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=604800',
  }),
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
        { name: 'twitter:site', content: '@roundtablenow' },
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
  const { initialData } = Route.useLoaderData();

  // ✅ SSR HYDRATION: Use loader data directly - no client query needed
  // Data is guaranteed by ensureQueryData in loader, avoiding hydration flash
  // The screen component can still call usePublicThreadQuery for client-side updates
  return <PublicChatThreadScreen slug={slug} initialData={initialData} />;
}
