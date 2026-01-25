import { Link, useLocation, useMatches, useNavigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { memo, useCallback } from 'react';
import { z } from 'zod';
import { useShallow } from 'zustand/react/shallow';

import { Icons } from '@/components/icons';
import { Logo } from '@/components/logo';
import { useChatStore } from '@/components/providers';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useSidebarOptional } from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { BRAND } from '@/constants';
import { useProjectQuery, useThreadQuery } from '@/hooks/queries';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/ui/cn';
import { useNavigationReset } from '@/stores/chat';

import type { ChatPageHeaderProps, NavigationHeaderProps, PageHeaderProps } from './chat-header.types';
import { ChatScrollButton } from './chat-scroll-button';
import { ChatSection } from './chat-states';
import { ChatThreadActions } from './chat-thread-actions';
import { useThreadHeaderOptional } from './thread-header-context';

const BREADCRUMB_PATHS = ['/chat', '/chat/pricing', '/admin/impersonate', '/admin/jobs'] as const;
type BreadcrumbPath = (typeof BREADCRUMB_PATHS)[number];

const BREADCRUMB_MAP: Record<BreadcrumbPath, { titleKey: string; parent?: string }> = {
  '/chat': { titleKey: 'navigation.chat' },
  '/chat/pricing': { titleKey: 'navigation.pricing', parent: '/chat' },
  '/admin/impersonate': { titleKey: 'admin.impersonate.title', parent: '/chat' },
  '/admin/jobs': { titleKey: 'admin.jobs.title', parent: '/chat' },
};

function isBreadcrumbPath(path: string): path is BreadcrumbPath {
  return BREADCRUMB_PATHS.includes(path as BreadcrumbPath);
}

const RouteThreadSchema = z.object({
  id: z.string(),
  title: z.string().nullish().transform(v => v ?? undefined),
  isPublic: z.boolean().optional(),
  isFavorite: z.boolean().optional(),
}).passthrough();
type RouteThread = z.output<typeof RouteThreadSchema>;

const ThreadLoaderDataSchema = z.object({
  threadTitle: z.string().nullish(),
  threadData: z.object({
    thread: RouteThreadSchema,
  }).passthrough().nullish(),
}).passthrough();

const RouteParamsSchema = z.object({
  slug: z.string(),
});

// Project route schemas
const ProjectLoaderDataSchema = z.object({
  projectName: z.string().nullish(),
  project: z.object({ name: z.string() }).passthrough().nullish(),
}).passthrough();

function extractProjectName(loaderData: unknown): string | null {
  const result = ProjectLoaderDataSchema.safeParse(loaderData);
  if (!result.success)
    return null;
  // Prefer explicit projectName, fall back to project.name
  return result.data.projectName ?? result.data.project?.name ?? null;
}

function extractThreadFromLoaderData(loaderData: unknown): RouteThread | null {
  const result = ThreadLoaderDataSchema.safeParse(loaderData);
  if (!result.success)
    return null;
  return result.data.threadData?.thread ?? null;
}

function extractThreadTitle(loaderData: unknown): string | null {
  const result = ThreadLoaderDataSchema.safeParse(loaderData);
  if (!result.success)
    return null;
  return result.data.threadTitle ?? null;
}

function extractSlugFromParams(params: unknown): string | null {
  const result = RouteParamsSchema.safeParse(params);
  if (!result.success)
    return null;
  return result.data.slug;
}

