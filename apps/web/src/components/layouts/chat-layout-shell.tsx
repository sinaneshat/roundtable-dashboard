import type React from 'react';

import { ChatHeaderSwitch } from '@/components/chat/chat-header-switch';
import { AppSidebar } from '@/components/chat/chat-nav';
import { ThreadHeaderProvider } from '@/components/chat/thread-header-context';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import type { SessionData } from '@/lib/auth';

// ✅ SSR: Direct import - sidebar renders on server with prefetched data
// Data is prefetched in _protected.tsx loader via ensureInfiniteQueryData(sidebarThreadsQueryOptions)
// The shared queryOptions ensure SSR/client cache consistency

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
        <AppSidebar initialSession={session} />

        <SidebarInset id="main-scroll-container" className="flex flex-col relative">
          <ChatHeaderSwitch />
          {children}
        </SidebarInset>
      </SidebarProvider>
    </ThreadHeaderProvider>
  );
}
