import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';

import { BRAND } from '@/constants/brand';
import PricingScreen from '@/containers/screens/chat/billing/PricingScreen';
import { getQueryClient } from '@/lib/data/query-client';
import { queryKeys } from '@/lib/data/query-keys';
import { getProductsService } from '@/services/api';
import { createMetadata } from '@/utils';

// ISR: Build at runtime on edge (not CI), revalidate every hour
// Note: Pure SSG doesn't work because build machine can't reach production API
// ISR ensures the page is built at runtime when API IS accessible
export const revalidate = 3600; // 1 hour - products rarely change

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

  // ISR: Prefetch products at runtime on edge with await
  // Per TanStack docs: use await to ensure data is ready before dehydration
  await queryClient.prefetchQuery({
    queryKey: queryKeys.products.list(),
    queryFn: getProductsService,
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PricingScreen />
    </HydrationBoundary>
  );
}
