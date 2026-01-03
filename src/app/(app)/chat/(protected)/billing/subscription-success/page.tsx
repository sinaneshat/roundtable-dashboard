import type { Metadata } from 'next';

import { BRAND } from '@/constants/brand';
import { BillingSuccessClient } from '@/containers/screens/chat/billing/BillingSuccessClient';
import { createMetadata } from '@/utils';

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
 * Note: loading.tsx provides Suspense fallback automatically (Next.js 16 pattern)
 */
export default function SubscriptionSuccessPage() {
  return <BillingSuccessClient />;
}
