import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { AuthForm } from '@/components/auth/auth-form';
import { BRAND } from '@/constants/brand';
import { createMetadata } from '@/utils';

// Note: Parent layout uses force-dynamic for auth session checks
// These pages inherit dynamic rendering from the layout

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta.signIn');
  const tSeo = await getTranslations('seo.keywords');

  return createMetadata({
    title: t('title'),
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
  return <AuthForm />;
}
