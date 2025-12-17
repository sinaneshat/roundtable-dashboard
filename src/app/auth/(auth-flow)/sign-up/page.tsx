import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { AuthForm } from '@/components/auth/auth-form';
import { BRAND } from '@/constants/brand';
import { createMetadata } from '@/utils/metadata';

// ============================================================================
// Static Generation - Auth UI pages are static
// ============================================================================

/**
 * Force Static Generation
 * - Auth pages UI is fully static (form shells)
 * - Auth logic happens client-side via Better Auth
 * - No server-side dynamic data needed for initial render
 */
export const dynamic = 'force-static';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta.signUp');
  const tSeo = await getTranslations('seo.keywords');

  return createMetadata({
    title: t('title'),
    description: t('description'),
    url: '/auth/sign-up',
    canonicalUrl: '/auth/sign-up',
    image: '/auth/sign-up/opengraph-image',
    keywords: [
      ...(t.raw('keywords') as string[]),
      tSeo('createAccount'),
      tSeo('aiCollaboration'),
      tSeo('multipleAiModels'),
      BRAND.name,
    ],
  });
}

export default async function SignUpPage() {
  return <AuthForm />;
}
