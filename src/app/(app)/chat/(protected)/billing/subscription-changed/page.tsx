import type { Metadata } from 'next';

import { BRAND } from '@/constants';
import { SubscriptionChangedClient } from '@/containers/screens/chat/billing/SubscriptionChangedClient';
import { createMetadata } from '@/utils';

// ============================================================================
// Dynamic - Parent layout requires authentication
// ============================================================================

export const metadata: Metadata = createMetadata({
  title: `Subscription Changed - ${BRAND.fullName}`,
  description: 'Your subscription has been updated successfully.',
  url: '/chat/billing/subscription-changed',
  robots: 'noindex, nofollow', // Transient page - don't index
});

/**
 * Subscription Changed Page
 *
 * Shown after successful subscription upgrade/downgrade via in-app switching.
 * Unlike the checkout success page, this is shown for existing customers who
 * change their plan without going through Stripe Checkout.
 *
 * Flow:
 * 1. User clicks upgrade/downgrade on pricing page
 * 2. API call switches subscription (no Stripe redirect)
 * 3. User is redirected to this page with change details in query params
 * 4. Page displays before/after comparison and new plan details
 * 5. Auto-redirects to chat after countdown
 *
 * Benefits:
 * ✅ User sees what changed (old plan → new plan)
 * ✅ Clear confirmation of subscription update
 * ✅ Shows new plan limitations and quotas
 * ✅ No Stripe redirect required for existing customers
 */
export default function SubscriptionChangedPage() {
  return <SubscriptionChangedClient />;
}
