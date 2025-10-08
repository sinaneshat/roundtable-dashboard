import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { BillingSuccessClient } from '@/containers/screens/chat/billing/BillingSuccessClient';

import { syncStripeAfterCheckout } from './actions';

export const metadata: Metadata = {
  title: 'Payment Successful',
  description: 'Your payment has been processed successfully',
};

// Force dynamic rendering to ensure server action runs on each request
export const dynamic = 'force-dynamic';

/**
 * Billing Success Page - Server Component with Server-Side Sync
 *
 * Following Theo's "Stay Sane with Stripe" pattern with Next.js App Router:
 * - Executes Stripe sync server-side BEFORE page renders
 * - No client-side loading states or race conditions
 * - User sees success page with data already synced
 * - Quota/stats APIs are invalidated client-side after hydration
 *
 * Flow:
 * 1. User completes Stripe checkout
 * 2. Stripe redirects to this page (/chat/billing/success)
 * 3. Next.js server component calls syncStripeAfterCheckout() action
 * 4. Action fetches fresh data from Stripe API and updates database
 * 5. Page renders with synced data passed to client component
 * 6. Client component invalidates queries and shows success animation
 * 7. User redirects to pricing page after countdown
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

  // Render client component with pre-synced data
  // No loading states needed - data is already available
  return <BillingSuccessClient syncedData={syncResult.data} />;
}
