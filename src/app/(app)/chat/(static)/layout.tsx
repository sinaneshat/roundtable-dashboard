import type React from 'react';

import { ChatLayoutShell } from '@/components/layouts/chat-layout-shell';

type StaticLayoutProps = {
  children: React.ReactNode;
};

/**
 * Static Chat Layout
 * For SSG/ISR pages that don't require authentication (e.g., pricing)
 * No auth check, no HydrationBoundary (pages handle their own hydration)
 */
export default function StaticChatLayout({ children }: StaticLayoutProps) {
  return (
    <ChatLayoutShell session={null}>
      {children}
    </ChatLayoutShell>
  );
}
