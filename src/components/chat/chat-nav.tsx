'use client';
import { FolderKanban, MessageSquarePlus, Plus, Search, Sparkles, Star } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { SubscriptionTier } from '@/api/services/product-logic.service';
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import { useUsageStatsQuery } from '@/hooks/queries/usage';
import { toastManager } from '@/lib/toast/toast-manager';

function AppSidebarComponent({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const router = useRouter();
  const t = useTranslations();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const sidebarContentRef = useRef<HTMLDivElement>(null);
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
  const subscriptionTier = (usageData?.success ? usageData.data.subscription.tier : 'free') as SubscriptionTier;
  const isFreeUser = subscriptionTier === 'free';
  const handleScroll = useCallback(() => {
    if (!sidebarContentRef.current || !hasNextPage || isFetchingNextPage)
      return;
    const { scrollTop, scrollHeight, clientHeight } = sidebarContentRef.current;
    const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;
    if (scrollPercentage > 0.8) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  useEffect(() => {
    const viewport = sidebarContentRef.current;
    if (!viewport)
      return;
    viewport.addEventListener('scroll', handleScroll);
    return () => viewport.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);
  return (
    <>
      <TooltipProvider>
        <Sidebar collapsible="icon" variant="floating" {...props}>
          <SidebarHeader>
            <SidebarMenu className="gap-1">
              {/* Logo/Brand */}
              <SidebarMenuItem className="group-data-[collapsible=icon]:hidden mb-2">
                <SidebarMenuButton size="lg" asChild className="hover:bg-transparent">
                  <Link
                    href="/chat"
                    onClick={() => {
                      if (isMobile) {
                        setOpenMobile(false);
                      }
                    }}
                  >
                    <Image
                      src={BRAND.logos.main}
                      alt={`${BRAND.displayName} Logo`}
                      width={40}
                      height={40}
                      className="size-10 object-contain shrink-0"
                      loading="lazy"
                    />
                    <span className="truncate min-w-0">
                      {BRAND.displayName}
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Logo - Collapsed */}
              <SidebarMenuItem className="hidden group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:justify-center mb-2">
                <SidebarMenuButton size="lg" asChild className="hover:bg-transparent" tooltip={BRAND.displayName}>
                  <Link
                    href="/chat"
                    onClick={() => {
                      if (isMobile) {
                        setOpenMobile(false);
                      }
                    }}
                  >
                    <Image
                      src={BRAND.logos.main}
                      alt={`${BRAND.displayName} Logo`}
                      width={40}
                      height={40}
                      className="size-10 object-contain shrink-0"
                      loading="lazy"
                    />
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Action Buttons - Expanded */}
              <SidebarMenuItem className="group-data-[collapsible=icon]:hidden">
                <SidebarMenuButton asChild>
                  <Link
                    href="/chat"
                    onClick={handleNewChat}
                  >
                    <Plus className="size-4 shrink-0" />
                    <span className="truncate min-w-0">
                      {t('navigation.newChat')}
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem className="group-data-[collapsible=icon]:hidden">
                <SidebarMenuButton
                  onClick={() => {
                    setIsSearchOpen(true);
                    if (isMobile) {
                      setOpenMobile(false);
                    }
                  }}
                >
                  <Search className="size-4 shrink-0" />
                  <span className="truncate min-w-0">
                    {t('chat.searchChats')}
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem className="group-data-[collapsible=icon]:hidden">
                <SidebarMenuButton disabled>
                  <FolderKanban className="size-4 shrink-0" />
                  <span className="truncate min-w-0">
                    Projects
                  </span>
                  <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0 shrink-0">
                    Soon
                  </Badge>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Icon Buttons - Collapsed */}
              <SidebarMenuItem className="hidden group-data-[collapsible=icon]:flex">
                <SidebarMenuButton
                  asChild
                  tooltip={t('navigation.newChat')}
                  className="group-data-[collapsible=icon]:w-full"
                >
                  <Link
                    href="/chat"
                    onClick={handleNewChat}
                  >
                    <Plus className="size-4" />
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem className="hidden group-data-[collapsible=icon]:flex">
                <SidebarMenuButton
                  onClick={() => {
                    setIsSearchOpen(true);
                    if (isMobile) {
                      setOpenMobile(false);
                    }
                  }}
                  tooltip={t('chat.searchChats')}
                  className="group-data-[collapsible=icon]:w-full"
                >
                  <Search className="size-4" />
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem className="hidden group-data-[collapsible=icon]:flex">
                <SidebarMenuButton
                  disabled
                  tooltip="Projects (Coming Soon)"
                  className="group-data-[collapsible=icon]:w-full"
                >
                  <FolderKanban className="size-4" />
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>
          <SidebarContent className="overflow-hidden p-0 w-full min-w-0">
            <ScrollArea ref={sidebarContentRef} className="w-full h-full">
              <div className="flex flex-col w-full">
                {/* Favorites Section */}
                {!isLoading && !isError && favorites.length > 0 && (
                  <>
                    <div className="flex items-center justify-between px-2 pt-2 pb-1 w-full min-w-0 group-data-[collapsible=icon]:hidden">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Star className="size-4 shrink-0 fill-amber-500 text-amber-500" />
                        <span className="text-sm font-medium text-foreground truncate min-w-0">
                          {t('chat.favorites')}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                        {favorites.length}
                      </span>
                    </div>
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
                  </>
                )}

                {/* Loading State */}
                {isLoading && (
                  <SidebarGroup className="group-data-[collapsible=icon]:hidden">
                    <ChatSidebarSkeleton count={15} showFavorites={false} />
                  </SidebarGroup>
                )}

                {/* Error State */}
                {isError && (
                  <SidebarGroup className="group-data-[collapsible=icon]:hidden">
                    <div className="py-6 text-center">
                      <p className="text-sm font-medium text-destructive mb-1">
                        {t('states.error.default')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {error?.message || t('states.error.description')}
                      </p>
                    </div>
                  </SidebarGroup>
                )}

                {/* Empty State */}
                {!isLoading && !isError && chats.length === 0 && (
                  <SidebarGroup className="group-data-[collapsible=icon]:hidden">
                    <Empty className="border-none">
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
                  </SidebarGroup>
                )}

                {/* Main Chat List */}
                {!isLoading && !isError && chatGroups.length > 0 && (
                  <>
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
                    {isFetchingNextPage && (
                      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
                        <ChatSidebarPaginationSkeleton count={20} />
                      </SidebarGroup>
                    )}
                  </>
                )}
              </div>
            </ScrollArea>
          </SidebarContent>
          <SidebarFooter>
            {isFreeUser && (
              <div className="group-data-[collapsible=icon]:hidden">
                <Card variant="glass-subtle" className="border-sidebar-border">
                  <CardHeader className="p-3 pb-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="size-4 text-amber-500 shrink-0" />
                      <CardTitle className="text-sm">
                        {t('pricing.card.upgradePlan')}
                      </CardTitle>
                    </div>
                    <CardDescription className="text-xs leading-relaxed">
                      {t('pricing.card.upgradeDescription')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <Button
                      variant="outline"
                      className="w-full justify-center border-sidebar-border hover:bg-sidebar-accent"
                      size="sm"
                      asChild
                    >
                      <Link href="/chat/pricing">
                        {t('pricing.card.upgradeToPro')}
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
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