function NavigationHeaderComponent({
  className,
  threadTitle: threadTitleProp,
  threadActions: threadActionsProp,
  showSidebarTrigger = true,
  showLogo = false,
  maxWidth = false,
  showScrollButton = false,
}: NavigationHeaderProps = {}) {
  const { pathname } = useLocation();
  const t = useTranslations();
  const sidebarContext = useSidebarOptional();
  const hasSidebar = sidebarContext !== null;

  const { storeThreadTitle, showInitialUI, createdThreadId, thread, storeThreadId, animatingThreadId, animationNewTitle, animationPhase, displayedTitle } = useChatStore(
    useShallow(s => ({
      storeThreadTitle: s.thread?.title ?? null,
      storeThreadId: s.thread?.id ?? null,
      showInitialUI: s.showInitialUI,
      createdThreadId: s.createdThreadId,
      thread: s.thread,
      animatingThreadId: s.animatingThreadId,
      animationNewTitle: s.newTitle,
      animationPhase: s.animationPhase,
      displayedTitle: s.displayedTitle,
    })),
  );

  const matches = useMatches();

  // Check for normal thread route
  const normalThreadMatch = matches.find(m => m.routeId === '/_protected/chat/$slug');

  // Check for project thread route
  const projectThreadMatch = matches.find(m => m.routeId === '/_protected/chat/projects/$projectId/$slug');

  // Use project thread match if available, otherwise normal thread match
  const threadMatch = projectThreadMatch ?? normalThreadMatch;
  const routeThreadTitle = extractThreadTitle(threadMatch?.loaderData);
  const routeThread = extractThreadFromLoaderData(threadMatch?.loaderData);
  const routeSlug = extractSlugFromParams(threadMatch?.params);

  // Project route detection - use pathname as primary indicator
  const isProjectPath = pathname?.includes('/chat/projects/');

  // Extract project ID from pathname for query fallback
  const projectIdFromPath = isProjectPath
    ? pathname?.match(/\/chat\/projects\/([^/]+)/)?.[1]
    : null;

  // Find route match for loader data
  const projectMatch = matches.find(m =>
    m.routeId === '/_protected/chat/projects/$projectId'
    || m.routeId?.startsWith('/_protected/chat/projects/$projectId/')
    || (isProjectPath && m.loaderData && ('projectName' in (m.loaderData as object) || 'project' in (m.loaderData as object))),
  );

  // Always fetch project query when on project page - this ensures header updates after settings changes
  // Query is cached so this doesn't cause extra network requests
  const { data: projectQueryData } = useProjectQuery(projectIdFromPath ?? '', !!projectIdFromPath);
  const queryProjectName = projectQueryData?.success ? projectQueryData.data?.name : null;

  // Extract project name from loader data - check project thread match first (has projectName),
  // then project index match, then fall back to query
  const loaderProjectName = extractProjectName(projectThreadMatch?.loaderData)
    ?? extractProjectName(projectMatch?.loaderData);

  // Use query data (reactive to changes) over loader data (static)
  const routeProjectName = queryProjectName ?? loaderProjectName;
  const isOnProjectPage = !!isProjectPath;
  // Detect if on project thread (has slug after projectId)
  const isOnProjectThreadPage = isOnProjectPage && !!pathname?.match(/\/chat\/projects\/[^/]+\/[^/]+/);

  const context = useThreadHeaderOptional();
  const navigate = useNavigate();
  const handleNavigationReset = useNavigationReset();

  const handleBreadcrumbClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    handleNavigationReset();
    navigate({ to: '/chat' });
  }, [handleNavigationReset, navigate]);

  const isStaticRoute = isBreadcrumbPath(pathname);
  const hasActiveThread = pathname === '/chat' && !showInitialUI && (createdThreadId || thread);
  const isOnThreadPage = pathname?.startsWith('/chat/') && pathname !== '/chat' && !isStaticRoute;
  const hasThreadInStore = !showInitialUI && !!thread;
  const shouldFetchThread = !!storeThreadId && isOnThreadPage && !hasThreadInStore;
  const { data: cachedThreadData } = useThreadQuery(storeThreadId ?? '', shouldFetchThread);

  // Prefer store title when available (most up-to-date after AI title generation)
  // Fall back to route/cache for SSR hydration
  const effectiveThreadTitle = storeThreadTitle
    ?? routeThreadTitle
    ?? (cachedThreadData?.success ? cachedThreadData.data?.thread?.title : null);

  const shouldUseStoreThreadTitle = hasActiveThread || (!isStaticRoute && pathname?.startsWith('/chat/') && pathname !== '/chat');
  const threadTitle = threadTitleProp ?? (showSidebarTrigger && shouldUseStoreThreadTitle ? effectiveThreadTitle : null);

  const contextThreadActions = showSidebarTrigger && shouldUseStoreThreadTitle ? context.threadActions : null;
  const ssrThreadActions = routeThread && routeSlug && !contextThreadActions
    ? <ChatThreadActions thread={routeThread} slug={routeSlug} />
    : null;
  const threadActions = threadActionsProp ?? contextThreadActions ?? ssrThreadActions;

  const isThreadPage = (
    (pathname?.startsWith('/chat/') && pathname !== '/chat' && !isStaticRoute && !isOnProjectPage)
    || pathname?.startsWith('/public/chat/')
    || isOnProjectThreadPage
  );
  const isOverviewPage = pathname === '/chat' && !hasActiveThread;
  const showThreadBreadcrumb = (isThreadPage || hasActiveThread) && threadTitle;
  const showProjectBreadcrumb = isOnProjectPage && routeProjectName;

  // Priority: Project thread > Project index > Thread page > Static routes
  const currentPage = isOnProjectThreadPage
    ? { titleKey: threadTitle ?? '', isDynamic: true as const }
    : showProjectBreadcrumb
      ? { titleKey: routeProjectName, isDynamic: true as const }
      : showThreadBreadcrumb
        ? { titleKey: threadTitle, isDynamic: true as const }
        : pathname ? BREADCRUMB_MAP[pathname as keyof typeof BREADCRUMB_MAP] : undefined;
  return (
    <header
      className={cn(
        'sticky top-0 left-0 right-0 z-50 flex h-14 sm:h-16 shrink-0 items-center gap-2 transition-all duration-200 ease-in-out bg-background',
        className,
      )}
    >
      <div className={cn(
        'flex items-center justify-between gap-2 pt-4 px-5 md:px-6 lg:px-8 h-14 sm:h-16 w-full',
        maxWidth && 'max-w-4xl mx-auto',
      )}
      >
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1 overflow-hidden">
          {hasSidebar && (
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden min-h-11 min-w-11 shrink-0 -ms-2"
              onClick={() => sidebarContext.setOpenMobile(true)}
              aria-label={t('accessibility.openSidebar')}
            >
              <Icons.panelLeft className="size-6" />
            </Button>
          )}
          {showLogo && !isOverviewPage && (
            <>
              <Link to="/" className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 touch-manipulation">
                <Logo size="sm" variant="icon" />
                <span className="text-sm sm:text-base font-semibold tracking-tight hidden xs:inline">
                  {BRAND.displayName}
                </span>
              </Link>
              <Separator orientation="vertical" className="me-1 sm:me-2 h-3.5 sm:h-4 flex-shrink-0 opacity-30" />
            </>
          )}
          {!isOverviewPage && currentPage && (
            <Breadcrumb className="min-w-0 flex-1">
              <BreadcrumbList>
                <BreadcrumbItem className="shrink-0">
                  <BreadcrumbLink asChild>
                    <Link
                      to="/chat"
                      onClick={handleBreadcrumbClick}
                      className="text-muted-foreground hover:text-foreground transition-colors text-base"
                    >
                      {BRAND.displayName}
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                {/* Project thread: Projects > Project link > Thread */}
                {isOnProjectThreadPage && (
                  <>
                    <BreadcrumbItem className="shrink-0">
                      <BreadcrumbLink asChild>
                        <Link
                          to="/chat"
                          className="text-muted-foreground hover:text-foreground transition-colors text-sm sm:text-base"
                        >
                          {t('projects.title')}
                        </Link>
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem className="shrink-0">
                      <BreadcrumbLink asChild>
                        <Link
                          to="/chat/projects/$projectId"
                          params={{ projectId: projectIdFromPath ?? '' }}
                          className="text-muted-foreground hover:text-foreground transition-colors text-sm sm:text-base"
                        >
                          {routeProjectName}
                        </Link>
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                  </>
                )}
                {/* Project index: Projects > Project name (current) */}
                {showProjectBreadcrumb && !isOnProjectThreadPage && (
                  <>
                    <BreadcrumbItem className="shrink-0">
                      <BreadcrumbLink asChild>
                        <Link
                          to="/chat"
                          className="text-muted-foreground hover:text-foreground transition-colors text-sm sm:text-base"
                        >
                          {t('projects.title')}
                        </Link>
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                  </>
                )}
                <BreadcrumbItem className="min-w-0 overflow-hidden max-w-32 sm:max-w-48 md:max-w-64">
                  <BreadcrumbPage
                    className="line-clamp-1 truncate overflow-hidden text-ellipsis whitespace-nowrap text-sm sm:text-base max-w-32 sm:max-w-48 md:max-w-64"
                    title={'isDynamic' in currentPage && currentPage.isDynamic ? currentPage.titleKey : t(currentPage.titleKey as Parameters<typeof t>[0])}
                  >
                    {'isDynamic' in currentPage && currentPage.isDynamic
                      ? (animatingThreadId && (animationPhase === 'deleting' || animationPhase === 'typing')
                          ? (
                              <>
                                {displayedTitle}
                                <span className="animate-blink inline-block w-[2px] h-[1em] bg-current ml-[1px] align-middle" aria-hidden="true" />
                              </>
                            )
                          : (animationNewTitle ?? currentPage.titleKey))
                      : t(currentPage.titleKey as Parameters<typeof t>[0])}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          )}
        </div>
        {!isOverviewPage && (
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0 -me-1.5 sm:me-0">
            {showScrollButton && <ChatScrollButton variant="header" />}
            {threadActions}
          </div>
        )}
      </div>
    </header>
  );
}
export const NavigationHeader = memo(NavigationHeaderComponent);

