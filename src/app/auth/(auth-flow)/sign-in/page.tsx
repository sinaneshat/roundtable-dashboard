import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { AuthFormLoader } from '@/components/auth/auth-form-loader';
import { BRAND } from '@/constants';
import { createMetadata } from '@/utils';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta.signIn');
  const tSeo = await getTranslations('seo.keywords');

  return createMetadata({
    title: `${t('title')} - ${BRAND.name}`,
    description: t('description'),
    url: '/auth/sign-in',
    canonicalUrl: '/auth/sign-in',
    image: '/auth/sign-in/opengraph-image',
    keywords: [
      ...(t.raw('keywords') as string[]),
      tSeo('aiCollaboration'),
      BRAND.name,
    ],
  });
}

export default async function SignInPage() {
  return <AuthFormLoader />;
}
