import type { Metadata } from 'next';

import { BRAND } from '@/constants/brand';
import PricingScreen from '@/containers/screens/chat/billing/PricingScreen';
import { createMetadata } from '@/utils/metadata';

// SSG: Generate at build time only, never revalidate
// Products data loads client-side via TanStack Query (API requires runtime)
export const dynamic = 'force-static';

export async function generateMetadata(): Promise<Metadata> {
  return createMetadata({
    title: `Pricing - ${BRAND.fullName}`,
    description: 'Choose the perfect plan for your AI collaboration needs. Flexible pricing for teams of all sizes with multiple AI models working together.',
    robots: 'noindex, nofollow',
    url: '/chat/pricing',
    canonicalUrl: '/chat/pricing',
    image: '/chat/pricing/opengraph-image',
    keywords: [
      'AI pricing',
      'subscription plans',
      'AI collaboration pricing',
      'team pricing',
      'AI models subscription',
    ],
  });
}

export default function PricingPage() {
  return <PricingScreen />;
}
