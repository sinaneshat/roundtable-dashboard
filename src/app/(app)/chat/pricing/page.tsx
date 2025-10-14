import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';

import { BRAND } from '@/constants/brand';
import { PricingScreen } from '@/containers/screens/chat/billing';
import { getQueryClient } from '@/lib/data/query-client';
import { queryKeys } from '@/lib/data/query-keys';
import { getProductsService } from '@/services/api';
import { createMetadata } from '@/utils/metadata';

/**
 * Generate metadata for pricing page
 */
export async function generateMetadata(): Promise<Metadata> {
  return createMetadata({
    title: `Pricing - ${BRAND.fullName}`,
    description: 'Choose the perfect plan for your AI collaboration needs. Flexible pricing for teams of all sizes with multiple AI models working together.',
    robots: 'noindex, nofollow', // Private pricing page - users must be authenticated
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
 * Pricing Page - SSG (Static Site Generation)
 *
 * Unified pricing and subscription management page
 * Shows pricing plans with subscription-aware buttons:
 * - "Manage Billing" for users with active subscriptions
 * - "Subscribe" for users without subscriptions
 *
 * Static Generation Strategy:
 * - Products are statically generated at BUILD TIME (no revalidation)
 * - Page is completely static - same HTML served to all users
 * - User subscriptions are fetched CLIENT-SIDE (user-specific, dynamic data)
 *
 * Benefits:
 * ✅ Fastest possible page loads (pure static HTML)
 * ✅ Zero server load (no regeneration, no API calls on page load)
 * ✅ Perfect for CDN caching
 * ✅ Products rarely change - no need for ISR
 * ✅ User-specific subscription data still dynamic and accurate
 *
 * Following Next.js 15 App Router SSG best practices:
 * - Build static pages at build time
 * - Serve the same HTML to all users
 * - Fetch user-specific data client-side
 *
 * To update products: Redeploy the application (products change rarely)
 */

export default async function PricingPage() {
  const queryClient = getQueryClient();

  // Prefetch products at BUILD TIME (static data)
  // This data is baked into the HTML during build
  // Same product data served to all users
  await queryClient.prefetchQuery({
    queryKey: queryKeys.products.list(),
    queryFn: getProductsService,
    staleTime: Infinity, // Static data - never stale during runtime
  });

  // NOTE: Subscriptions are NOT prefetched here
  // They are user-specific and will be fetched client-side by PricingScreen
  // This keeps the page fully static while showing accurate user data

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PricingScreen />
    </HydrationBoundary>
  );
}
