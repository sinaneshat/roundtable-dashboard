import { createFileRoute } from '@tanstack/react-router';

import { ChatPage } from '@/components/chat/chat-states';
import { ChatPageHeader } from '@/components/chat/chat-header';
import { PricingContentSkeleton } from '@/components/pricing/pricing-content-skeleton';
import PricingScreen from '@/containers/screens/chat/billing/PricingScreen';

const siteUrl = 'https://roundtable.now';
const pageTitle = 'Pricing & Plans - Roundtable';
const pageDescription = 'Choose the perfect plan for your AI collaboration needs. Compare features, credits, and pricing for Roundtable - from free tier to enterprise.';

function PricingLoadingSkeleton() {
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
  component: PricingScreen,
  pendingComponent: PricingLoadingSkeleton,
  headers: () => ({
    'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
  }),
  head: () => ({
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
  }),
});
