import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { AuthFormLoader } from '@/components/auth/auth-form-loader';
import { BRAND } from '@/constants/brand';
import { createMetadata } from '@/utils';

// SSG: Pure static - auth form doesn't need dynamic rendering
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
  return <AuthFormLoader />;
}
