import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';

import { BRAND } from '@/constants';
import PricingScreen from '@/containers/screens/chat/billing/PricingScreen';
import { getQueryClient } from '@/lib/data/query-client';
import { queryKeys } from '@/lib/data/query-keys';
import { getProductsService } from '@/services/api';
import { createMetadata } from '@/utils';

export async function generateMetadata(): Promise<Metadata> {
  return createMetadata({
    title: `Pricing - ${BRAND.fullName}`,
    description: 'Choose the perfect plan for your AI collaboration needs.',
    url: '/chat/pricing',
    robots: 'noindex, nofollow',
  });
}

/**
 * Pricing Page - Protected Route
 * Products prefetched with Infinity staleTime (static catalog)
 * Subscriptions already prefetched by protected layout
 */
export default async function PricingPage() {
  const queryClient = getQueryClient();

  try {
    await queryClient.prefetchQuery({
      queryKey: queryKeys.products.list(),
      queryFn: () => getProductsService(),
      staleTime: Infinity, // Products are static catalog data
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
