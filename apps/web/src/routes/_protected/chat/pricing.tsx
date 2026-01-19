import { createFileRoute } from '@tanstack/react-router';

import { ChatPageHeader } from '@/components/chat/chat-header';
import { ChatPage } from '@/components/chat/chat-states';
import { PricingContentSkeleton } from '@/components/pricing/pricing-content-skeleton';
import { getAppBaseUrl } from '@/lib/config/base-urls';
import { productsQueryOptions, subscriptionsQueryOptions } from '@/lib/data/query-options';
import dynamic from '@/lib/utils/dynamic';

const pageTitle = 'Pricing & Plans - Roundtable';
const pageDescription = 'Choose the perfect plan for your AI collaboration needs. Compare features, credits, and pricing for Roundtable - from free tier to enterprise.';

/**
 * Pricing content skeleton - shown while PricingScreen loads
 * Renders inside the layout shell (sidebar handled by ChatLayoutShell)
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

// Dynamic import with ssr:false - shows skeleton during SSR and until component loads
const DynamicPricingScreen = dynamic(
  () => import('@/containers/screens/chat/billing/PricingScreen'),
  { ssr: false, loading: () => <PricingMainSkeleton /> },
);

export const Route = createFileRoute('/_protected/chat/pricing')({
  // SSR: Prefetch products and subscriptions for page load
  // Uses shared queryOptions to ensure SSR/client cache key consistency
  loader: async ({ context }) => {
    const { queryClient } = context;

    // Prefetch both products and subscriptions in parallel using shared queryOptions
    await Promise.all([
      queryClient.prefetchQuery(productsQueryOptions),
      queryClient.prefetchQuery(subscriptionsQueryOptions),
    ]);

    return {};
  },
  component: PricingRoute,
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

function PricingRoute() {
  return <DynamicPricingScreen />;
}
