import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type React from 'react';

import { ChatLayoutShell } from '@/components/layouts/chat-layout-shell';
import { getQueryClient } from '@/lib/data/query-client';

type StaticLayoutProps = {
  children: React.ReactNode;
};

/**
 * Static Chat Layout
 * For SSG pages that don't require authentication (e.g., pricing)
 * No auth check, no dynamic operations - fully static at build time
 */
export default async function StaticChatLayout({ children }: StaticLayoutProps) {
  const queryClient = getQueryClient();

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ChatLayoutShell session={null}>
        {children}
      </ChatLayoutShell>
    </HydrationBoundary>
  );
}
