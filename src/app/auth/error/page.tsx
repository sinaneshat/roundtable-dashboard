import type { Metadata } from 'next';

import { BRAND } from '@/constants/brand';
import { AuthErrorScreen } from '@/containers/screens/errors';
import { createMetadata } from '@/utils/metadata';

// ============================================================================
// Static Generation - Error UI shell is static
// ============================================================================

/**
 * Force Static Generation
 * - Error page UI is a static shell
 * - Error details are passed via searchParams and handled client-side
 *
 * NOTE: No Suspense here - AuthErrorScreen has its own Suspense boundary
 * for useSearchParams per Next.js 15 requirements. Avoids double loading states.
 */
export const dynamic = 'force-static';

export async function generateMetadata(): Promise<Metadata> {
  return createMetadata({
    title: `Authentication Error - ${BRAND.fullName}`,
    description: 'There was an issue with authentication. Please try again.',
    robots: 'noindex, nofollow', // Don't index error pages
  });
}

export default function AuthErrorPage() {
  return <AuthErrorScreen />;
}
