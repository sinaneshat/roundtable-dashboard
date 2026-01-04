import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { BRAND } from '@/constants/brand';
import TermsScreen from '@/containers/screens/legal/TermsScreen';
import { isArrayOf, isNonEmptyString } from '@/lib/utils/type-guards';
import { createMetadata } from '@/utils';

// SSG: Pure static - only changes on deploy
export const dynamic = 'force-static';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta.legal.terms');
  const tSeo = await getTranslations('seo.keywords');

  const rawKeywords = t.raw('keywords');
  const translatedKeywords = isArrayOf(rawKeywords, isNonEmptyString) ? rawKeywords : [];

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
      ...translatedKeywords,
      BRAND.name,
    ],
  });
}

export default async function TermsPage() {
  return <TermsScreen />;
}
