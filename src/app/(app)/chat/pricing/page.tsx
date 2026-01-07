/**
 * Pricing Page - Static Generation with ISR
 *
 * Shows product catalog for all users.
 * Auth is optional (handled in layout).
 * Products are prefetched in layout.
 */

import type { Metadata } from 'next';

import { BRAND } from '@/constants';
import { PublicPricingScreen } from '@/containers/screens/chat/billing/PublicPricingScreen';
import { createMetadata } from '@/utils';

// Revalidate every 24 hours
export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  return createMetadata({
    title: `Pricing - ${BRAND.fullName}`,
    description: 'Choose the perfect plan for your AI collaboration needs. Compare plans and start your journey with Roundtable.',
    url: '/chat/pricing',
    robots: 'index, follow',
  });
}

export default function PricingPage() {
  return <PublicPricingScreen />;
}
