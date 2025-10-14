import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { BRAND } from '@/constants/brand';
import { PrivacyScreen } from '@/containers/screens/legal';
import { createMetadata } from '@/utils/metadata';

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
