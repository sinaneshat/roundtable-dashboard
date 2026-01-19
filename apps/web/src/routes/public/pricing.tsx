import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { PublicChatLayout } from '@/components/layouts/public-chat-layout';
import { PricingContentSkeleton } from '@/components/pricing';
import { PublicPricingScreen } from '@/containers/screens/chat/billing/PublicPricingScreen';
import { getAppBaseUrl } from '@/lib/config/base-urls';

const pageTitle = 'Pricing - Roundtable';
const pageDescription = 'Choose your Roundtable plan - collaborative AI brainstorming with multiple AI models working together.';

// Validate optional priceId param for redirect after auth
const pricingSearchSchema = z.object({
  priceId: z.string().optional(),
});

function PublicPricingLoadingSkeleton() {
  return (
    <PublicChatLayout>
      <PricingContentSkeleton />
    </PublicChatLayout>
  );
}

export const Route = createFileRoute('/public/pricing')({
  validateSearch: pricingSearchSchema,
  component: PublicPricingPage,
  pendingComponent: PublicPricingLoadingSkeleton,
  // Enable preloading for faster navigation
  preload: true,
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
        { property: 'og:url', content: `${siteUrl}/pricing` },
        { property: 'og:image', content: `${siteUrl}/static/og-image.png` },
        // Twitter Card
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: pageTitle },
        { name: 'twitter:description', content: pageDescription },
        // SEO
        { name: 'robots', content: 'index, follow' },
      ],
      links: [
        { rel: 'canonical', href: `${siteUrl}/pricing` },
      ],
    };
  },
});

function PublicPricingPage() {
  return (
    <PublicChatLayout>
      <PublicPricingScreen />
    </PublicChatLayout>
  );
}
