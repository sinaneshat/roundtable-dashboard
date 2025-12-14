import type { Metadata } from 'next';

import { BRAND } from '@/constants';
import { HomeScreen } from '@/containers/screens/general';
import { createMetadata } from '@/utils/metadata';

// ============================================================================
// Static Generation - Landing page is static
// ============================================================================

/**
 * Force Static Generation
 * - Landing page is fully static marketing content
 * - No user-specific data needed
 * - Changes require redeploy (intentional for marketing control)
 */
export const dynamic = 'force-static';

export async function generateMetadata(): Promise<Metadata> {
  return createMetadata({
    title: BRAND.tagline,
    description: BRAND.description,
    url: '/',
    canonicalUrl: '/',
  });
}

export default async function Home() {
  return <HomeScreen />;
}
