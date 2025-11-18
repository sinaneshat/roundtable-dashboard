import type { Metadata } from 'next';
import type React from 'react';

import { ChatLayout } from '@/components/layouts';
import { BRAND } from '@/constants/brand';
import { createMetadata } from '@/utils/metadata';

export async function generateMetadata(): Promise<Metadata> {
  return createMetadata({
    title: `Chat - ${BRAND.fullName}`,
    description: 'Manage your conversations and chat history.',
    robots: 'noindex, nofollow', // Chat is private, don't index
  });
}

export default async function ChatLayoutPage({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ChatLayout>{children}</ChatLayout>;
}
