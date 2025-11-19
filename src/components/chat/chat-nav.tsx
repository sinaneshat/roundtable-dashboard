'use client';
import { MessageSquarePlus, Plus, Search, Sparkles, Star } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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
import { useNavigationReset } from '@/hooks/utils/use-navigation-reset';
import { toastManager } from '@/lib/toast/toast-manager';

function AppSidebarComponent({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const sidebarContentRef = useRef<HTMLDivElement>(null);
  const { isMobile, setOpenMobile } = useSidebar();
  const handleNavigationReset = useNavigationReset();
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
  const handleNavLinkClick = useCallback((e: React.MouseEvent) => {
    // ✅ CRITICAL: Prevent default link navigation
    // We need to reset FIRST, then navigate manually
    e.preventDefault();

    // ✅ CRITICAL: Reset store SYNCHRONOUSLY before navigating
    // Cancels streams, clears state, prevents memory leaks
    handleNavigationReset();

    // ✅ IMMEDIATE NAVIGATION: Navigate to /chat after reset
    router.push('/chat');

    // Close mobile sidebar when navigating
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [handleNavigationReset, router, isMobile, setOpenMobile]);
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
                  <Link href="/chat" onClick={handleNavLinkClick}>
                    <img
                      src={BRAND.logos.main}
                      alt={`${BRAND.name} Logo`}
                      className="size-10 object-contain shrink-0"
                      loading="lazy"
                    />
                    <span
                      className="truncate min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-base font-bold"
                      style={{ maxWidth: '11rem' }}
                    >
                      {BRAND.name}
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Logo - Collapsed */}
              <SidebarMenuItem className="hidden group-data-[collapsible=icon]:flex mb-2 items-center justify-center">
                <Link href="/chat" onClick={handleNavLinkClick} className="p-0 m-0 block">
                  <img
                    src={BRAND.logos.main}
                    alt={`${BRAND.name} Logo`}
                    className="size-12 object-contain shrink-0"
                    loading="lazy"
                  />
                </Link>
              </SidebarMenuItem>

              {/* Action Buttons - Expanded */}
              <SidebarMenuItem className="group-data-[collapsible=icon]:hidden">
                <SidebarMenuButton asChild isActive={pathname === '/chat'}>
                  <Link href="/chat" onClick={handleNavLinkClick}>
                    <Plus className="size-4 shrink-0" />
                    <span
                      className="truncate min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"
                      style={{ maxWidth: '12rem' }}
                    >
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
                  <span
                    className="truncate min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"
                    style={{ maxWidth: '12rem' }}
                  >
                    {t('navigation.searchChats')}
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem className="group-data-[collapsible=icon]:hidden">
                <SidebarMenuButton asChild isActive={pathname?.startsWith('/chat/pricing')}>
                  <Link href="/chat/pricing">
                    <Sparkles className="size-4 shrink-0" />
                    <span
                      className="truncate min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"
                      style={{ maxWidth: '12rem' }}
                    >
                      {t('navigation.upgrade')}
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* User Account - Expanded */}
              <SidebarMenuItem className="group-data-[collapsible=icon]:hidden">
                <NavUser />
              </SidebarMenuItem>

              {/* Icon Buttons - Collapsed */}
              <SidebarMenuItem className="hidden group-data-[collapsible=icon]:flex">
                <SidebarMenuButton asChild tooltip={t('navigation.newChat')} isActive={pathname === '/chat'}>
                  <Link href="/chat" onClick={handleNavLinkClick}>
                    <Plus />
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
                  tooltip={t('navigation.searchChats')}
                >
                  <Search />
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem className="hidden group-data-[collapsible=icon]:flex">
                <SidebarMenuButton
                  asChild
                  tooltip={t('navigation.upgrade')}
                  isActive={pathname?.startsWith('/chat/pricing')}
                >
                  <Link href="/chat/pricing">
                    <Sparkles />
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* User Account - Collapsed */}
              <SidebarMenuItem className="hidden group-data-[collapsible=icon]:flex">
                <NavUser />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>
          <SidebarContent className="p-0 w-full min-w-0">
            <ScrollArea ref={sidebarContentRef} className="w-full h-full">
              <div className="flex flex-col w-full">
                {/* Favorites Section */}
                {!isLoading && !isError && favorites.length > 0 && (
                  <>
                    <div className="flex items-center justify-between px-2 pt-2 pb-1 w-full min-w-0 group-data-[collapsible=icon]:hidden">
                      <div className="flex items-center gap-2 min-w-0 flex-1" style={{ maxWidth: '11rem' }}>
                        <Star className="size-4 shrink-0 fill-amber-500 text-amber-500" />
                        <span
                          className="text-sm font-medium text-foreground truncate min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"
                          style={{ maxWidth: '9rem' }}
                        >
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
                  <SidebarGroup className="group-data-[collapsible=icon]:hidden px-2">
                    <Empty className="border-none p-6">
                      <EmptyHeader>
                        <EmptyMedia variant="icon" className="mb-3">
                          <MessageSquarePlus className="size-5" />
                        </EmptyMedia>
                        <EmptyTitle className="text-sm font-semibold">{t('chat.noChatsYet')}</EmptyTitle>
                        <EmptyDescription className="text-xs text-muted-foreground leading-relaxed mt-1.5">
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
