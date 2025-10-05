import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import type React from 'react';

import { BreadcrumbProvider } from '@/components/chat/breadcrumb-context';
import { ChatContentWrapper } from '@/components/chat/chat-content-wrapper';
import { NavigationHeader } from '@/components/chat/chat-header';
import { AppSidebar } from '@/components/chat/chat-nav';
import { BreadcrumbStructuredData } from '@/components/seo';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { BRAND } from '@/constants/brand';
import { getQueryClient } from '@/lib/data/query-client';
import { queryKeys } from '@/lib/data/query-keys';
import {
  getSubscriptionsService,
  getUserUsageStatsService,
  listThreadsService,
} from '@/services/api';
import { createMetadata } from '@/utils/metadata';

export async function generateMetadata(): Promise<Metadata> {
  return createMetadata({
    title: `Chat - ${BRAND.fullName}`,
    description: 'Manage your conversations and chat history.',
    robots: 'noindex, nofollow', // Chat is private, don't index
  });
}

/**
 * Chat Layout - Server Component with Prefetching
 * Prefetches data used by sidebar components (AppSidebar, UsageMetrics, NavUser)
 * for instant hydration and optimal UX
 */
export default async function ChatLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal?: React.ReactNode;
}) {
  const queryClient = getQueryClient();

  // Prefetch data for sidebar components
  // This prevents loading states in AppSidebar, UsageMetrics, and NavUser
  await Promise.all([
    // Threads list for AppSidebar
    queryClient.prefetchInfiniteQuery({
      queryKey: queryKeys.threads.lists(),
      queryFn: ({ pageParam }) => listThreadsService(pageParam ? { query: { cursor: pageParam } } : undefined),
      initialPageParam: undefined,
      staleTime: 30 * 1000, // 30 seconds
    }),
    // Usage stats for UsageMetrics and NavUser
    queryClient.prefetchQuery({
      queryKey: queryKeys.usage.stats(),
      queryFn: () => getUserUsageStatsService(),
      staleTime: 60 * 1000, // 1 minute
    }),
    // Subscriptions for NavUser
    queryClient.prefetchQuery({
      queryKey: queryKeys.subscriptions.list(),
      queryFn: () => getSubscriptionsService(),
      staleTime: 2 * 60 * 1000, // 2 minutes
    }),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
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
    </HydrationBoundary>
  );
}
