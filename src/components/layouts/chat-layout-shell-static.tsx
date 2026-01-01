'use client';

import dynamic from 'next/dynamic';
import type React from 'react';

import { ChatHeaderSwitch } from '@/components/chat/chat-header-switch';
import { ThreadHeaderProvider } from '@/components/chat/thread-header-context';
import { SidebarLoadingFallback } from '@/components/loading';
import { BreadcrumbStructuredData } from '@/components/seo';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

// Client-only sidebar - prevents SSG hydration mismatch
// During SSG: renders SidebarLoadingFallback
// On client: loads and renders AppSidebar
const AppSidebarClientOnly = dynamic(
  () => import('@/components/chat/chat-nav').then(mod => mod.AppSidebar),
  {
    ssr: false,
    loading: () => <SidebarLoadingFallback count={10} showFavorites={false} />,
  },
);

type ChatLayoutShellStaticProps = {
  children: React.ReactNode;
};

/**
 * Chat Layout Shell for Static Pages (SSG)
 *
 * Uses client-only sidebar to prevent hydration mismatch:
 * - SSG build: No session, sidebar would render empty
 * - Client: Session from cookies, sidebar renders with threads
 * - Mismatch causes React error #418
 *
 * Solution: Load sidebar only on client with `ssr: false`
 */
export function ChatLayoutShellStatic({ children }: ChatLayoutShellStaticProps) {
  return (
    <>
      <BreadcrumbStructuredData
        items={[
          { name: 'Home', url: '/' },
          { name: 'Chat', url: '/chat' },
        ]}
      />
      <ThreadHeaderProvider>
        <SidebarProvider>
          <AppSidebarClientOnly initialSession={null} />

          <SidebarInset id="main-scroll-container" className="flex flex-col relative">
            <ChatHeaderSwitch />
            {children}
          </SidebarInset>
        </SidebarProvider>
      </ThreadHeaderProvider>
    </>
  );
}
