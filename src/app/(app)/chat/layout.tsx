import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import type React from 'react';

import { NavigationHeader } from '@/components/chat/chat-header';
import { AppSidebar } from '@/components/chat/chat-nav';
import { ThreadHeaderProvider } from '@/components/chat/thread-header-context';
import { BreadcrumbStructuredData } from '@/components/seo';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { BRAND } from '@/constants/brand';
import { getQueryClient } from '@/lib/data/query-client';
import { createMetadata } from '@/utils/metadata';

export async function generateMetadata(): Promise<Metadata> {
  return createMetadata({
    title: `Chat - ${BRAND.fullName}`,
    description: 'Manage your conversations and chat history.',
    robots: 'noindex, nofollow', // Chat is private, don't index
  });
}

/**
 * Chat Layout - Server Component
 * Provides sidebar navigation and header for all /chat routes
 *
 * Data fetching handled by client-side useQuery hooks in:
 * - AppSidebar (threads list)
 * - UsageMetrics (usage stats)
 * - NavUser (subscriptions)
 */
export default async function ChatLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal?: React.ReactNode;
}) {
  const queryClient = getQueryClient();

  // OPTIMIZATION: Removed layout-level prefetching to prevent excessive RSC calls
  //
  // Why this is better:
  // 1. Layout prefetching runs on EVERY navigation within /chat routes
  // 2. Client components (AppSidebar, UsageMetrics, NavUser) already fetch data with useQuery
  // 3. Those queries have proper staleTime configured (30s, 60s, 2min)
  // 4. TanStack Query handles caching automatically
  //
  // Result: ~3 fewer RSC calls per navigation, better performance
  //
  // Previous prefetching:
  // - queryClient.prefetchInfiniteQuery({ queryKey: queryKeys.threads.lists(), staleTime: 30s })
  // - queryClient.prefetchQuery({ queryKey: queryKeys.usage.stats(), staleTime: 60s })
  // - queryClient.prefetchQuery({ queryKey: queryKeys.subscriptions.list(), staleTime: 2min })
  //
  // Now handled by client-side useQuery with same staleTime configuration

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <BreadcrumbStructuredData
        items={[
          { name: 'Home', url: '/' },
          { name: 'Chat', url: '/chat' },
        ]}
      />
      <ThreadHeaderProvider>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset className="h-svh flex flex-col">
            <NavigationHeader />
            <div className="flex flex-1 flex-col w-full min-w-0 relative">
              {children}
            </div>
          </SidebarInset>
        </SidebarProvider>
      </ThreadHeaderProvider>
      {modal}
    </HydrationBoundary>
  );
}