function MinimalHeaderComponent({ className }: { className?: string } = {}) {
  const t = useTranslations();
  const sidebarContext = useSidebarOptional();
  const hasSidebar = sidebarContext !== null;

  const {
    showInitialUI,
    isStreaming,
    isCreatingThread,
    waitingToStartStreaming,
    isModeratorStreaming,
  } = useChatStore(useShallow(s => ({
    showInitialUI: s.showInitialUI,
    isStreaming: s.isStreaming,
    isCreatingThread: s.isCreatingThread,
    waitingToStartStreaming: s.waitingToStartStreaming,
    isModeratorStreaming: s.isModeratorStreaming,
  })));

  const isThreadFlowActive = isStreaming || isCreatingThread || waitingToStartStreaming || isModeratorStreaming;
  const showGlassEffect = !showInitialUI && isThreadFlowActive;

  return (
    <header
      className={cn(
        'sticky top-0 left-0 right-0 z-50',
        'flex h-14 sm:h-16 shrink-0 items-center',
        showGlassEffect && [
          'backdrop-blur-xl bg-background/60',
          'border-b border-border/30',
          'mb-2',
          'sm:backdrop-blur-none sm:bg-transparent sm:border-b-0 sm:mb-0',
        ],
        className,
      )}
    >
      {hasSidebar && (
        <div className="flex items-center px-3 sm:px-4 md:hidden">
          <Button
            variant="ghost"
            size="icon"
            className="min-h-11 min-w-11 shrink-0"
            onClick={() => sidebarContext.setOpenMobile(true)}
            aria-label={t('accessibility.openSidebar')}
          >
            <Icons.panelLeft className="size-6" />
          </Button>
        </div>
      )}
      <div className="hidden md:block h-14 sm:h-16" />
    </header>
  );
}
export const MinimalHeader = memo(MinimalHeaderComponent);

