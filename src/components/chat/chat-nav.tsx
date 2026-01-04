'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import React, { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';

import type { SubscriptionTier } from '@/api/core/enums';
import { PlanTypes, SubscriptionTiers } from '@/api/core/enums';
import type { ChatSidebarItem } from '@/api/routes/chat/schema';
import { SUBSCRIPTION_TIER_NAMES } from '@/api/services/product-logic.service';
import { ChatList } from '@/components/chat/chat-list';
import {
  ChatSidebarPaginationSkeleton,
  ChatSidebarSkeleton,
} from '@/components/chat/chat-sidebar-skeleton';
import { NavUser } from '@/components/chat/nav-user';
import { Icons } from '@/components/icons';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BRAND } from '@/constants/brand';
import { useThreadsQuery, useUsageStatsQuery } from '@/hooks/queries';
import type { Session, User } from '@/lib/auth/types';
import { cn } from '@/lib/ui/cn';
import { useNavigationReset } from '@/stores/chat';

// Dynamic import - only loaded when user opens search (Cmd+K)
const CommandSearch = dynamic(
  () => import('@/components/chat/command-search').then(m => m.CommandSearch),
  { ssr: false },
);

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  /** Server-side session for hydration - prevents mismatch */
  initialSession?: { session: Session; user: User } | null;
};

