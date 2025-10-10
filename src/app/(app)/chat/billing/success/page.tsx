import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { BRAND } from '@/constants/brand';
import { BillingSuccessClient } from '@/containers/screens/chat/billing/BillingSuccessClient';
import { getQueryClient } from '@/lib/data/query-client';
import { queryKeys } from '@/lib/data/query-keys';
import { getSubscriptionsService, getUserUsageStatsService } from '@/services/api';
import { createMetadata } from '@/utils/metadata';

import { syncStripeAfterCheckout } from './actions';

export const metadata: Metadata = createMetadata({
  title: `Payment Successful - ${BRAND.fullName}`,
  description: 'Your payment has been processed successfully. Your subscription is now active.',
  robots: 'noindex, nofollow', // Transient page - don't index
});

// Force dynamic rendering to ensure server action runs on each request
export const dynamic = 'force-dynamic';

/**
 * Billing Success Page - Server Component with Server-Side Sync & Query Hydration
 *
 * Following Theo's "Stay Sane with Stripe" pattern with Next.js App Router:
 * - Executes Stripe sync server-side BEFORE page renders
 * - Prefetches and hydrates TanStack Query cache with fresh data
 * - No client-side loading states, invalidations, or race conditions
 * - User sees success page with all data already available
 *
 * Flow:
 * 1. User completes Stripe checkout
 * 2. Stripe redirects to this page (/chat/billing/success)
 * 3. Next.js server component calls syncStripeAfterCheckout() action
 * 4. Action fetches fresh data from Stripe API and updates database
 * 5. Server prefetches subscriptions and usage queries with fresh data
 * 6. Page renders with hydrated queries - no client-side refetch needed
 * 7. Client component shows success animation immediately
 * 8. User can click button to navigate (no forced countdown redirect)
 *
 * ✅ NO useEffect needed - all data is server-hydrated
 *
 * Error Handling:
 * - Auth errors: Redirect to sign-in
 * - Sync errors: Redirect to pricing with error flag
 */
export default async function BillingSuccessPage() {
  // Execute server-side sync BEFORE rendering
  // This ensures data is fresh when page loads
  const syncResult = await syncStripeAfterCheckout();

  // Handle authentication errors
  if (!syncResult.success && syncResult.error === 'Authentication required') {
    redirect('/auth/sign-in?returnUrl=/chat/billing/success');
  }

  // Handle sync errors - redirect to pricing with error flag
  if (!syncResult.success) {
    redirect('/chat/pricing?sync=failed');
  }

  // ✅ Prefetch queries with fresh post-sync data
  // This eliminates the need for client-side query invalidation
  const queryClient = getQueryClient();
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: queryKeys.subscriptions.list(),
      queryFn: () => getSubscriptionsService(),
      staleTime: 60 * 1000, // 1 minute
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.usage.stats(),
      queryFn: () => getUserUsageStatsService(),
      staleTime: 60 * 1000, // 1 minute
    }),
  ]);

  // Render client component with hydrated queries
  // No useEffect for invalidation needed - queries are already fresh
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <BillingSuccessClient syncedData={syncResult.data} />
    </HydrationBoundary>
  );
}
