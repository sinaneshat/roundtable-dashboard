import type { Metadata } from 'next';
import { cacheLife } from 'next/cache';

import { BRAND } from '@/constants/brand';
import AuthErrorScreen from '@/containers/screens/errors/AuthErrorScreen';
import { createMetadata } from '@/utils';

export async function generateMetadata(): Promise<Metadata> {
  return createMetadata({
    title: `Authentication Error - ${BRAND.fullName}`,
    description: 'There was an issue with authentication. Please try again.',
    robots: 'noindex, nofollow',
  });
}

export default async function AuthErrorPage() {
  'use cache';
  cacheLife('max');

  return <AuthErrorScreen />;
}
