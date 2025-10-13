import type { Metadata } from 'next';
import { Suspense } from 'react';

import { PageLoadingFallback } from '@/components/loading';
import { BRAND } from '@/constants/brand';
import { AuthErrorScreen } from '@/containers/screens/errors';
import { createMetadata } from '@/utils/metadata';

export async function generateMetadata(): Promise<Metadata> {
  return createMetadata({
    title: `Authentication Error - ${BRAND.fullName}`,
    description: 'There was an issue with authentication. Please try again.',
    robots: 'noindex, nofollow', // Don't index error pages
  });
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={<PageLoadingFallback text="Loading error details..." />}>
      <AuthErrorScreen />
    </Suspense>
  );
}
