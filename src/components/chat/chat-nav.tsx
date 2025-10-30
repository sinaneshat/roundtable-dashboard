'use client';
import { FolderKanban, MessageSquarePlus, Plus, Search, Sparkles, Star } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
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
  SidebarHeader,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BRAND } from '@/constants/brand';
import { useDeleteThreadMutation } from '@/hooks/mutations/chat-mutations';
import { useThreadsQuery } from '@/hooks/queries/chat';
import { useUsageStatsQuery } from '@/hooks/queries/usage';
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
  const { data: usageData } = useUsageStatsQuery();
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
  const nonFavoriteChats = useMemo(() =>
    chats.filter(chat => !chat.isFavorite), [chats]);
  const chatGroups = groupChatsByPeriod(nonFavoriteChats);
  const deletingChatId = deleteThreadMutation.isPending && deleteThreadMutation.variables?.param?.id
    ? deleteThreadMutation.variables.param.id
    : null;
  const subscriptionTier = usageData?.success ? usageData.data.subscription.tier : 'free';
  const isFreeUser = subscriptionTier === 'free';
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
          <SidebarHeader className="border-b border-sidebar-border">
            {/* Header - Expanded (logo, brand name, and toggle) */}
            <div className="flex items-center justify-between px-3 py-3 group-data-[collapsible=icon]:hidden">
              <Link
                href="/chat"
                onClick={() => {
                  if (isMobile) {
                    setOpenMobile(false);
                  }
                }}
                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
              >
                <Image
                  src={BRAND.logos.main}
                  alt={`${BRAND.displayName} Logo`}
                  width={24}
                  height={24}
                  className="size-6 object-contain"
                  loading="lazy"
                />
                <span className="font-semibold text-sm">{BRAND.displayName}</span>
              </Link>
              <SidebarTrigger className="size-8 hover:bg-sidebar-accent rounded-md" />
            </div>

            {/* Header - Collapsed (just logo centered) */}
            <div className="hidden group-data-[collapsible=icon]:flex items-center justify-center py-3">
              <Link
                href="/chat"
                onClick={() => {
                  if (isMobile) {
                    setOpenMobile(false);
                  }
                }}
                className="flex items-center justify-center hover:opacity-80 transition-opacity"
              >
                <Image
                  src={BRAND.logos.main}
                  alt={`${BRAND.displayName} Logo`}
                  width={24}
                  height={24}
                  className="size-6 object-contain"
                  loading="lazy"
                />
              </Link>
            </div>

            {/* Action Buttons - Expanded */}
            <div className="px-2 pb-2 space-y-1 group-data-[collapsible=icon]:hidden">
              <Button
                variant="ghost"
                className="w-full justify-start h-9 font-normal hover:bg-sidebar-accent"
                onClick={handleNewChat}
              >
                <Plus className="size-4 mr-2 shrink-0" />
                <span>{t('navigation.newChat')}</span>
              </Button>

              <Button
                variant="ghost"
                className="w-full justify-start h-9 font-normal hover:bg-sidebar-accent"
                onClick={() => {
                  setIsSearchOpen(true);
                  if (isMobile) {
                    setOpenMobile(false);
                  }
                }}
              >
                <Search className="size-4 mr-2 shrink-0" />
                <span>{t('chat.searchChats')}</span>
              </Button>

              <Button
                variant="ghost"
                className="w-full justify-start h-9 font-normal hover:bg-sidebar-accent"
                disabled
              >
                <FolderKanban className="size-4 mr-2 shrink-0" />
                <span>Projects</span>
                <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0">
                  Soon
                </Badge>
              </Button>
            </div>

            {/* Icon Buttons - Collapsed */}
            <div className="hidden group-data-[collapsible=icon]:flex flex-col items-center gap-1 pb-2">
              <Button
                variant="ghost"
                size="icon"
                className="size-8 hover:bg-sidebar-accent"
                onClick={handleNewChat}
                title={t('navigation.newChat')}
              >
                <Plus className="size-4" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="size-8 hover:bg-sidebar-accent"
                onClick={() => {
                  setIsSearchOpen(true);
                  if (isMobile) {
                    setOpenMobile(false);
                  }
                }}
                title={t('chat.searchChats')}
              >
                <Search className="size-4" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="size-8 hover:bg-sidebar-accent"
                disabled
                title="Projects (Coming Soon)"
              >
                <FolderKanban className="size-4" />
              </Button>
            </div>
          </SidebarHeader>
          <SidebarContent className="p-0">
            <ScrollArea ref={scrollAreaRef} className="h-full w-full">
              <div className="px-2 py-3 space-y-3">
                {/* Favorites Section */}
                {!isLoading && !isError && favorites.length > 0 && (
                  <div className="group-data-[collapsible=icon]:hidden space-y-1">
                    <div className="flex items-center justify-between px-2 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <Star className="size-3.5 shrink-0 fill-amber-500 text-amber-500" />
                        <h3 className="text-sm font-semibold text-foreground">
                          {t('chat.favorites')}
                        </h3>
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {favorites.length}
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      <ChatList
                        chatGroups={[]}
                        favorites={favorites}
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
                    </div>
                  </div>
                )}

                {/* Loading State */}
                {isLoading && <ChatSidebarSkeleton count={15} showFavorites={false} />}

                {/* Error State */}
                {isError && (
                  <div className="px-3 py-6 text-center group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium text-destructive mb-1">
                      {t('states.error.default')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {error?.message || t('states.error.description')}
                    </p>
                  </div>
                )}

                {/* Empty State */}
                {!isLoading && !isError && chats.length === 0 && (
                  <div className="group-data-[collapsible=icon]:hidden">
                    <Empty className="border-none p-4">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <MessageSquarePlus className="size-8" />
                        </EmptyMedia>
                        <EmptyTitle className="text-sm font-semibold">{t('chat.noChatsYet')}</EmptyTitle>
                        <EmptyDescription className="text-xs text-muted-foreground">
                          {t('chat.noChatsDescription')}
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  </div>
                )}

                {/* Main Chat List - Expanded */}
                {!isLoading && !isError && chatGroups.length > 0 && (
                  <div className="group-data-[collapsible=icon]:hidden space-y-2">
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
                      <div className="px-2 py-4 text-center">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                          {t('chat.noMoreThreads')}
                        </p>
                      </div>
                    )}
                  </div>
                )}

              </div>
            </ScrollArea>
          </SidebarContent>
          <SidebarFooter>
            {isFreeUser && (
              <div className="p-2 group-data-[collapsible=icon]:hidden">
                <Button
                  variant="outline"
                  className="w-full justify-start h-auto py-3 px-3 border-sidebar-border hover:bg-sidebar-accent"
                  asChild
                >
                  <Link href="/chat/pricing">
                    <div className="flex items-start gap-3 w-full">
                      <div className="flex-shrink-0 mt-0.5">
                        <Sparkles className="size-4 text-amber-500" />
                      </div>
                      <div className="flex-1 text-left space-y-0.5">
                        <div className="text-sm font-medium text-foreground">
                          {t('pricing.card.upgradePlan')}
                        </div>
                        <div className="text-xs text-muted-foreground leading-snug">
                          {t('pricing.card.upgradeDescription')}
                        </div>
                      </div>
                    </div>
                  </Link>
                </Button>
              </div>
            )}
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
