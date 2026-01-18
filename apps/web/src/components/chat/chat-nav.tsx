import { SidebarCollapsibles, SidebarVariants } from '@roundtable/shared';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import React, { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';

import { ChatList } from '@/components/chat/chat-list';
import {
  ChatSidebarPaginationSkeleton,
  SidebarThreadSkeletons,
} from '@/components/chat/chat-sidebar-skeleton';
import { CommandSearch } from '@/components/chat/command-search';
import { NavUser } from '@/components/chat/nav-user';
import { ShareDialog } from '@/components/chat/share-dialog';
import { Icons } from '@/components/icons';
import Image from '@/components/ui/image';
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
import { useTogglePublicMutation } from '@/hooks/mutations';
import { useSidebarThreadsQuery, useThreadQuery } from '@/hooks/queries';
import type { Session, User } from '@/lib/auth/types';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/ui/cn';
import type { ChatSidebarItem } from '@/services/api';
import { useNavigationReset } from '@/stores/chat';

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  /** Server-side session for hydration - prevents mismatch */
  initialSession?: { session: Session; user: User } | null;
};

function AppSidebarComponent({ initialSession, ...props }: AppSidebarProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const t = useTranslations();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isFavoritesCollapsed, setIsFavoritesCollapsed] = useState(false);
  const [isChatsCollapsed, setIsChatsCollapsed] = useState(false);
  const sidebarContentRef = useRef<HTMLDivElement>(null);
  const { isMobile, setOpenMobile } = useSidebar();
  const handleNavigationReset = useNavigationReset();
  const { data: threadsData, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, error } = useSidebarThreadsQuery();

  // Share dialog state - exact same pattern as chat-thread-actions.tsx
  const [chatToShare, setChatToShare] = useState<ChatSidebarItem | null>(null);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const togglePublicMutation = useTogglePublicMutation();

  // Read isPublic from thread detail cache (same pattern as chat-thread-actions.tsx)
  const { data: threadDetailData } = useThreadQuery(chatToShare?.id ?? '', !!chatToShare);
  const threadIsPublic = threadDetailData?.success && threadDetailData.data && typeof threadDetailData.data === 'object' && 'thread' in threadDetailData.data && threadDetailData.data.thread && typeof threadDetailData.data.thread === 'object' && 'isPublic' in threadDetailData.data.thread
    ? (threadDetailData.data.thread as { isPublic?: boolean }).isPublic
    : chatToShare?.isPublic ?? false;

  // Derived value: use optimistic mutation value when pending, otherwise use cache
  const displayIsPublic = togglePublicMutation.isPending && togglePublicMutation.variables
    ? togglePublicMutation.variables.isPublic
    : threadIsPublic;

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
      createdAt: typeof thread.createdAt === 'string' ? thread.createdAt : new Date(thread.createdAt).toISOString(),
      updatedAt: typeof thread.updatedAt === 'string' ? thread.updatedAt : new Date(thread.updatedAt).toISOString(),
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
    navigate({ to: '/chat' });

    if (isMobile) {
      setOpenMobile(false);
    }
  }, [handleNavigationReset, navigate, isMobile, setOpenMobile]);

  const favorites = useMemo(() => chats.filter(chat => chat.isFavorite), [chats]);
  const nonFavoriteChats = useMemo(() => chats.filter(chat => !chat.isFavorite), [chats]);

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

  const prevPathnameRef = useRef(pathname);
  useEffect(() => {
    if (isMobile && pathname !== prevPathnameRef.current) {
      setOpenMobile(false);
    }
    prevPathnameRef.current = pathname;
  }, [pathname, isMobile, setOpenMobile]);

  // Share dialog handlers (same pattern as chat-thread-actions.tsx)
  const handleShareClick = useCallback((chat: ChatSidebarItem) => {
    setChatToShare(chat);
    setIsShareDialogOpen(true);
  }, []);

  const handleShareDialogOpenChange = useCallback((open: boolean) => {
    if (!open && togglePublicMutation.isPending) {
      return;
    }
    setIsShareDialogOpen(open);
  }, [togglePublicMutation.isPending]);

  const handleMakePublic = useCallback(() => {
    if (!chatToShare || threadIsPublic || togglePublicMutation.isPending) {
      return;
    }
    togglePublicMutation.mutate({ threadId: chatToShare.id, isPublic: true, slug: chatToShare.slug ?? undefined });
  }, [chatToShare, threadIsPublic, togglePublicMutation]);

  const handleMakePrivate = useCallback(() => {
    if (!chatToShare || !threadIsPublic || togglePublicMutation.isPending) {
      setIsShareDialogOpen(false);
      return;
    }
    setIsShareDialogOpen(false);
    togglePublicMutation.mutate({ threadId: chatToShare.id, isPublic: false, slug: chatToShare.slug ?? undefined });
  }, [chatToShare, threadIsPublic, togglePublicMutation]);

  return (
    <>
      <TooltipProvider>
        <Sidebar collapsible={SidebarCollapsibles.ICON} variant={SidebarVariants.FLOATING} {...props}>
          <SidebarHeader>
            <div className="flex h-9 mb-2 items-center justify-between group-data-[collapsible=icon]:hidden">
              <Link
                to="/chat"
                preload="intent"
                onClick={handleNavLinkClick}
                className="flex h-9 items-center rounded-md ps-3 pe-2 hover:opacity-80 transition-opacity"
              >
                <Image
                  src={BRAND.logos.main}
                  alt={`${BRAND.name} Logo`}
                  className="size-6 object-contain shrink-0"
                  width={24}
                  height={24}
                />
              </Link>
              <SidebarTrigger className="size-9 shrink-0" />
            </div>

            <div className="hidden h-10 mb-2 group-data-[collapsible=icon]:flex items-center justify-center relative">
              <Link
                to="/chat"
                preload="intent"
                onClick={handleNavLinkClick}
                className="flex size-10 items-center justify-center group-hover:opacity-0 group-hover:pointer-events-none transition-opacity duration-150"
              >
                <Image
                  src={BRAND.logos.main}
                  alt={`${BRAND.name} Logo`}
                  className="size-6 object-contain shrink-0"
                  width={24}
                  height={24}
                />
              </Link>
              <SidebarTrigger
                className="size-10 absolute opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                iconClassName="size-4"
              />
            </div>

            <SidebarMenu className="gap-1">
              <SidebarMenuItem className="group-data-[collapsible=icon]:hidden">
                <SidebarMenuButton asChild isActive={pathname === '/chat'}>
                  <Link to="/chat" preload="intent" onClick={handleNavLinkClick}>
                    <Icons.plus className="size-4 shrink-0" />
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
                  <Icons.search className="size-4 shrink-0" />
                  <span
                    className="truncate min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"
                    style={{ maxWidth: '12rem' }}
                  >
                    {t('navigation.searchChats')}
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem className="hidden group-data-[collapsible=icon]:flex">
                <SidebarMenuButton asChild tooltip={t('navigation.newChat')} isActive={pathname === '/chat'}>
                  <Link to="/chat" preload="intent" onClick={handleNavLinkClick}>
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
              <div className="flex flex-col w-full px-0.5">
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
                      <ChatList chats={favorites} onShareClick={handleShareClick} />
                    )}
                  </SidebarGroup>
                )}

                {isLoading && (
                  <SidebarGroup className="pt-4 group-data-[collapsible=icon]:hidden">
                    <SidebarGroupLabel className="px-4">
                      <span className="text-sm font-medium truncate">
                        {t('navigation.chats')}
                      </span>
                    </SidebarGroupLabel>
                    <SidebarThreadSkeletons count={10} animated />
                  </SidebarGroup>
                )}

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

                {!isLoading && !isError && chats.length === 0 && (
                  <SidebarGroup className="pt-4 group-data-[collapsible=icon]:hidden">
                    <SidebarGroupLabel className="px-4">
                      <span className="text-sm font-medium truncate">
                        {t('navigation.chats')}
                      </span>
                    </SidebarGroupLabel>
                    <div className="px-4 pb-3 pt-2">
                      <p className="text-xs text-muted-foreground">
                        {t('chat.emptyStateSubtext')}
                        ,
                        <br />
                        {t('chat.emptyStateTitle')}
                      </p>
                    </div>
                    <SidebarThreadSkeletons count={7} />
                  </SidebarGroup>
                )}

                {!isLoading && !isError && nonFavoriteChats.length > 0 && (
                  <SidebarGroup className="group/chats pt-4 group-data-[collapsible=icon]:hidden">
                    <SidebarGroupLabel
                      className="flex items-center gap-0.5 px-4 cursor-pointer"
                      onClick={() => setIsChatsCollapsed(!isChatsCollapsed)}
                    >
                      <span className="text-sm font-medium truncate">
                        {t('navigation.chats')}
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
                        <ChatList chats={nonFavoriteChats} onShareClick={handleShareClick} />
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

      {/* ShareDialog rendered outside conditional blocks to survive ChatList remounts */}
      <ShareDialog
        open={isShareDialogOpen}
        onOpenChange={handleShareDialogOpenChange}
        slug={chatToShare?.slug ?? ''}
        threadTitle={chatToShare?.title ?? ''}
        isPublic={displayIsPublic ?? false}
        isLoading={togglePublicMutation.isPending}
        onMakePublic={handleMakePublic}
        onMakePrivate={handleMakePrivate}
      />
    </>
  );
}

export const AppSidebar = React.memo(AppSidebarComponent);
