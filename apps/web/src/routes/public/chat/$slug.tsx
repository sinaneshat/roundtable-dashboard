import { MessageRoles } from '@roundtable/shared';
import { createFileRoute } from '@tanstack/react-router';

import { PublicChatSkeleton } from '@/components/loading';
import PublicChatThreadScreen from '@/containers/screens/chat/PublicChatThreadScreen';
import { getApiBaseUrl, getAppBaseUrl } from '@/lib/config/base-urls';
import { queryKeys } from '@/lib/data/query-keys';
import { STALE_TIMES } from '@/lib/data/stale-times';
import type { ApiMessage, PublicThreadData } from '@/services/api';
import { getPublicThreadService } from '@/services/api';

/** Error states for public thread loading */
type PublicThreadErrorState = 'not_found' | 'no_longer_public' | null;

/** Loader data structure */
type PublicChatLoaderData = {
  initialData: PublicThreadData | null;
  roundCount: number;
  errorState: PublicThreadErrorState;
};

export const Route = createFileRoute('/public/chat/$slug')({
  // NOTE: No route-level staleTime/gcTime - TanStack Query manages data freshness
  // @see https://tanstack.com/router/latest/docs/framework/react/guide/preloading#preloading-with-external-libraries
  //
  // ✅ SSR: Use ensureQueryData to guarantee data is available before rendering
  // prefetchQuery doesn't guarantee data and can cause "not found" flash during hydration
  // @ts-expect-error TanStack Router generated types don't match loader return type after adding errorState
  loader: async ({ params, context }): Promise<PublicChatLoaderData> => {
    const { queryClient } = context;

    try {
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

      // Count user messages (rounds) for cache invalidation
      const roundCount = initialData?.messages?.filter((m: ApiMessage) => m.role === MessageRoles.USER).length ?? 0;

      return { initialData, roundCount, errorState: null as PublicThreadErrorState };
    } catch (error) {
      // ✅ GRACEFUL ERROR HANDLING: Catch API errors and return error state
      // This prevents 500 errors and allows showing user-friendly error pages
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check if thread was made private (410 Gone) or not found (404)
      const isNoLongerPublic = errorMessage.includes('no longer publicly available')
        || errorMessage.includes('410')
        || errorMessage.includes('gone');

      return {
        initialData: null,
        roundCount: 0,
        errorState: (isNoLongerPublic ? 'no_longer_public' : 'not_found') as PublicThreadErrorState,
      };
    }
  },
  // ✅ ISR CACHING: Long cache with tag-based invalidation
  // Cache invalidation handles visibility changes via KV tags
  // @ts-expect-error TanStack Router types don't include loaderData in headers context
  headers: (ctx: { loaderData?: PublicChatLoaderData }) => {
    const errorState = ctx.loaderData?.errorState;

    // ✅ NO CACHE FOR ERRORS: Don't cache private/not-found responses
    if (errorState) {
      return {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      };
    }

    // ISR cache - 1 day edge, 1 hour SWR
    // Cache invalidation handles visibility changes
    const roundCount = ctx.loaderData?.roundCount ?? 0;
    return {
      'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=3600',
      'ETag': `"rounds-${roundCount}"`,
    };
  },
  pendingComponent: PublicChatSkeleton,
  // ✅ SKELETON FLASH FIX: Only show pending component after 300ms
  pendingMs: 300,
  head: ({ loaderData, params }) => {
    const data = loaderData as PublicChatLoaderData | undefined;
    const errorState = data?.errorState;

    // ✅ ERROR PAGES: Don't index, minimal metadata
    if (errorState) {
      const title = errorState === 'no_longer_public'
        ? 'Conversation No Longer Public'
        : 'Conversation Not Found';
      return {
        meta: [
          { title: `${title} - Roundtable` },
          { name: 'robots', content: 'noindex, nofollow' },
        ],
      };
    }

    const thread = data?.initialData?.thread;
    const participants = data?.initialData?.participants || [];
    const messages = data?.initialData?.messages || [];

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
  const loaderData = Route.useLoaderData() as PublicChatLoaderData;
  const { initialData, errorState } = loaderData;

  // Direct render - no Suspense/lazy that would cause skeleton flash during hydration
  // pendingComponent handles navigation skeleton, loader ensures data is ready for SSR
  return <PublicChatThreadScreen slug={slug} initialData={initialData} errorState={errorState} />;
}
