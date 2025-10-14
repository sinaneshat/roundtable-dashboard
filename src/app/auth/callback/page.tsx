import type { Metadata } from 'next';

import { BRAND } from '@/constants/brand';
import { AuthCallbackScreen } from '@/containers/screens/auth';
import { createMetadata } from '@/utils/metadata';

export const metadata: Metadata = createMetadata({
  title: `Authenticating - ${BRAND.fullName}`,
  description: 'Completing sign in process. Please wait...',
  url: '/auth/callback',
  robots: 'noindex, nofollow', // Transient page - don't index
});

// Force dynamic rendering to ensure this runs server-side
export const dynamic = 'force-dynamic';

export default async function AuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ returnUrl?: string }>;
}) {
  const params = await searchParams;

  return <AuthCallbackScreen returnUrl={params.returnUrl} />;
}
