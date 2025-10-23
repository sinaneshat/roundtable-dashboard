'use server';

import { headers } from 'next/headers';

import { auth } from '@/lib/auth';
import { syncAfterCheckoutService } from '@/services/api';

/**
 * Server Action: Sync Stripe Data After Checkout
 *
 * Following Theo's "Stay Sane with Stripe" pattern with server-side prefetching:
 * - Executes on server BEFORE page renders (not client-side useEffect)
 * - User sees success page with data already synced
 * - No race conditions or loading states
 * - Follows Next.js App Router server action pattern
 *
 * Flow:
 * 1. User completes Stripe checkout
 * 2. Stripe redirects to /chat/billing/success
 * 3. Next.js calls this server action during SSR
 * 4. Action syncs data from Stripe API server-side
 * 5. Page renders with synced data already available
 * 6. Client receives hydrated state with subscription data
 *
 * @returns Synced subscription state or error
 */
export async function syncStripeAfterCheckout(): Promise<{
  success: boolean;
  data?: {
    synced: boolean;
    subscription: {
      status: string;
      subscriptionId: string;
    } | null;
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
        error: 'Authentication required',
      };
    }

    // 2. Call sync service (server-side API call)
    // This fetches fresh data from Stripe API and updates database
    const syncResult = await syncAfterCheckoutService();

    // 3. Return synced state
    if (syncResult.success) {
      return {
        success: true,
        data: syncResult.data,
      };
    }

    return {
      success: false,
      error: 'Failed to sync subscription data',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Sync failed',
    };
  }
}
