import type { Metadata } from 'next';
import type React from 'react';

import { BRAND } from '@/constants/brand';
import { createMetadata } from '@/utils';

export async function generateMetadata(): Promise<Metadata> {
  return createMetadata({
    title: `Chat - ${BRAND.fullName}`,
    description: 'Manage your conversations and chat history.',
    robots: 'noindex, nofollow',
  });
}

/**
 * Root Chat Layout - Simple passthrough
 * Auth and prefetching handled by route group layouts:
 * - (authenticated) - For protected pages
 * - (static) - For SSG pages like pricing
 */
export default function ChatRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
