import type { Metadata } from 'next';
import dynamic from 'next/dynamic';

import { BillingSuccessSkeleton } from '@/components/billing/billing-success-skeleton';
import { BRAND } from '@/constants/brand';
import { createMetadata } from '@/utils';

const BillingSuccessClient = dynamic(
  () => import('@/containers/screens/chat/billing/BillingSuccessClient').then(mod => ({ default: mod.BillingSuccessClient })),
  {
    loading: () => <BillingSuccessSkeleton />,
    ssr: false,
  },
);

export const metadata: Metadata = createMetadata({
  title: `Subscription Activated - ${BRAND.fullName}`,
  description: 'Your subscription has been activated successfully.',
  url: '/chat/billing/subscription-success',
  robots: 'noindex, nofollow',
});

/**
 * Subscription Success Page
 *
 * Theo's "Stay Sane with Stripe" pattern:
 * Separate page for subscription purchases only.
 * Credit pack purchases use /chat/billing/credits-success.
 *
 * Flow:
 * 1. User completes Stripe checkout for subscription
 * 2. Stripe redirects to this page
 * 3. Client syncs subscription data from Stripe API
 * 4. Displays subscription details and plan features
 * 5. Auto-redirects to chat
 *
 * Performance: BillingSuccessClient dynamically imported to reduce initial bundle.
 * Only loads when user completes payment, not on pricing page load.
 */
export default function SubscriptionSuccessPage() {
  return <BillingSuccessClient />;
}
