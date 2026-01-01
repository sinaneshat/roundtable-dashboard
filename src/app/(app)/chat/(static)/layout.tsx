import type React from 'react';

import { ChatLayoutShellStatic } from '@/components/layouts/chat-layout-shell-static';

type StaticLayoutProps = {
  children: React.ReactNode;
};

/**
 * Static Chat Layout
 * For SSG pages that don't require authentication (e.g., pricing)
 * Uses client-only sidebar to prevent hydration mismatch
 */
export default function StaticChatLayout({ children }: StaticLayoutProps) {
  return (
    <ChatLayoutShellStatic>
      {children}
    </ChatLayoutShellStatic>
  );
}