function AppSidebarComponent({ initialSession, ...props }: AppSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isFavoritesCollapsed, setIsFavoritesCollapsed] = useState(false);
  const [isChatsCollapsed, setIsChatsCollapsed] = useState(false);
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
  const subscriptionTier: SubscriptionTier = usageData?.data?.plan?.type === PlanTypes.PAID ? SubscriptionTiers.PRO : SubscriptionTiers.FREE;
  const isPaidUser = usageData?.data?.plan?.type === PlanTypes.PAID;
  const chats: ChatSidebarItem[] = useMemo(() => {
    if (!threadsData?.pages)
      return [];
    const threads = threadsData.pages.flatMap((page) => {
      if (page.success && page.data?.items) {
        return page.data.items;
      }
      return [];
    });
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
    e.preventDefault();
    handleNavigationReset();
    router.push('/chat');
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [handleNavigationReset, router, isMobile, setOpenMobile]);

  const favorites = useMemo(() =>
    chats.filter(chat => chat.isFavorite), [chats]);
  const nonFavoriteChats = useMemo(() =>
    chats.filter(chat => !chat.isFavorite), [chats]);

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
            {/* Logo + Toggle Row - Expanded */}
            <div className="flex h-9 mb-2 items-center justify-between group-data-[collapsible=icon]:hidden">
              <Link
                href="/chat"
                onClick={handleNavLinkClick}
                className="flex h-9 items-center rounded-md ps-3 pe-2 hover:opacity-80 transition-opacity"
              >
                {/* eslint-disable-next-line next/no-img-element */}
                <img
                  src={BRAND.logos.main}
                  alt={`${BRAND.name} Logo`}
                  className="size-6 object-contain shrink-0"
                  width={24}
                  height={24}
                />
              </Link>
              <SidebarTrigger className="size-9 shrink-0" />
            </div>

            {/* Collapsed Header - Logo/Toggle swap on hover */}
            <div className="hidden h-10 mb-2 group-data-[collapsible=icon]:flex items-center justify-center relative">
              {/* Logo - visible by default, hidden on sidebar hover */}
              <Link
                href="/chat"
                onClick={handleNavLinkClick}
                className="flex size-10 items-center justify-center group-hover:opacity-0 group-hover:pointer-events-none transition-opacity duration-150"
              >
                {/* eslint-disable-next-line next/no-img-element */}
                <img
                  src={BRAND.logos.main}
                  alt={`${BRAND.name} Logo`}
                  className="size-6 object-contain shrink-0"
                  width={24}
                  height={24}
                />
              </Link>
              {/* Toggle - hidden by default, visible on sidebar hover */}
              <SidebarTrigger
                className="size-10 absolute opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                iconClassName="size-4"
              />
            </div>

            <SidebarMenu className="gap-1">

              {/* Action Buttons - Expanded */}
              <SidebarMenuItem className="group-data-[collapsible=icon]:hidden">
                <SidebarMenuButton asChild isActive={pathname === '/chat'}>
                  <Link href="/chat" onClick={handleNavLinkClick}>
                    <Icons.plus className="size-4 shrink-0" />
                    <span
                      className="truncate min-w-0 overflow-hidden text-ellipsis whitespace-nowrap max-w-48"
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
                  <Icons.search className="size-4 shrink-0" />
                  <span
                    className="truncate min-w-0 overflow-hidden text-ellipsis whitespace-nowrap max-w-48"
                  >
                    {t('navigation.searchChats')}
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Icon Buttons - Collapsed */}
              <SidebarMenuItem className="hidden group-data-[collapsible=icon]:flex">
                <SidebarMenuButton asChild tooltip={t('navigation.newChat')} isActive={pathname === '/chat'}>
                  <Link href="/chat" onClick={handleNavLinkClick}>
                    <Icons.plus />
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
                  <Icons.search />
                </SidebarMenuButton>
              </SidebarMenuItem>

            </SidebarMenu>
          </SidebarHeader>
          <SidebarContent className="p-0 w-full min-w-0">
            <ScrollArea ref={sidebarContentRef} className="w-full h-full">
              <div className="flex flex-col w-full">
                {/* Favorites Section */}
                {!isLoading && !isError && favorites.length > 0 && (
                  <SidebarGroup className="group/favorites pt-4 group-data-[collapsible=icon]:hidden">
                    <SidebarGroupLabel
                      className="flex items-center gap-0.5 px-4 cursor-pointer"
                      onClick={() => setIsFavoritesCollapsed(!isFavoritesCollapsed)}
                    >
                      <span className="text-sm font-medium truncate">
                        {t('chat.pinned')}
                      </span>
                      <Icons.chevronRight className={cn(
                        'size-3 shrink-0 transition-all duration-200',
                        !isFavoritesCollapsed && 'rotate-90',
                        !isFavoritesCollapsed && 'opacity-0 group-hover/favorites:opacity-100',
                      )}
                      />
                    </SidebarGroupLabel>
                    {!isFavoritesCollapsed && (
                      <ChatList
                        chats={favorites}
                        isMobile={isMobile}
                        onNavigate={() => {
                          if (isMobile) {
                            setOpenMobile(false);
                          }
                        }}
                      />
                    )}
                  </SidebarGroup>
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
                      <Icons.messageSquare className="size-5 text-muted-foreground" />
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
                {!isLoading && !isError && nonFavoriteChats.length > 0 && (
                  <SidebarGroup className="group/chats pt-4 group-data-[collapsible=icon]:hidden">
                    <SidebarGroupLabel
                      className="flex items-center gap-0.5 px-4 cursor-pointer"
                      onClick={() => setIsChatsCollapsed(!isChatsCollapsed)}
                    >
                      <span className="text-sm font-medium truncate">
                        {t('navigation.chat')}
                      </span>
                      <Icons.chevronRight className={cn(
                        'size-3 shrink-0 transition-all duration-200',
                        !isChatsCollapsed && 'rotate-90',
                        !isChatsCollapsed && 'opacity-0 group-hover/chats:opacity-100',
                      )}
                      />
                    </SidebarGroupLabel>
                    {!isChatsCollapsed && (
                      <>
                        <ChatList
                          chats={nonFavoriteChats}
                          isMobile={isMobile}
                          onNavigate={() => {
                            if (isMobile) {
                              setOpenMobile(false);
                            }
                          }}
                        />
                        {isFetchingNextPage && (
                          <ChatSidebarPaginationSkeleton count={20} />
                        )}
                      </>
                    )}
                  </SidebarGroup>
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
                <Icons.sparkles className="size-4" />
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
                    <Icons.sparkles className={isPaidUser ? 'text-success' : ''} />
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
