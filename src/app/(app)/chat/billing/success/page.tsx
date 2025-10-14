import type { Metadata } from 'next';

import { BRAND } from '@/constants/brand';
import { BillingSuccessClient } from '@/containers/screens/chat/billing/BillingSuccessClient';
import { createMetadata } from '@/utils/metadata';

export const metadata: Metadata = createMetadata({
  title: `Payment Successful - ${BRAND.fullName}`,
  description: 'Your payment has been processed successfully. Your subscription is now active.',
  url: '/chat/billing/success',
  robots: 'noindex, nofollow', // Transient page - don't index
});

/**
 * Billing Success Page - Client-Side Sync Pattern
 *
 * Flow:
 * 1. User completes Stripe checkout
 * 2. Stripe redirects to this page (/chat/billing/success)
 * 3. Client component mounts and initiates sync process
 * 4. User sees loading states showing sync progress
 * 5. Once synced, fetches subscription data and displays plan details
 * 6. Shows activated subscription with plan limitations
 *
 * Benefits:
 * ✅ User sees what's happening during sync
 * ✅ Proper loading states and progress indicators
 * ✅ Displays subscription details and limitations
 * ✅ No server-side blocking
 */
export default function BillingSuccessPage() {
  return <BillingSuccessClient />;
}
