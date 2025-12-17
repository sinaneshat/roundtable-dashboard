import type { Metadata } from 'next';

import { BRAND } from '@/constants';
import { HomeScreen } from '@/containers/screens/general';
import { createMetadata } from '@/utils/metadata';

// Force dynamic rendering - HomeScreen checks auth session for redirect logic
// Auth module requires BETTER_AUTH_SECRET only available at runtime
// @see https://github.com/opennextjs/opennextjs-cloudflare/issues/596
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return createMetadata({
    title: BRAND.tagline,
    description: BRAND.description,
    url: '/',
    canonicalUrl: '/',
  });
}

export default async function Home() {
  return <HomeScreen />;
}
