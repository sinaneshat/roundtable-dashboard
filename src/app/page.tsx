import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { BRAND } from '@/constants';
import { auth } from '@/lib/auth';
import { createMetadata } from '@/utils';

export async function generateMetadata(): Promise<Metadata> {
  return createMetadata({
    title: BRAND.tagline,
    description: BRAND.description,
    url: '/',
    canonicalUrl: '/',
  });
}

/**
 * Home Page - Auth-based redirect
 *
 * Checks session server-side and redirects:
 * - Authenticated → /chat
 * - Unauthenticated → /auth/sign-in
 *
 * @see https://www.better-auth.com/docs/integrations/next
 */
export default async function Home() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session?.user) {
    redirect('/chat');
  }

  redirect('/auth/sign-in');
}
