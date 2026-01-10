import type { Metadata } from 'next';

import { BRAND } from '@/constants';
import { PublicPricingScreen } from '@/containers/screens/chat/billing/PublicPricingScreen';
import { createMetadata } from '@/utils';

// Revalidate every 24 hours
export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  return createMetadata({
    title: `Pricing - ${BRAND.name}`,
    description: 'Start free or go Pro. Access ChatGPT, Claude, Gemini and more AI models in one conversation. Compare Roundtable pricing plans.',
    url: '/chat/pricing',
    robots: 'index, follow',
    keywords: [
      'AI chat pricing',
      'ChatGPT alternative',
      'multi-model AI',
      'AI collaboration tool',
      'Roundtable pricing',
    ],
  });
}

export default function PricingPage() {
  return <PublicPricingScreen />;
}
