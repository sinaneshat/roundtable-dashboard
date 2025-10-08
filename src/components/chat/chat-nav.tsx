'use client';

import { Plus, Search } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ChatList } from '@/components/chat/chat-list';
import { CommandSearch } from '@/components/chat/command-search';
import { NavUser } from '@/components/chat/nav-user';
import { UsageMetrics } from '@/components/chat/usage-metrics';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BRAND } from '@/constants/brand';
import { useDeleteThreadMutation } from '@/hooks/mutations/chat-mutations';
import { useThreadsQuery } from '@/hooks/queries/chat-threads';
import { toastManager } from '@/lib/toast/toast-manager';
import type { Chat } from '@/lib/types/chat';
import { groupChatsByPeriod } from '@/lib/types/chat';

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const router = useRouter();
  const t = useTranslations();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { isMobile, setOpenMobile } = useSidebar();

  // Fetch real threads from API with infinite scroll (50 items initially, 20 per page after)
  const {
    data: threadsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useThreadsQuery();

  // Mutations
  const deleteThreadMutation = useDeleteThreadMutation();

  // Transform threads to Chat type
  const chats: Chat[] = useMemo(() => {
    if (!threadsData?.pages)
      return [];

    const threads = threadsData.pages.flatMap(page =>
      page.success && page.data?.items ? page.data.items : [],
    );

    return threads.map(thread => ({
      id: thread.id,
      title: thread.title,
      slug: thread.slug,
      createdAt: new Date(thread.createdAt),
      updatedAt: new Date(thread.updatedAt),
      messages: [], // Messages loaded separately when viewing thread
      isFavorite: thread.isFavorite ?? false,
      isPublic: thread.isPublic ?? false,
    }));
  }, [threadsData]);

  // Keyboard shortcut to open search (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
        // Close mobile sidebar when search opens
        if (isMobile) {
          setOpenMobile(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobile, setOpenMobile]);

  const handleNewChat = () => {
    router.push('/chat');
  };

  const handleDeleteChat = (chatId: string) => {
    // Find the chat being deleted to get its slug
    const chat = chats.find(c => c.id === chatId);
    const chatSlug = chat?.slug;

    deleteThreadMutation.mutate(chatId, {
      onSuccess: () => {
        // If deleting the currently viewed thread, redirect to /chat
        if (chatSlug) {
          const currentPath = window.location.pathname;
          if (currentPath.includes(`/chat/${chatSlug}`)) {
            router.push('/chat');
          }
        }
      },
      onError: () => {
        toastManager.error(
          t('chat.threadDeleteFailed'),
          t('chat.threadDeleteFailedDescription'),
        );
      },
    });
  };

  // Get favorites from chats
  const favorites = useMemo(() =>
    chats.filter(chat => chat.isFavorite), [chats]);

  // Get non-favorite chats for grouping
  const nonFavoriteChats = useMemo(() =>
    chats.filter(chat => !chat.isFavorite), [chats]);

  const chatGroups = groupChatsByPeriod(nonFavoriteChats);

  // Extract loading states from mutations
  const deletingChatId = deleteThreadMutation.isPending ? deleteThreadMutation.variables : null;

  // Infinite scroll handler - Following TanStack Query official patterns
  const handleScroll = useCallback(() => {
    if (!scrollAreaRef.current || !hasNextPage || isFetchingNextPage)
      return;

    const { scrollTop, scrollHeight, clientHeight } = scrollAreaRef.current;
    const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;

    // Load more when scrolled to 80% of the content
    // Following official TanStack Query pattern: hasNextPage && !isFetchingNextPage && fetchNextPage()
    if (scrollPercentage > 0.8) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Attach scroll listener
  useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea)
      return;

    scrollArea.addEventListener('scroll', handleScroll);
    return () => scrollArea.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  return (
    <>
      <TooltipProvider>
        <Sidebar collapsible="icon" {...props}>
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton size="lg" asChild>
                  <Link href="/chat">
                    <div className="flex aspect-square size-8 items-center justify-center rounded-lg">
                      <Image
                        src="/static/logo.png"
                        alt={t('brand.logoAlt')}
                        width={32}
                        height={32}
                        className="size-6 object-contain"
                      />
                    </div>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">{BRAND.name}</span>
                      <span className="truncate text-xs">{BRAND.tagline}</span>
                    </div>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* New Chat Button - Visible in both expanded and collapsed states */}
              <SidebarMenuItem>
                <SidebarMenuButton onClick={handleNewChat} tooltip={t('navigation.newChat')}>
                  <Plus className="size-4" />
                  <span>{t('navigation.newChat')}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>

            {/* Search Button - Only visible when expanded */}
            <SidebarGroup className="py-0 group-data-[collapsible=icon]:hidden">
              <Button
                variant="outline"
                className="w-full justify-start text-sm text-muted-foreground h-9"
                onClick={() => {
                  setIsSearchOpen(true);
                  // Close mobile sidebar when search opens
                  if (isMobile) {
                    setOpenMobile(false);
                  }
                }}
              >
                <Search className="size-4 mr-2" />
                <span className="flex-1 text-left">{t('chat.searchChats')}</span>
                <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                  <span className="text-xs">⌘</span>
                  K
                </kbd>
              </Button>
            </SidebarGroup>
          </SidebarHeader>

          <SidebarContent className="p-0">
            <ScrollArea ref={scrollAreaRef} className="h-full w-full">
              <div className="px-2 py-2">
                <ChatList
                  chatGroups={chatGroups}
                  favorites={favorites}
                  onDeleteChat={handleDeleteChat}
                  searchTerm=""
                  deletingChatId={deletingChatId}
                />

                {/* Loading skeleton for next page */}
                {isFetchingNextPage && (
                  <div className="px-2 space-y-1 my-2">
                    <div className="h-10 bg-accent animate-pulse rounded-md" />
                    <div className="h-10 bg-accent animate-pulse rounded-md" />
                    <div className="h-10 bg-accent animate-pulse rounded-md" />
                  </div>
                )}

                {/* Show end message when no more pages */}
                {!hasNextPage && !isFetchingNextPage && chats.length > 0 && (
                  <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                    That's all for now
                  </div>
                )}
              </div>
            </ScrollArea>
          </SidebarContent>

          <SidebarFooter>
            <UsageMetrics />
            <NavUser />
          </SidebarFooter>

          <SidebarRail />
        </Sidebar>

        {/* Command Search Modal */}
        <CommandSearch
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
        />
      </TooltipProvider>
    </>
  );
}
