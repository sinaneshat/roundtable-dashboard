import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';

import { BillingFailureClient } from '@/containers/screens/chat/billing/BillingFailureClient';
import { getQueryClient } from '@/lib/data/query-client';
import { queryKeys } from '@/lib/data/query-keys';
import { getSubscriptionsService, getUserUsageStatsService } from '@/services/api';

import { capturePaymentFailure } from './actions';

export const metadata: Metadata = {
  title: 'Payment Failed',
  description: 'Payment processing encountered an error',
};

// Force dynamic rendering to ensure server action runs on each request
export const dynamic = 'force-dynamic';

/**
 * Billing Failure Page - Server Component with Error Capture & Query Hydration
 *
 * Handles payment failure scenarios with detailed error information:
 * - Payment processing failures (card declined, insufficient funds, etc.)
 * - Sync failures (payment succeeded but database update failed)
 * - Authentication failures (session expired)
 * - Unknown errors (unexpected failures)
 *
 * Flow:
 * 1. User is redirected from Stripe/payment processor to this page
 * 2. Next.js server component calls capturePaymentFailure() action
 * 3. Action captures error details and session information
 * 4. Server prefetches subscriptions and usage queries for accurate state
 * 5. Page renders with hydrated queries and structured error data
 * 6. Client component displays user-friendly error messages and support options
 * 7. User can retry payment or return to chat
 *
 * ✅ NO useEffect needed - all data is server-hydrated
 *
 * Error Handling:
 * - Auth errors: Allow viewing with generic message
 * - Capture errors: Show generic failure page
 * - Always provide support contact information
 */
export default async function BillingFailurePage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    error_code?: string;
    error_type?: string;
  }>;
}) {
  // Await search params (Next.js 15 async params pattern)
  const params = await searchParams;

  // Capture failure details server-side
  const failureResult = await capturePaymentFailure(params);

  // Handle authentication errors - still show failure page but with limited info
  // This allows users to see what went wrong even if their session expired
  if (
    !failureResult.success
    && failureResult.data?.errorType === 'authentication_failed'
  ) {
    // Don't redirect, show failure page with auth error
    // User can then sign in again if needed
  }

  // ✅ Prefetch queries to ensure accurate state for retry attempts
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

  // Render client component with hydrated queries and failure data
  // No useEffect for invalidation needed - queries are already fresh
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <BillingFailureClient failureData={failureResult.data} />
    </HydrationBoundary>
  );
}
