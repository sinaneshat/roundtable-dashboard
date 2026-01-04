import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';

import { BRAND } from '@/constants/brand';
import PricingScreen from '@/containers/screens/chat/billing/PricingScreen';
import { getQueryClient } from '@/lib/data/query-client';
import { queryKeys } from '@/lib/data/query-keys';
import { getProductsService } from '@/services/api';
import { createMetadata } from '@/utils';

// ISR: 24 hours - matches products cache duration
export const revalidate = 86400;

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

/**
 * Pricing Page - ISR with 24h revalidation
 * Prefetches products server-side with matching staleTime as client hook
 */
export default async function PricingPage() {
  const queryClient = getQueryClient();

  // Prefetch products with matching staleTime as useProductsQuery hook
  try {
    await queryClient.prefetchQuery({
      queryKey: queryKeys.products.list(),
      queryFn: () => getProductsService(),
      staleTime: Infinity, // Match client hook staleTime
    });
  } catch (error) {
    console.error('[PricingPage] Products prefetch failed:', error);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PricingScreen />
    </HydrationBoundary>
  );
}
