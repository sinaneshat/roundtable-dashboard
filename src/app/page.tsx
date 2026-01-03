import type { Metadata } from 'next';

import { BRAND } from '@/constants/brand';
import HomeScreen from '@/containers/screens/general/HomeScreen';
import { createMetadata } from '@/utils';

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
