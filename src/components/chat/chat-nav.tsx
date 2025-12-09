'use client';
import { MessageSquare, PanelLeft, Plus, Search, Sparkles, Star } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import React, { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';

import type { SubscriptionTier } from '@/api/services/product-logic.service';
import { SUBSCRIPTION_TIER_NAMES } from '@/api/services/product-logic.service';
import type { Chat } from '@/components/chat/chat-list';
import { ChatList, groupChatsByPeriod } from '@/components/chat/chat-list';
import {
  ChatSidebarPaginationSkeleton,
  ChatSidebarSkeleton,
} from '@/components/chat/chat-sidebar-skeleton';
import { CommandSearch } from '@/components/chat/command-search';
import { NavUser } from '@/components/chat/nav-user';
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
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BRAND } from '@/constants/brand';
import { useThreadsQuery } from '@/hooks/queries/chat';
import { useUsageStatsQuery } from '@/hooks/queries/usage';
import { useNavigationReset } from '@/hooks/utils';
import type { Session, User } from '@/lib/auth/types';

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  /** Server-side session for hydration - prevents mismatch */
  initialSession?: { session: Session; user: User } | null;
};

function AppSidebarComponent({ initialSession, ...props }: AppSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isLogoHovered, setIsLogoHovered] = useState(false);
  const sidebarContentRef = useRef<HTMLDivElement>(null);
  const { isMobile, setOpenMobile, state, toggleSidebar } = useSidebar();
  const isCollapsed = state === 'collapsed';
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
  const { data: usageData } = useUsageStatsQuery();
  const subscriptionTier: SubscriptionTier = usageData?.data?.subscription?.tier ?? 'free';
  const isPaidUser = subscriptionTier !== 'free';
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
      previousSlug: thread.previousSlug ?? null, // ✅ BACKWARDS COMPATIBLE: Include original slug
      createdAt: new Date(thread.createdAt),
      updatedAt: new Date(thread.updatedAt),
      messages: [],
      isFavorite: thread.isFavorite ?? false,
      isPublic: thread.isPublic ?? false,
    }));
  }, [threadsData]);
  // ✅ REACT 19: useEffectEvent for keyboard shortcut handler
  // Automatically captures latest isMobile/setOpenMobile without re-mounting listener
  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      setIsSearchOpen(true);
      if (isMobile) {
        setOpenMobile(false);
      }
    }
  });

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
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

  // ChatGPT-style: Logo click expands when collapsed, navigates when expanded
  const handleLogoClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();

    // If collapsed, expand instead of navigating
    if (isCollapsed) {
      toggleSidebar();
      return;
    }

    // Normal navigation behavior when expanded
    handleNavigationReset();
    router.push('/chat');
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [isCollapsed, toggleSidebar, handleNavigationReset, router, isMobile, setOpenMobile]);

  const favorites = useMemo(() =>
    chats.filter(chat => chat.isFavorite), [chats]);
  const nonFavoriteChats = useMemo(() =>
    chats.filter(chat => !chat.isFavorite), [chats]);
  const chatGroups = groupChatsByPeriod(nonFavoriteChats);

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
              {/* Logo row with trigger on right - ChatGPT style */}
              <SidebarMenuItem className="mb-2">
                <div className="flex items-center justify-between w-full">
                  {/* Logo - click expands when collapsed, navigates when expanded */}
                  <SidebarMenuButton
                    asChild
                    className={`hover:bg-transparent ${isCollapsed ? 'cursor-pointer' : ''}`}
                    tooltip={isCollapsed ? t('navigation.expandSidebar') : undefined}
                  >
                    <Link
                      href="/chat"
                      onClick={handleLogoClick}
                      onMouseEnter={() => setIsLogoHovered(true)}
                      onMouseLeave={() => setIsLogoHovered(false)}
                      className="flex items-center"
                    >
                      {/* Show sidebar icon on hover when collapsed, otherwise show logo */}
                      {isCollapsed && isLogoHovered
                        ? (
                            <PanelLeft className="size-6 shrink-0 text-sidebar-foreground" />
                          )
                        : (
                            // eslint-disable-next-line next/no-img-element
                            <img
                              src={BRAND.logos.main}
                              alt={`${BRAND.name} Logo`}
                              className="size-6 object-contain shrink-0"
                              width={24}
                              height={24}
                            />
                          )}
                    </Link>
                  </SidebarMenuButton>

                  {/* Toggle button - right aligned, hidden when collapsed */}
                  <SidebarTrigger className="group-data-[collapsible=icon]:hidden" />
                </div>
              </SidebarMenuItem>

              {/* New Chat - Single item with responsive content */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip={t('navigation.newChat')} isActive={pathname === '/chat'}>
                  <Link href="/chat" onClick={handleNavLinkClick}>
                    <Plus className="size-6 shrink-0" />
                    <span className="truncate min-w-0 group-data-[collapsible=icon]:hidden">
                      {t('navigation.newChat')}
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Search - Single item with responsive content */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => {
                    setIsSearchOpen(true);
                    if (isMobile) {
                      setOpenMobile(false);
                    }
                  }}
                  tooltip={t('navigation.searchChats')}
                >
                  <Search className="size-6 shrink-0" />
                  <span className="truncate min-w-0 group-data-[collapsible=icon]:hidden">
                    {t('navigation.searchChats')}
                  </span>
                </SidebarMenuButton>
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
                      searchTerm=""
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

                {/* Empty State - shadcn pattern */}
                {!isLoading && !isError && chats.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 group-data-[collapsible=icon]:hidden">
                    <div className="flex size-12 items-center justify-center rounded-xl bg-muted/60 mb-3">
                      <MessageSquare className="size-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium text-foreground/90 mb-0.5">
                      {t('chat.noChatsYet')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('chat.emptyStateHint')}
                    </p>
                  </div>
                )}

                {/* Main Chat List */}
                {!isLoading && !isError && chatGroups.length > 0 && (
                  <>
                    <ChatList
                      chatGroups={chatGroups}
                      favorites={[]}
                      searchTerm=""
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
          <SidebarFooter className="gap-2">
            {/* Plan CTA - shadcn pattern matching NavUser */}
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  size="lg"
                  asChild
                  tooltip={isPaidUser ? `${SUBSCRIPTION_TIER_NAMES[subscriptionTier]} Plan` : t('navigation.upgrade')}
                  isActive={pathname?.startsWith('/chat/pricing')}
                >
                  <Link href="/chat/pricing">
                    <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${isPaidUser ? 'bg-success text-success-foreground' : 'bg-primary text-primary-foreground'}`}>
                      <Sparkles className="size-4" />
                    </div>
                    <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                      <span className="truncate font-semibold">
                        {isPaidUser ? `${SUBSCRIPTION_TIER_NAMES[subscriptionTier]} Plan` : t('navigation.upgrade')}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {isPaidUser ? t('navigation.managePlan') : t('navigation.upgradeDescription')}
                      </span>
                    </div>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            {/* User Nav */}
            <SidebarMenu>
              <SidebarMenuItem>
                <NavUser initialSession={initialSession} />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
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
