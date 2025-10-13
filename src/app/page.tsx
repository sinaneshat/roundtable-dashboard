import type { Metadata } from 'next';

import { BRAND } from '@/constants';
import { HomeScreen } from '@/containers/screens/general';
import { createMetadata } from '@/utils/metadata';

export async function generateMetadata(): Promise<Metadata> {
  return createMetadata({
    title: BRAND.tagline,
    description: BRAND.description,
  });
}

export default async function Home() {
  return <HomeScreen />;
}
