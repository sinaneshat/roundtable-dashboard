import { SidebarCollapsibles, SidebarVariants } from '@roundtable/shared';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import React, { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';

import { ChatList } from '@/components/chat/chat-list';
import {
  ChatSidebarPaginationSkeleton,
  SidebarThreadSkeletons,
} from '@/components/chat/chat-sidebar-skeleton';
import type { CommandSearchProps } from '@/components/chat/command-search';
import { NavUser } from '@/components/chat/nav-user';
import type { ShareDialogProps } from '@/components/chat/share-dialog';
import { Icons } from '@/components/icons';
import type { ProjectListItemData } from '@/components/projects';
import {
  ProjectCreateDialog,
  ProjectDeleteDialog,
  ProjectLimitDialog,
  ProjectList,
  ProjectListSkeleton,
} from '@/components/projects';
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
import { BRAND } from '@/constants';
import { useTogglePublicMutation } from '@/hooks/mutations';
import { useProjectLimitsQuery, useSidebarProjectsQuery, useSidebarThreadsQuery, useThreadQuery } from '@/hooks/queries';
import type { Session, User } from '@/lib/auth/types';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/ui/cn';
import dynamic from '@/lib/utils/dynamic';
import type { ChatSidebarItem, ListProjectsResponse } from '@/services/api';
import { useNavigationReset } from '@/stores/chat';

type ProjectItem = NonNullable<ListProjectsResponse['data']>['items'][number];

const ShareDialog = dynamic<ShareDialogProps>(
  () => import('@/components/chat/share-dialog').then(m => ({ default: m.ShareDialog })),
  { ssr: false },
);

const CommandSearch = dynamic<CommandSearchProps>(
  () => import('@/components/chat/command-search').then(m => ({ default: m.CommandSearch })),
  { ssr: false },
);

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  initialSession?: { session: Session; user: User } | null;
};

