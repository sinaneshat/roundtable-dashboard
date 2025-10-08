'use server';

import { headers } from 'next/headers';

import { auth } from '@/lib/auth';

/**
 * Server Action: Capture Payment Failure Details
 *
 * This action captures detailed information about payment failures to help
 * users understand what went wrong and how to proceed.
 *
 * Flow:
 * 1. User is redirected from Stripe to /chat/billing/failure with error params
 * 2. Next.js calls this server action during SSR
 * 3. Action captures session and error details
 * 4. Page renders with structured error information
 * 5. Client component displays appropriate guidance and support options
 *
 * Error Types:
 * - payment_failed: Stripe payment processing failed (card declined, insufficient funds, etc.)
 * - sync_failed: Payment succeeded but database sync failed
 * - authentication_failed: User session expired or invalid
 * - unknown: Unexpected error occurred
 *
 * @returns Structured error information for display
 */
export async function capturePaymentFailure(searchParams?: {
  error?: string;
  error_code?: string;
  error_type?: string;
}): Promise<{
    success: boolean;
    data?: {
      error?: string;
      errorCode?: string;
      errorType?: 'payment_failed' | 'sync_failed' | 'authentication_failed' | 'unknown';
      stripeError?: string;
      timestamp?: string;
    };
    error?: string;
  }> {
  try {
    // 1. Get authenticated session
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });

    if (!session?.user) {
      return {
        success: false,
        data: {
          errorType: 'authentication_failed',
          error: 'Session expired',
          timestamp: new Date().toISOString(),
        },
      };
    }

    // 2. Determine error type from search params
    const errorType = searchParams?.error_type as
      | 'payment_failed'
      | 'sync_failed'
      | 'authentication_failed'
      | 'unknown'
      | undefined;

    // 3. Capture detailed error information
    const errorData = {
      error: searchParams?.error || 'Payment processing failed',
      errorCode: searchParams?.error_code,
      errorType: errorType || 'unknown',
      stripeError: searchParams?.error,
      timestamp: new Date().toISOString(),
    };

    // 4. Log error for monitoring (you can extend this with proper error tracking)
    console.error('Payment failure captured:', {
      userId: session.user.id,
      ...errorData,
    });

    return {
      success: false,
      data: errorData,
    };
  } catch (error) {
    console.error('Server action error: Failed to capture payment failure', error);
    return {
      success: false,
      data: {
        errorType: 'unknown',
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        timestamp: new Date().toISOString(),
      },
      error: 'Failed to process error details',
    };
  }
}
