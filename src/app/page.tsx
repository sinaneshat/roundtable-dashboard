import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { BRAND } from '@/constants';
import { auth } from '@/lib/auth';
import { createMetadata } from '@/utils';

const BOT_USER_AGENTS = [
  'Twitterbot',
  'facebookexternalhit',
  'LinkedInBot',
  'Slackbot',
  'TelegramBot',
  'WhatsApp',
  'Discordbot',
  'Googlebot',
  'bingbot',
  'Applebot',
];

function isBot(userAgent: string | null): boolean {
  if (!userAgent)
    return false;
  return BOT_USER_AGENTS.some(bot => userAgent.includes(bot));
}

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
 * Bots see a minimal landing page (for OG tags).
 * Users get redirected:
 * - Authenticated → /chat
 * - Unauthenticated → /auth/sign-in
 */
export default async function Home() {
  const headersList = await headers();
  const userAgent = headersList.get('user-agent');

  // Bots get a minimal page so they can read OG meta tags
  if (isBot(userAgent)) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-background">
        <h1 className="text-4xl font-bold">{BRAND.displayName}</h1>
        <p className="mt-4 text-xl text-muted-foreground">{BRAND.tagline}</p>
      </main>
    );
  }

  const session = await auth.api.getSession({
    headers: headersList,
  });

  if (session?.user) {
    redirect('/chat');
  }

  redirect('/auth/sign-in');
}
