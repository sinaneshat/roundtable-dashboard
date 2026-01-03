import type { Metadata } from 'next';
import dynamicImport from 'next/dynamic';

import { BillingFailureSkeleton } from '@/components/billing/billing-failure-skeleton';
import { BRAND } from '@/constants/brand';
import { createMetadata } from '@/utils';

import { capturePaymentFailure } from './actions';

export const dynamic = 'force-dynamic';

const BillingFailureClient = dynamicImport(
  () => import('@/containers/screens/chat/billing/BillingFailureClient').then(mod => ({ default: mod.BillingFailureClient })),
  {
    loading: () => <BillingFailureSkeleton />,
    ssr: false,
  },
);

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
 * Performance: BillingFailureClient dynamically imported to reduce initial bundle.
 * Only loads when payment fails, not on pricing page load.
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
