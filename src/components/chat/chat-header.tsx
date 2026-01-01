'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import React from 'react';
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
import { useSidebar } from '@/components/ui/sidebar';
import { BRAND } from '@/constants/brand';
import { cn } from '@/lib/ui/cn';

import { ChatScrollButton } from './chat-scroll-button';
import { ChatSection } from './chat-states';
import { useThreadHeaderOptional } from './thread-header-context';

const breadcrumbMap = {
  '/chat': { titleKey: 'navigation.chat' },
  '/chat/pricing': { titleKey: 'navigation.pricing', parent: '/chat' },
} as const;

type NavigationHeaderProps = {
  className?: string;
  threadTitle?: string;
  threadActions?: ReactNode;
  showSidebarTrigger?: boolean;
  showLogo?: boolean;
  maxWidth?: boolean;
  showScrollButton?: boolean;
};
function NavigationHeaderComponent({
  className,
  threadTitle: threadTitleProp,
  threadActions: threadActionsProp,
  showSidebarTrigger = true,
  showLogo = false,
  maxWidth = false,
  showScrollButton = false,
}: NavigationHeaderProps = {}) {
  const pathname = usePathname();
  const t = useTranslations();
  const { setOpenMobile } = useSidebar();

  const { storeThreadTitle, showInitialUI, createdThreadId, thread } = useChatStore(
    useShallow(s => ({
      storeThreadTitle: s.thread?.title ?? null,
      showInitialUI: s.showInitialUI,
      createdThreadId: s.createdThreadId,
      thread: s.thread,
    })),
  );
  const context = useThreadHeaderOptional();

  // Detect active thread from store (created from overview, URL still /chat)
  const hasActiveThread = !showInitialUI && (createdThreadId || thread);

  const threadTitle = threadTitleProp ?? (showSidebarTrigger ? storeThreadTitle : null);
  const threadActions = threadActionsProp ?? (showSidebarTrigger ? context.threadActions : null);
  const isThreadPage = (
    (pathname?.startsWith('/chat/') && pathname !== '/chat' && pathname !== '/chat/pricing')
    || pathname?.startsWith('/public/chat/')
  );
  // Treat as non-overview when we have active thread (even if pathname is /chat)
  const isOverviewPage = pathname === '/chat' && !hasActiveThread;
  // Show thread breadcrumb when on thread page OR active thread from overview
  const showThreadBreadcrumb = (isThreadPage || hasActiveThread) && threadTitle;
  const currentPage = showThreadBreadcrumb
    ? { titleKey: threadTitle, isDynamic: true as const }
    : pathname ? breadcrumbMap[pathname as keyof typeof breadcrumbMap] : undefined;
  return (
    <header
      className={cn(
        'sticky top-0 left-0 right-0 z-50 flex h-14 sm:h-16 shrink-0 items-center gap-2 transition-all duration-200 ease-in-out',
        !isOverviewPage && 'bg-background w-full',
        className,
      )}
    >
      <div className={cn(
        'flex items-center justify-between gap-2 px-3 sm:px-4 md:px-6 lg:px-8 h-14 sm:h-16 w-full',
        maxWidth && 'max-w-full sm:max-w-3xl lg:max-w-4xl mx-auto',
      )}
      >
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
          {/* Mobile sidebar trigger - ChatGPT-like pattern */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden size-9 shrink-0"
            onClick={() => setOpenMobile(true)}
            aria-label={t('accessibility.openSidebar')}
          >
            <Icons.menu className="size-5" />
          </Button>
          {showLogo && !isOverviewPage && (
            <>
              <Link href="/" prefetch={false} className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 touch-manipulation">
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
                {/* Brand name - always visible, muted styling */}
                <BreadcrumbItem className="shrink-0">
                  <BreadcrumbLink asChild>
                    <Link
                      href="/chat"
                      className="text-muted-foreground hover:text-foreground transition-colors text-sm sm:text-base"
                    >
                      {BRAND.displayName}
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                {/* Current page title - truncates to preserve brand visibility */}
                <BreadcrumbItem className="min-w-0 overflow-hidden max-w-64">
                  <BreadcrumbPage
                    className="line-clamp-1 truncate overflow-hidden text-ellipsis whitespace-nowrap text-sm sm:text-base max-w-64"
                    title={'isDynamic' in currentPage && currentPage.isDynamic ? currentPage.titleKey : t(currentPage.titleKey)}
                  >
                    {'isDynamic' in currentPage && currentPage.isDynamic
                      ? currentPage.titleKey
                      : t(currentPage.titleKey)}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          )}
        </div>
        {!isOverviewPage && (
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            {showScrollButton && <ChatScrollButton variant="header" />}
            {threadActions}
          </div>
        )}
      </div>
    </header>
  );
}
export const NavigationHeader = React.memo(NavigationHeaderComponent);
function MinimalHeaderComponent({ className }: { className?: string } = {}) {
  const t = useTranslations();
  const { setOpenMobile } = useSidebar();

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

  // Show glass header on mobile when thread flow is active (placeholders, pending, or streaming)
  const isThreadFlowActive = isStreaming || isCreatingThread || waitingToStartStreaming || isModeratorStreaming;
  const showGlassEffect = !showInitialUI && isThreadFlowActive;

  return (
    <header
      className={cn(
        // Base: sticky positioning
        'sticky top-0 left-0 right-0 z-50',
        // Layout
        'flex h-14 sm:h-16 shrink-0 items-center',
        // Mobile glass effect when streaming (sm: breakpoint removes it on tablet+)
        showGlassEffect && [
          'backdrop-blur-xl bg-background/60',
          'border-b border-border/30',
          'mb-2',
          // Remove glass effect on tablet and up
          'sm:backdrop-blur-none sm:bg-transparent sm:border-b-0 sm:mb-0',
        ],
        className,
      )}
    >
      {/* Mobile sidebar trigger - hidden on desktop where sidebar is visible */}
      <div className="flex items-center px-3 sm:px-4 md:hidden">
        <Button
          variant="ghost"
          size="icon"
          className="size-9 shrink-0"
          onClick={() => setOpenMobile(true)}
          aria-label={t('accessibility.openSidebar')}
        >
          <Icons.menu className="size-5" />
        </Button>
      </div>
      {/* Spacer for desktop - sidebar is visible there */}
      <div className="hidden md:block h-14 sm:h-16" />
    </header>
  );
}
export const MinimalHeader = React.memo(MinimalHeaderComponent);
type PageHeaderProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  children?: ReactNode;
  showSeparator?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};
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
  };
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
type ChatPageHeaderProps = {
  title: string;
  description: string;
  action?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};
export function ChatPageHeader({
  title,
  description,
  action,
  size = 'md',
  className,
}: ChatPageHeaderProps) {
  return (
    <ChatSection className={className}>
      <div className="mx-auto px-3 sm:px-4 md:px-6">
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
