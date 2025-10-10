import type { Metadata } from 'next';

import { BRAND } from '@/constants/brand';
import { PricingModalScreen } from '@/containers/screens/chat/billing';
import { createMetadata } from '@/utils/metadata';

/**
 * Generate metadata for pricing modal
 */
export async function generateMetadata(): Promise<Metadata> {
  return createMetadata({
    title: `Pricing - ${BRAND.fullName}`,
    description: 'View pricing plans and subscription options for AI collaboration.',
    robots: 'noindex, nofollow', // Modal - don't index
    keywords: [
      'AI pricing',
      'subscription plans',
      'AI collaboration pricing',
    ],
  });
}

/**
 * Intercepted Modal Route for Pricing - Server Component
 *
 * Shown when navigating from chat to /chat/pricing
 * Uses Next.js intercepting routes pattern with (.) prefix
 * Displays available products and pricing options in a modal
 */
export default async function PricingModalPage() {
  return <PricingModalScreen />;
}
