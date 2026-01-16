import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { AuthFormLoader } from '@/components/auth/auth-form-loader';
import { BRAND } from '@/constants';
import { createMetadata } from '@/utils';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta.signUp');
  const tSeo = await getTranslations('seo.keywords');

  return createMetadata({
    title: `${t('title')} - ${BRAND.name}`,
    description: t('description'),
    url: '/auth/sign-up',
    canonicalUrl: '/auth/sign-up',
    image: '/auth/sign-up/opengraph-image',
    keywords: [
      ...(t.raw('keywords') as string[]),
      tSeo('createAccount'),
      tSeo('aiCollaboration'),
      tSeo('aiCouncil'),
      BRAND.name,
    ],
  });
}

export default async function SignUpPage() {
  return <AuthFormLoader />;
}
