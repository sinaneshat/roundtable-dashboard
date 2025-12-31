'use client';
import { MessageSquare, Plus, Search, Sparkles, Star } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import React, { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';

import type { SubscriptionTier } from '@/api/core/enums';
import type { ChatSidebarItem } from '@/api/routes/chat/schema';
import { SUBSCRIPTION_TIER_NAMES } from '@/api/services/product-logic.service';
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
  useSidebar,
} from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BRAND } from '@/constants/brand';
import { useThreadsQuery, useUsageStatsQuery } from '@/hooks/queries';
import type { SessionData } from '@/lib/auth/types';
import { cn } from '@/lib/ui/cn';
import { useNavigationReset } from '@/stores/chat';

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  /** Server-side session for hydration - prevents mismatch */
  initialSession?: SessionData | null;
};

function AppSidebarComponent({ initialSession, ...props }: AppSidebarProps) {
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
  const { data: usageData } = useUsageStatsQuery();
  // ✅ CREDITS-ONLY: Map plan type to tier for display
  const subscriptionTier: SubscriptionTier = usageData?.data?.plan?.type === 'paid' ? 'pro' : 'free';
  const isPaidUser = usageData?.data?.plan?.type === 'paid';
  const chats: ChatSidebarItem[] = useMemo(() => {
    if (!threadsData?.pages)
      return [];
    const threads = threadsData.pages.flatMap(page =>
      page.success && page.data?.items ? page.data.items : [],
    );
    return threads.map(thread => ({
      id: thread.id,
      title: thread.title,
      slug: thread.slug,
      previousSlug: thread.previousSlug ?? null,
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

  // ✅ Close mobile sidebar AFTER navigation completes (when pathname changes)
  // This ensures sidebar stays open during navigation for visual feedback
  const prevPathnameRef = useRef(pathname);
  useEffect(() => {
    if (isMobile && pathname !== prevPathnameRef.current) {
      setOpenMobile(false);
    }
    prevPathnameRef.current = pathname;
  }, [pathname, isMobile, setOpenMobile]);
  return (
    <>
      <TooltipProvider>
        <Sidebar collapsible="icon" variant="floating" {...props}>
          <SidebarHeader>
            <SidebarMenu className="gap-1">
              {/* Logo/Brand */}
              <SidebarMenuItem className="group-data-[collapsible=icon]:hidden mb-2">
                <SidebarMenuButton size="lg" asChild className="hover:bg-transparent !h-10">
                  <Link href="/chat" onClick={handleNavLinkClick} className="flex items-center gap-2.5">
                    {/* ✅ FIX: Use plain img tag to prevent hydration mismatch */}
                    {/* eslint-disable-next-line next/no-img-element */}
                    <img
                      src={BRAND.logos.main}
                      alt={`${BRAND.name} Logo`}
                      className="size-7 object-contain shrink-0"
                      width={28}
                      height={28}
                    />
                    <span
                      className="truncate min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold"
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
                  {/* ✅ FIX: Use plain img tag to prevent hydration mismatch */}
                  {/* eslint-disable-next-line next/no-img-element */}
                  <img
                    src={BRAND.logos.main}
                    alt={`${BRAND.name} Logo`}
                    className="size-8 object-contain shrink-0"
                    width={32}
                    height={32}
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
            {/* Plan CTA */}
            <Link
              href="/chat/pricing"
              className="group/upgrade group-data-[collapsible=icon]:hidden flex items-center gap-3 rounded-xl bg-accent px-3 py-2.5 transition-colors duration-200 hover:bg-accent/80"
            >
              <div className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', isPaidUser ? 'bg-success text-success-foreground' : 'bg-primary text-primary-foreground')}>
                <Sparkles className="size-4" />
              </div>
              <div className="flex flex-1 flex-col min-w-0">
                <span className="text-sm font-medium text-foreground truncate">
                  {isPaidUser ? `${SUBSCRIPTION_TIER_NAMES[subscriptionTier]} Plan` : t('navigation.upgrade')}
                </span>
                <span className="text-xs text-muted-foreground truncate">
                  {isPaidUser ? t('navigation.managePlan') : t('navigation.upgradeDescription')}
                </span>
              </div>
            </Link>
            {/* Collapsed icon */}
            <SidebarMenu className="hidden group-data-[collapsible=icon]:flex">
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip={isPaidUser ? `${SUBSCRIPTION_TIER_NAMES[subscriptionTier]} Plan` : t('navigation.upgrade')}
                  isActive={pathname?.startsWith('/chat/pricing')}
                >
                  <Link href="/chat/pricing">
                    <Sparkles className={isPaidUser ? 'text-success' : ''} />
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
