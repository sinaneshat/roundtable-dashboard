import type { Metadata } from 'next';
import type React from 'react';

import { BreadcrumbProvider } from '@/components/chat/breadcrumb-context';
import { ChatContentWrapper } from '@/components/chat/chat-content-wrapper';
import { NavigationHeader } from '@/components/chat/chat-header';
import { AppSidebar } from '@/components/chat/chat-nav';
import { BreadcrumbStructuredData } from '@/components/seo';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { BRAND } from '@/constants/brand';
import { createMetadata } from '@/utils/metadata';

export async function generateMetadata(): Promise<Metadata> {
  return createMetadata({
    title: `Chat - ${BRAND.fullName}`,
    description: 'Manage your conversations and chat history.',
    robots: 'noindex, nofollow', // Chat is private, don't index
  });
}

export default async function ChatLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal?: React.ReactNode;
}) {
  return (
    <>
      <BreadcrumbStructuredData
        items={[
          { name: 'Home', url: '/' },
          { name: 'Chat', url: '/chat' },
        ]}
      />
      <BreadcrumbProvider>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset className="h-svh">
            <NavigationHeader />
            <ChatContentWrapper>
              <div className="flex flex-1 flex-col w-full min-w-0 overflow-hidden">
                {children}
              </div>
            </ChatContentWrapper>
          </SidebarInset>
        </SidebarProvider>
      </BreadcrumbProvider>
      {modal}
    </>
  );
}
