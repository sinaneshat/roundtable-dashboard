import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { BRAND } from '@/constants/brand';
import { TermsScreen } from '@/containers/screens/legal';
import { createMetadata } from '@/utils/metadata';

// ============================================================================
// Static Generation - Legal pages rarely change
// ============================================================================

/**
 * Force Static Generation
 * - Legal pages are fully static and rarely updated
 * - Changes require redeploy (intentional for legal compliance)
 * - No ISR needed since legal changes are infrequent and should be deliberate
 */
export const dynamic = 'force-static';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta.legal.terms');
  const tSeo = await getTranslations('seo.keywords');

  return createMetadata({
    title: t('title'),
    description: t('description'),
    url: '/terms',
    canonicalUrl: '/terms',
    image: '/terms/opengraph-image',
    type: 'article',
    keywords: [
      tSeo('termsOfService'),
      tSeo('termsAndConditions'),
      tSeo('userAgreement'),
      ...(t.raw('keywords') as string[]),
      BRAND.name,
    ],
  });
}

export default async function TermsPage() {
  return <TermsScreen />;
}
