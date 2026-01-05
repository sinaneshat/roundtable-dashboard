import type { Metadata } from 'next';

import { BRAND } from '@/constants';
import { CreditsSuccessClient } from '@/containers/screens/chat/billing/CreditsSuccessClient';
import { createMetadata } from '@/utils';

export const metadata: Metadata = createMetadata({
  title: `Credits Added - ${BRAND.fullName}`,
  description: 'Your credits have been added to your account.',
  url: '/chat/billing/credits-success',
  robots: 'noindex, nofollow',
});

/**
 * Credits Purchase Success Page
 *
 * Separate from subscription success following Theo's "Stay Sane with Stripe" pattern.
 * One-time credit purchases have simpler flow than subscriptions.
 *
 * Flow:
 * 1. User completes Stripe checkout for credit pack
 * 2. Stripe redirects to this page (/chat/billing/credits-success)
 * 3. Client syncs and grants credits
 * 4. Shows credits added confirmation
 * 5. Auto-redirects to chat
 *
 * Note: loading.tsx provides Suspense fallback automatically (Next.js 16 pattern)
 */
export default function CreditsSuccessPage() {
  return <CreditsSuccessClient />;
}
