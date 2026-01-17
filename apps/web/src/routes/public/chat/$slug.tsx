import { createFileRoute } from '@tanstack/react-router';

import { PublicChatSkeleton } from '@/components/loading';
import PublicChatThreadScreen from '@/containers/screens/chat/PublicChatThreadScreen';
import { getPublicThread } from '@/server/public-thread';

const siteUrl = 'https://roundtable.now';

export const Route = createFileRoute('/public/chat/$slug')({
  loader: async ({ params }) => {
    const data = await getPublicThread(params.slug);
    return { initialData: data };
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

    const pageUrl = `${siteUrl}/public/chat/${params.slug}`;
    const ogImageUrl = `${siteUrl}/api/og/chat?slug=${params.slug}`;

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
  const { initialData } = Route.useLoaderData();

  return <PublicChatThreadScreen slug={slug} initialData={initialData} />;
}
