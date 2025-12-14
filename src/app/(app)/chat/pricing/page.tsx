import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';

import { BRAND } from '@/constants/brand';
import { PricingScreen } from '@/containers/screens/chat/billing';
import { getQueryClient } from '@/lib/data/query-client';
import { queryKeys } from '@/lib/data/query-keys';
import { STALE_TIMES } from '@/lib/data/stale-times';
import { getProductsService } from '@/services/api';
import { createMetadata } from '@/utils/metadata';

// ============================================================================
// ISR Configuration - Hourly Product Updates
// ============================================================================

/**
 * ISR Configuration
 * - Revalidates every hour (3600 seconds)
 * - Allows product/pricing changes to reflect within 1 hour
 * - Can be revalidated on-demand via revalidatePath('/chat/pricing')
 * - Matches STALE_TIMES.products (1 hour) for React Query alignment
 */
export const revalidate = 3600; // 1 hour - sync with STALE_TIMES.products

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
 * Pricing Page - ISR (Incremental Static Regeneration)
 *
 * Unified pricing and subscription management page
 * Shows pricing plans with subscription-aware buttons:
 * - "Manage Billing" for users with active subscriptions
 * - "Subscribe" for users without subscriptions
 *
 * ISR Strategy (Next.js 16):
 * - Products are generated at BUILD TIME, revalidated every HOUR
 * - Page is mostly static - same HTML served to all users
 * - User subscriptions are fetched CLIENT-SIDE (user-specific, dynamic data)
 * - On-demand revalidation via revalidatePath('/chat/pricing') when products change
 *
 * Benefits:
 * ✅ Fast page loads (static HTML from CDN)
 * ✅ Product/pricing updates within 1 hour without redeploy
 * ✅ CDN caching with automatic background revalidation
 * ✅ User-specific subscription data still dynamic and accurate
 *
 * Following Next.js 16 App Router ISR best practices:
 * - Use `export const revalidate` for time-based ISR
 * - Prefetch products with matching React Query staleTime
 * - Fetch user-specific data client-side
 */

export default async function PricingPage() {
  const queryClient = getQueryClient();

  // Prefetch products at BUILD TIME with ISR revalidation
  // Product data is cached and revalidated hourly via ISR
  // Same product data served to all users until revalidation
  await queryClient.prefetchQuery({
    queryKey: queryKeys.products.list(),
    queryFn: getProductsService,
    staleTime: STALE_TIMES.products, // 1 hour - aligned with ISR revalidate
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
