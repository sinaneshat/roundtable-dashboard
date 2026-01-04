import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type React from 'react';

import { AuthShowcaseLayout } from '@/components/auth/auth-showcase-layout';
import { auth } from '@/lib/auth';

type AuthLayoutPageProps = {
  children: React.ReactNode;
};

/**
 * Auth Flow Layout - Redirects authenticated users to /chat
 *
 * @see https://www.better-auth.com/docs/integrations/next
 */
export default async function AuthLayoutPage({ children }: AuthLayoutPageProps) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session?.user) {
    redirect('/chat');
  }

  return <AuthShowcaseLayout>{children}</AuthShowcaseLayout>;
}
