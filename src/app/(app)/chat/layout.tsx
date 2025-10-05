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
          <SidebarInset>
            <NavigationHeader />
            <ChatContentWrapper>
              <div className="flex flex-1 flex-col gap-6 p-4 pt-0 lg:ps-6 lg:pe-6 lg:pt-0 w-full min-w-0">
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
