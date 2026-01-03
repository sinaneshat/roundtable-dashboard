import type { Metadata } from 'next';

import { BRAND } from '@/constants/brand';
import { BillingFailureClient } from '@/containers/screens/chat/billing/BillingFailureClient';
import { createMetadata } from '@/utils';

import { capturePaymentFailure } from './actions';

export const metadata: Metadata = createMetadata({
  title: `Payment Failed - ${BRAND.fullName}`,
  description: 'Payment processing encountered an error. Please try again or contact support.',
  url: '/chat/billing/failure',
  robots: 'noindex, nofollow',
});

/**
 * Billing Failure Page
 * No HydrationBoundary needed - layout already hydrates subscriptions, usage stats
 *
 * Note: loading.tsx provides Suspense fallback automatically (Next.js 16 pattern)
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
  const params = await searchParams;
  const failureResult = await capturePaymentFailure(params);

  return <BillingFailureClient failureData={failureResult.data} />;
}
