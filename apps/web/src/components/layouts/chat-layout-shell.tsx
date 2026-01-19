import type React from 'react';

import { ChatHeaderSwitch } from '@/components/chat/chat-header-switch';
import { ThreadHeaderProvider } from '@/components/chat/thread-header-context';
import { SidebarLoadingFallback } from '@/components/loading';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import type { SessionData } from '@/lib/auth';
import dynamic from '@/lib/utils/dynamic';

// Dynamic import with ssr:false prevents hydration mismatch from React Query cache
const AppSidebar = dynamic(
  () => import('@/components/chat/chat-nav').then(m => ({ default: m.AppSidebar })),
  { ssr: false, loading: () => <SidebarLoadingFallback count={10} /> },
);

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
