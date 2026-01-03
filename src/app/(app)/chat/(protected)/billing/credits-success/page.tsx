import type { Metadata } from 'next';
import dynamic from 'next/dynamic';

import { CreditsSuccessSkeleton } from '@/components/billing/credits-success-skeleton';
import { BRAND } from '@/constants/brand';
import { createMetadata } from '@/utils';

const CreditsSuccessClient = dynamic(
  () => import('@/containers/screens/chat/billing/CreditsSuccessClient').then(mod => ({ default: mod.CreditsSuccessClient })),
  {
    loading: () => <CreditsSuccessSkeleton />,
    ssr: false,
  },
);

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
 * Performance: CreditsSuccessClient dynamically imported to reduce initial bundle.
 * Only loads after user purchases credits, not on pricing page load.
 */
export default function CreditsSuccessPage() {
  return <CreditsSuccessClient />;
}