function AppSidebarComponent({ initialSession, ...props }: AppSidebarProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const t = useTranslations();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isProjectsCollapsed, setIsProjectsCollapsed] = useState(false);
  const [isFavoritesCollapsed, setIsFavoritesCollapsed] = useState(false);
  const [isChatsCollapsed, setIsChatsCollapsed] = useState(false);
  const sidebarContentRef = useRef<HTMLDivElement>(null);
  const { isMobile, setOpenMobile } = useSidebar();
  const handleNavigationReset = useNavigationReset();
  const { data: threadsData, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, error } = useSidebarThreadsQuery();

  const [chatToShare, setChatToShare] = useState<ChatSidebarItem | null>(null);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const togglePublicMutation = useTogglePublicMutation();

  // Projects state
  const {
    data: projectsData,
    isLoading: isProjectsLoading,
    fetchNextPage: fetchNextProjectsPage,
    hasNextPage: hasNextProjectsPage,
    isFetchingNextPage: isFetchingNextProjectsPage,
  } = useSidebarProjectsQuery();
  const { data: projectLimits } = useProjectLimitsQuery();

  // Project limits for PRO-only check
  const canCreateProject = projectLimits?.success
    ? projectLimits.data.canCreateProject
    : false;

  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false);
  const [isLimitDialogOpen, setIsLimitDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<{ id: string; name: string } | null>(null);

  const { data: threadDetailData } = useThreadQuery(chatToShare?.id ?? '', !!chatToShare);
  const threadIsPublic = threadDetailData?.success && threadDetailData.data && typeof threadDetailData.data === 'object' && 'thread' in threadDetailData.data && threadDetailData.data.thread && typeof threadDetailData.data.thread === 'object' && 'isPublic' in threadDetailData.data.thread
    ? (threadDetailData.data.thread as { isPublic?: boolean }).isPublic
    : chatToShare?.isPublic ?? false;

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
      messages: [],
      isFavorite: thread.isFavorite ?? false,
      isPublic: thread.isPublic ?? false,
    }));
  }, [threadsData]);

  const projects: ProjectListItemData[] = useMemo(() => {
    if (!projectsData?.pages)
      return [];
    return projectsData.pages.flatMap((page) => {
      if (!page.success || !page.data?.items)
        return [];
      return page.data.items.map((project: ProjectItem): ProjectListItemData => ({
        id: project.id,
        name: project.name,
        color: project.color ?? null,
        icon: project.icon ?? null,
        threadCount: project.threadCount ?? 0,
      }));
    });
  }, [projectsData]);

  const handleDeleteProject = useCallback((project: ProjectListItemData) => {
    setProjectToDelete({ id: project.id, name: project.name });
  }, []);

  const handleCreateProject = useCallback(() => {
    if (!canCreateProject) {
      setIsLimitDialogOpen(true);
      return;
    }
    setIsProjectDialogOpen(true);
  }, [canCreateProject]);

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
    if (!sidebarContentRef.current)
      return;
    const { scrollTop, scrollHeight, clientHeight } = sidebarContentRef.current;
    const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;

    if (scrollPercentage > 0.8) {
      // Fetch next page for threads
      if (hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
      // Fetch next page for projects
      if (hasNextProjectsPage && !isFetchingNextProjectsPage) {
        fetchNextProjectsPage();
      }
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, hasNextProjectsPage, isFetchingNextProjectsPage, fetchNextProjectsPage]);

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
            <div className="flex h-9 mb-2 items-center justify-between pr-2 group-data-[collapsible=icon]:hidden">
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
              <SidebarTrigger className="shrink-0" />
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
                className="absolute opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                iconClassName="size-4"
              />
            </div>

            <SidebarMenu className="gap-1 px-0.5 pr-4 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:pr-0">
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
                    <Icons.plus className="size-4" />
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
              <div className="flex flex-col w-full px-0.5 pr-4">
                {/* Projects Section */}
                <SidebarGroup className="group/projects pt-4 group-data-[collapsible=icon]:hidden">
                  <SidebarGroupLabel className="flex items-center gap-0.5 px-4">
                    <button
                      type="button"
                      className={cn(
                        'flex items-center gap-0.5 text-left',
                        projects.length > 0 && 'cursor-pointer',
                      )}
                      onClick={projects.length > 0 ? () => setIsProjectsCollapsed(!isProjectsCollapsed) : undefined}
                      disabled={projects.length === 0}
                    >
                      <span className="text-sm font-medium truncate">
                        {t('navigation.projects')}
                      </span>
                      {projects.length > 0 && (
                        <Icons.chevronRight className={cn(
                          'size-3 shrink-0 transition-all duration-200',
                          !isProjectsCollapsed && 'rotate-90',
                          !isProjectsCollapsed && 'opacity-0 group-hover/projects:opacity-100',
                        )}
                        />
                      )}
                    </button>
                  </SidebarGroupLabel>

                  {isProjectsLoading && <ProjectListSkeleton count={3} />}

                  {!isProjectsLoading && !isProjectsCollapsed && (
                    <>
                      <ProjectList
                        projects={projects}
                        onDeleteProject={handleDeleteProject}
                        onCreateProject={handleCreateProject}
                      />
                      {isFetchingNextProjectsPage && (
                        <ProjectListSkeleton count={3} />
                      )}
                    </>
                  )}
                </SidebarGroup>

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

                <SidebarGroup className="group/chats pt-4 group-data-[collapsible=icon]:hidden">
                  <SidebarGroupLabel
                    className={cn(
                      'flex items-center gap-0.5 px-4',
                      !isLoading && !isError && nonFavoriteChats.length > 0 && 'cursor-pointer',
                    )}
                    onClick={!isLoading && !isError && nonFavoriteChats.length > 0 ? () => setIsChatsCollapsed(!isChatsCollapsed) : undefined}
                  >
                    <span className="text-sm font-medium truncate">
                      {t('navigation.chats')}
                    </span>
                    {!isLoading && !isError && nonFavoriteChats.length > 0 && (
                      <Icons.chevronRight className={cn(
                        'size-3 shrink-0 transition-all duration-200',
                        !isChatsCollapsed && 'rotate-90',
                        !isChatsCollapsed && 'opacity-0 group-hover/chats:opacity-100',
                      )}
                      />
                    )}
                  </SidebarGroupLabel>

                  {isLoading && <SidebarThreadSkeletons count={10} animated />}

                  {isError && (
                    <div className="py-6 text-center">
                      <p className="text-sm font-medium text-destructive mb-1">
                        {t('states.error.default')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {error?.message || t('states.error.description')}
                      </p>
                    </div>
                  )}

                  {!isLoading && !isError && chats.length === 0 && (
                    <>
                      <div className="px-4 pb-3 pt-2">
                        <p className="text-xs text-muted-foreground">
                          {t('chat.emptyStateSubtext')}
                          ,
                          <br />
                          {t('chat.emptyStateTitle')}
                        </p>
                      </div>
                      <SidebarThreadSkeletons count={7} />
                    </>
                  )}

                  {!isLoading && !isError && nonFavoriteChats.length > 0 && !isChatsCollapsed && (
                    <>
                      <ChatList chats={nonFavoriteChats} onShareClick={handleShareClick} />
                      {isFetchingNextPage && (
                        <ChatSidebarPaginationSkeleton count={20} />
                      )}
                    </>
                  )}
                </SidebarGroup>
              </div>
            </ScrollArea>
          </SidebarContent>
          <SidebarFooter className="gap-2">
            <SidebarMenu className="px-0.5 pr-4 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:pr-0">
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

      <ProjectCreateDialog
        open={isProjectDialogOpen}
        onOpenChange={setIsProjectDialogOpen}
      />

      <ProjectDeleteDialog
        open={!!projectToDelete}
        onOpenChange={open => !open && setProjectToDelete(null)}
        project={projectToDelete}
      />

      <ProjectLimitDialog
        open={isLimitDialogOpen}
        onOpenChange={setIsLimitDialogOpen}
        maxProjects={projectLimits?.success ? projectLimits.data.maxProjects : 5}
      />
    </>
  );
}

export const AppSidebar = React.memo(AppSidebarComponent);
