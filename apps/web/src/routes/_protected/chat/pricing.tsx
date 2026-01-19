import { createFileRoute } from '@tanstack/react-router';

import { ChatPageHeader } from '@/components/chat/chat-header';
import { ChatPage } from '@/components/chat/chat-states';
import { PricingContentSkeleton } from '@/components/pricing/pricing-content-skeleton';
import PricingScreen from '@/containers/screens/chat/billing/PricingScreen';
import { getAppBaseUrl } from '@/lib/config/base-urls';
import { productsQueryOptions, subscriptionsQueryOptions } from '@/lib/data/query-options';

const pageTitle = 'Pricing & Plans - Roundtable';
const pageDescription = 'Choose the perfect plan for your AI collaboration needs. Compare features, credits, and pricing for Roundtable - from free tier to enterprise.';

/**
 * Pricing content skeleton - shown during route transitions
 * Used as pendingComponent for route-level loading states
 */
function PricingMainSkeleton() {
  return (
    <ChatPage>
      <ChatPageHeader
        title="Pricing & Plans"
        description="Choose the perfect plan for your needs"
      />
      <PricingContentSkeleton />
    </ChatPage>
  );
}

export const Route = createFileRoute('/_protected/chat/pricing')({
  // SSR: Prefetch products and subscriptions for page load
  // Uses shared queryOptions to ensure SSR/client cache key consistency
  // ensureQueryData waits for data before rendering - no skeleton flash
  loader: async ({ context }) => {
    const { queryClient } = context;

    // ensureQueryData waits for data and returns it - ensures data is ready before render
    // This is the key difference from prefetchQuery - it BLOCKS rendering until data is available
    await Promise.all([
      queryClient.ensureQueryData(productsQueryOptions),
      queryClient.ensureQueryData(subscriptionsQueryOptions),
    ]);

    return {};
  },
  // ✅ SSR: Direct import - component renders on server with prefetched data
  // NO dynamic import - React.lazy doesn't work on server, causes skeleton flash
  component: PricingScreen,
  // Skeleton only shown during route transitions (client-side navigation)
  pendingComponent: PricingMainSkeleton,
  headers: () => ({
    'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
  }),
  head: () => {
    const siteUrl = getAppBaseUrl();
    return {
      meta: [
        { title: pageTitle },
        { name: 'description', content: pageDescription },
        // Open Graph
        { property: 'og:title', content: pageTitle },
        { property: 'og:description', content: pageDescription },
        { property: 'og:type', content: 'website' },
        { property: 'og:url', content: `${siteUrl}/chat/pricing` },
        { property: 'og:image', content: `${siteUrl}/static/og-image.png` },
        { property: 'og:site_name', content: 'Roundtable' },
        // Twitter Card
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: pageTitle },
        { name: 'twitter:description', content: pageDescription },
        { name: 'twitter:image', content: `${siteUrl}/static/og-image.png` },
        // SEO
        { name: 'robots', content: 'index, follow' },
      ],
      links: [
        { rel: 'canonical', href: `${siteUrl}/chat/pricing` },
      ],
    };
  },
});
