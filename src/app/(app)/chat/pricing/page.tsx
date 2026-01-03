import type { Metadata } from 'next';
import { cacheLife } from 'next/cache';

import { BRAND } from '@/constants/brand';
import PricingScreen from '@/containers/screens/chat/billing/PricingScreen';
import { createMetadata } from '@/utils';

export async function generateMetadata(): Promise<Metadata> {
  return createMetadata({
    title: `Pricing - ${BRAND.fullName}`,
    description: 'Choose the perfect plan for your AI collaboration needs. Flexible pricing for teams of all sizes with multiple AI models working together.',
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

export default async function PricingPage() {
  'use cache';
  cacheLife('hours');

  return <PricingScreen />;
}
