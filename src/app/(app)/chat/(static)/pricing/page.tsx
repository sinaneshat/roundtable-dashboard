import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';

import { BRAND } from '@/constants/brand';
import PricingScreen from '@/containers/screens/chat/billing/PricingScreen';
import { getQueryClient } from '@/lib/data/query-client';
import { queryKeys } from '@/lib/data/query-keys';
import { getProductsService } from '@/services/api';
import { createMetadata } from '@/utils';

// ISR: Regenerate every hour while serving stale content
export const revalidate = 3600;

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
  const queryClient = getQueryClient();

  // ISR: Prefetch products, regenerate hourly
  await queryClient.prefetchQuery({
    queryKey: queryKeys.products.list(),
    queryFn: getProductsService,
    staleTime: 3600 * 1000, // 1 hour in milliseconds
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PricingScreen />
    </HydrationBoundary>
  );
}
