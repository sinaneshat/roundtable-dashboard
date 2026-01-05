import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { BRAND } from '@/constants';
import PrivacyScreen from '@/containers/screens/legal/PrivacyScreen';
import { isArrayOf, isNonEmptyString } from '@/lib/utils';
import { createMetadata } from '@/utils';

// SSG: Pure static - only changes on deploy
export const dynamic = 'force-static';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta.legal.privacy');
  const tSeo = await getTranslations('seo.keywords');

  const rawKeywords = t.raw('keywords');
  const translatedKeywords = isArrayOf(rawKeywords, isNonEmptyString) ? rawKeywords : [];

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
      ...translatedKeywords,
      BRAND.name,
    ],
  });
}

export default async function PrivacyPage() {
  return <PrivacyScreen />;
}
