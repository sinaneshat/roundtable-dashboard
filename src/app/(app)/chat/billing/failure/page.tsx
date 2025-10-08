import type { Metadata } from 'next';

import { BillingFailureClient } from '@/containers/screens/chat/billing/BillingFailureClient';

import { capturePaymentFailure } from './actions';

export const metadata: Metadata = {
  title: 'Payment Failed',
  description: 'Payment processing encountered an error',
};

// Force dynamic rendering to ensure server action runs on each request
export const dynamic = 'force-dynamic';

/**
 * Billing Failure Page - Server Component with Error Capture
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
 * 4. Page renders with structured error data passed to client component
 * 5. Client component displays user-friendly error messages and support options
 * 6. User can retry payment or return to chat
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

  // Render client component with failure data
  // Always show the failure page to provide error context
  return <BillingFailureClient failureData={failureResult.data} />;
}
