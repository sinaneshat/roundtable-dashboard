import type { Metadata } from 'next';

import { AuthCallbackScreen } from '@/containers/screens/auth';

export const metadata: Metadata = {
  title: 'Authenticating...',
  description: 'Completing sign in process',
};

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
