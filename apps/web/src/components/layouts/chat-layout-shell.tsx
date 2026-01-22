import type React from 'react';

import { ChatHeaderSwitch } from '@/components/chat/chat-header-switch';
import { AppSidebar } from '@/components/chat/chat-nav';
import { ThreadHeaderProvider } from '@/components/chat/thread-header-context';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import type { SessionData } from '@/lib/auth';

type ChatLayoutShellProps = {
  children: React.ReactNode;
  session?: SessionData | null;
};

/**
 * Chat Layout Shell - Pure UI wrapper for chat routes.
 * Sidebar and header are eagerly loaded to avoid skeleton flash during hydration.
 */
export function ChatLayoutShell({ children, session = null }: ChatLayoutShellProps) {
  return (
    <ThreadHeaderProvider>
      <SidebarProvider>
        <AppSidebar initialSession={session} />

        <SidebarInset id="main-scroll-container" className="flex flex-col relative">
          <ChatHeaderSwitch />
          <main id="main-content" className="flex flex-col flex-1 min-h-0">
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </ThreadHeaderProvider>
  );
}
