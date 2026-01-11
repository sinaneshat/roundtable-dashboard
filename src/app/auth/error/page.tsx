import type { Metadata } from 'next';

import { BRAND } from '@/constants';
import AuthErrorScreen from '@/containers/screens/errors/AuthErrorScreen';
import { createMetadata } from '@/utils';

// SSG: Pure static - error page doesn't need dynamic rendering
export const dynamic = 'force-static';

export async function generateMetadata(): Promise<Metadata> {
  return createMetadata({
    title: `Authentication Error - ${BRAND.fullName}`,
    description: 'There was an issue with authentication. Please try again.',
    robots: 'noindex, nofollow',
  });
}

export default async function AuthErrorPage() {
  return <AuthErrorScreen />;
}
