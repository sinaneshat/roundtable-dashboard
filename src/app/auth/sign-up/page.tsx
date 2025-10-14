import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { AuthForm } from '@/components/auth/auth-form';
import { BRAND } from '@/constants/brand';
import { createMetadata } from '@/utils/metadata';

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