export function PageHeader({
  title,
  description,
  action,
  children,
  showSeparator = true,
  size = 'md',
  className,
}: PageHeaderProps) {
  const sizeConfig = {
    sm: {
      title: 'text-lg font-semibold tracking-tight',
      description: 'text-xs text-muted-foreground',
      spacing: 'space-y-3',
    },
    md: {
      title: 'text-2xl font-semibold tracking-tight',
      description: 'text-sm text-muted-foreground',
      spacing: 'space-y-6',
    },
    lg: {
      title: 'text-3xl font-bold tracking-tight',
      description: 'text-base text-muted-foreground',
      spacing: 'space-y-8',
    },
  } as const;
  const config = sizeConfig[size];
  return (
    <div className={cn(config.spacing, className)}>
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className={config.title}>{title}</h1>
          {description && (
            <p className={config.description}>{description}</p>
          )}
        </div>
        {action && <div className="flex items-center space-x-2">{action}</div>}
      </div>
      {children}
      {showSeparator && <Separator />}
    </div>
  );
}

export function ChatPageHeader({
  title,
  description,
  action,
  size = 'md',
  className,
}: ChatPageHeaderProps) {
  return (
    <ChatSection className={className}>
      <div className="mx-auto px-5 md:px-6">
        <div className="flex items-center justify-between">
          <PageHeader
            title={title}
            description={description}
            size={size}
            showSeparator={false}
          />
          {action && (
            <div className="flex items-center gap-2">
              {action}
            </div>
          )}
        </div>
      </div>
    </ChatSection>
  );
}
export function PageHeaderAction({ children }: { children: ReactNode }) {
  return <div className="flex items-center space-x-2">{children}</div>;
}

export function ChatPageHeaderSkeleton() {
  return (
    <div className="mx-auto px-5 md:px-6 py-4">
      <div className="space-y-1">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-64" />
      </div>
    </div>
  );
}
