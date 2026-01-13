import type React from 'react';

import PublicChatLayout from '@/components/layouts/public-chat-layout';
import { ChatLayoutProviders } from '@/components/providers';

// ISR: 1 day cache with on-demand invalidation via revalidateTag
export const revalidate = 86400;

export default async function PublicChatLayoutPage({
  children,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  return (
    <ChatLayoutProviders>
      <PublicChatLayout>
        {children}
      </PublicChatLayout>
    </ChatLayoutProviders>
  );
}
