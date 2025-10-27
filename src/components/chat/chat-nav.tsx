'use client';
import { Flame, MessageSquare, MessageSquarePlus, Plus, Search, Star } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { Chat } from '@/components/chat/chat-list';
import { ChatList, groupChatsByPeriod } from '@/components/chat/chat-list';
import {
  ChatSidebarPaginationSkeleton,
  ChatSidebarSkeleton,
} from '@/components/chat/chat-sidebar-skeleton';
import { CommandSearch } from '@/components/chat/command-search';
import { NavUser } from '@/components/chat/nav-user';
import { SidebarSection } from '@/components/chat/sidebar-section';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
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
import { useThreadsQuery } from '@/hooks/queries/chat';
import { toastManager } from '@/lib/toast/toast-manager';

function AppSidebarComponent({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const router = useRouter();
  const t = useTranslations();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { isMobile, setOpenMobile } = useSidebar();
  const {
    data: threadsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
  } = useThreadsQuery();
  const deleteThreadMutation = useDeleteThreadMutation();
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
      messages: [],
      isFavorite: thread.isFavorite ?? false,
      isPublic: thread.isPublic ?? false,
    }));
  }, [threadsData]);
  // React 19.2 Pattern: Use ref to store callback, preventing listener re-mounting
  // Ref allows reading latest isMobile/setOpenMobile without re-adding listener
  const keyDownHandlerRef = useRef<((e: KeyboardEvent) => void) | null>(null);

  // React 19.2: Store latest callback in ref using useLayoutEffect (synchronous, before paint)
  // This avoids the "Cannot access refs during render" rule violation
  useLayoutEffect(() => {
    keyDownHandlerRef.current = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
        if (isMobile) {
          setOpenMobile(false);
        }
      }
    };
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keyDownHandlerRef.current?.(e);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []); // No dependencies - ref always has latest callback
  const handleNewChat = () => {
    router.push('/chat');
    if (isMobile) {
      setOpenMobile(false);
    }
  };
  const handleDeleteChat = (chatId: string) => {
    const chat = chats.find(c => c.id === chatId);
    const chatSlug = chat?.slug;
    deleteThreadMutation.mutate({ param: { id: chatId } }, {
      onSuccess: () => {
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
  const favorites = useMemo(() =>
    chats.filter(chat => chat.isFavorite), [chats]);
  const favoriteGroups = useMemo(() =>
    groupChatsByPeriod(favorites), [favorites]);
  const nonFavoriteChats = useMemo(() =>
    chats.filter(chat => !chat.isFavorite), [chats]);
  const chatGroups = groupChatsByPeriod(nonFavoriteChats);
  const deletingChatId = deleteThreadMutation.isPending && deleteThreadMutation.variables?.param?.id
    ? deleteThreadMutation.variables.param.id
    : null;
  const handleScroll = useCallback(() => {
    if (!scrollAreaRef.current || !hasNextPage || isFetchingNextPage)
      return;
    const { scrollTop, scrollHeight, clientHeight } = scrollAreaRef.current;
    const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;
    if (scrollPercentage > 0.8) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
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
                  <Link
                    href="/chat"
                    onClick={() => {
                      if (isMobile) {
                        setOpenMobile(false);
                      }
                    }}
                  >
                    <div className="flex aspect-square size-8 items-center justify-center rounded-lg">
                      <Image
                        src={BRAND.logos.main}
                        alt={`${BRAND.displayName} Logo`}
                        width={32}
                        height={32}
                        className="size-6 object-contain"
                        loading="lazy"
                      />
                    </div>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">{BRAND.displayName}</span>
                      <span className="truncate text-xs">{BRAND.tagline}</span>
                    </div>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={handleNewChat} tooltip={t('navigation.newChat')}>
                  <Plus className="size-4" />
                  <span>{t('navigation.newChat')}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem className="group-data-[collapsible=icon]:block hidden">
                <SidebarMenuButton
                  onClick={() => {
                    setIsSearchOpen(true);
                    if (isMobile) {
                      setOpenMobile(false);
                    }
                  }}
                  tooltip={t('chat.searchChats')}
                >
                  <Search className="size-4" />
                  <span>{t('chat.searchChats')}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <SidebarGroup className="py-0 group-data-[collapsible=icon]:hidden">
              <Button
                variant="outline"
                className="w-full justify-start text-sm text-muted-foreground h-9"
                onClick={() => {
                  setIsSearchOpen(true);
                  if (isMobile) {
                    setOpenMobile(false);
                  }
                }}
              >
                <Search className="size-4 mr-2" />
                <span className="flex-1 text-left">{t('chat.searchChats')}</span>
                <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                  <span className="text-xs">⌘</span>
                  K
                </kbd>
              </Button>
            </SidebarGroup>
          </SidebarHeader>
          <SidebarContent className="p-0">
            <ScrollArea ref={scrollAreaRef} className="h-full w-full">
              <div className="px-2 py-2 space-y-2">
                {!isLoading && !isError && favorites.length > 0 && (
                  <div className="group-data-[collapsible=icon]:hidden">
                    <SidebarSection
                      title={t('chat.favorites')}
                      icon={<Star className="size-3.5" />}
                      count={favorites.length}
                      defaultOpen={false}
                      collapsible
                    >
                      <ChatList
                        chatGroups={favoriteGroups}
                        favorites={[]}
                        onDeleteChat={handleDeleteChat}
                        searchTerm=""
                        deletingChatId={deletingChatId}
                        isMobile={isMobile}
                        onNavigate={() => {
                          if (isMobile) {
                            setOpenMobile(false);
                          }
                        }}
                      />
                    </SidebarSection>
                  </div>
                )}
                <div className="group-data-[collapsible=icon]:hidden">
                  <div className="space-y-1 opacity-60 cursor-not-allowed">
                    <div className="flex items-center justify-between px-2 py-1">
                      <div className="flex items-center gap-1.5">
                        <div className="text-orange-500">
                          <Flame className="size-3.5" />
                        </div>
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          {t('chat.trending')}
                        </h3>
                      </div>
                    </div>
                    <div className="px-2 py-2">
                      <p className="text-xs text-muted-foreground italic">
                        {t('chat.comingSoon')}
                      </p>
                    </div>
                  </div>
                </div>
                {isLoading && <ChatSidebarSkeleton count={15} showFavorites={false} />}
                {isError && (
                  <div className="px-2 py-4 text-center group-data-[collapsible=icon]:hidden">
                    <p className="text-sm text-destructive mb-2">
                      {t('states.error.default')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {error?.message || t('states.error.description')}
                    </p>
                  </div>
                )}
                {!isLoading && !isError && chats.length === 0 && (
                  <div className="px-2 py-4 group-data-[collapsible=icon]:hidden">
                    <Empty className="border-none p-4">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <MessageSquarePlus />
                        </EmptyMedia>
                        <EmptyTitle className="text-base">{t('chat.noChatsYet')}</EmptyTitle>
                        <EmptyDescription className="text-xs">
                          {t('chat.noChatsDescription')}
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  </div>
                )}
                {!isLoading && !isError && chatGroups.length > 0 && (
                  <div className="group-data-[collapsible=icon]:hidden">
                    <SidebarSection
                      title={t('navigation.chat')}
                      icon={<MessageSquare className="size-3.5" />}
                      count={chats.length}
                      defaultOpen
                      collapsible
                    >
                      <ChatList
                        chatGroups={chatGroups}
                        favorites={[]}
                        onDeleteChat={handleDeleteChat}
                        searchTerm=""
                        deletingChatId={deletingChatId}
                        isMobile={isMobile}
                        onNavigate={() => {
                          if (isMobile) {
                            setOpenMobile(false);
                          }
                        }}
                      />
                      {isFetchingNextPage && <ChatSidebarPaginationSkeleton count={20} />}
                      {!hasNextPage && !isFetchingNextPage && chats.length > 0 && (
                        <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                          {t('chat.noMoreThreads')}
                        </div>
                      )}
                    </SidebarSection>
                  </div>
                )}
              </div>
            </ScrollArea>
          </SidebarContent>
          <SidebarFooter>
            <NavUser />
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>
        <CommandSearch
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
        />
      </TooltipProvider>
    </>
  );
}
export const AppSidebar = React.memo(AppSidebarComponent);
