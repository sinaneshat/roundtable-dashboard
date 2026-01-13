import type React from 'react';
import { Suspense } from 'react';

import { ChatHeaderSwitch } from '@/components/chat/chat-header-switch';
import { AppSidebar } from '@/components/chat/chat-nav';
import { ThreadHeaderProvider } from '@/components/chat/thread-header-context';
import { SidebarLoadingFallback } from '@/components/loading';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import type { SessionData } from '@/lib/auth';

type ChatLayoutShellProps = {
  children: React.ReactNode;
  session?: SessionData | null;
};

/**
 * Chat Layout Shell - Pure UI wrapper (no auth, no prefetching)
 * Provides sidebar navigation and header structure.
 * Auth and data fetching handled by route groups.
 */
export function ChatLayoutShell({ children, session = null }: ChatLayoutShellProps) {
  return (
    <ThreadHeaderProvider>
      <SidebarProvider>
        <Suspense fallback={<SidebarLoadingFallback count={10} showFavorites={false} />}>
          <AppSidebar initialSession={session} />
        </Suspense>

        <SidebarInset id="main-scroll-container" className="flex flex-col relative">
          <ChatHeaderSwitch />
          {children}
        </SidebarInset>
      </SidebarProvider>
    </ThreadHeaderProvider>
  );
}
