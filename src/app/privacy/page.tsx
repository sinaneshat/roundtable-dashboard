import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { BRAND } from '@/constants/brand';
import { PrivacyScreen } from '@/containers/screens/legal';
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
  const t = await getTranslations('meta.legal.privacy');
  const tSeo = await getTranslations('seo.keywords');

  return createMetadata({
    title: t('title'),
    description: t('description'),
    url: '/privacy',
    canonicalUrl: '/privacy',
    image: '/privacy/opengraph-image',
    type: 'article',
    keywords: [
      tSeo('privacyPolicy'),
      tSeo('dataProtection'),
      tSeo('gdpr'),
      ...(t.raw('keywords') as string[]),
      BRAND.name,
    ],
  });
}

export default async function PrivacyPage() {
  return <PrivacyScreen />;
}
