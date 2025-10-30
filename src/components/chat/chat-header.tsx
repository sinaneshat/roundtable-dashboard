'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import React from 'react';

import { Logo } from '@/components/logo';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { BRAND } from '@/constants/brand';
import { cn } from '@/lib/ui/cn';

import { ChatScrollButton } from './chat-scroll-button';
import { ChatSection } from './chat-states';
import { useThreadHeaderOptional } from './thread-header-context';

const breadcrumbMap: Record<string, { titleKey: string; parent?: string }> = {
  '/chat': { titleKey: 'navigation.chat' },
  '/chat/pricing': { titleKey: 'navigation.pricing', parent: '/chat' },
};
type NavigationHeaderProps = {
  className?: string;
  threadTitle?: string;
  threadParent?: string;
  threadActions?: ReactNode;
  showSidebarTrigger?: boolean;
  showLogo?: boolean;
  maxWidth?: boolean;
};
function NavigationHeaderComponent({
  className,
  threadTitle: threadTitleProp,
  threadParent: threadParentProp,
  threadActions: threadActionsProp,
  showSidebarTrigger = true,
  showLogo = false,
  maxWidth = false,
}: NavigationHeaderProps = {}) {
  const pathname = usePathname();
  const t = useTranslations();
  const context = useThreadHeaderOptional();
  const { state } = useSidebar();
  const threadTitle = threadTitleProp ?? (showSidebarTrigger ? context.threadTitle : null);
  const threadParent = threadParentProp ?? '/chat';
  const threadActions = threadActionsProp ?? (showSidebarTrigger ? context.threadActions : null);
  const isThreadPage = (
    (pathname?.startsWith('/chat/') && pathname !== '/chat' && pathname !== '/chat/pricing')
    || pathname?.startsWith('/public/chat/')
  );
  const currentPage = isThreadPage && threadTitle
    ? { titleKey: threadTitle, parent: threadParent, isDynamic: true }
    : pathname ? breadcrumbMap[pathname] : undefined;
  const parentPage = currentPage?.parent ? breadcrumbMap[currentPage.parent] : null;
  return (
    <header
      className={cn(
        'sticky top-0 left-0 right-0 z-50 flex h-16 shrink-0 items-center gap-2 transition-all duration-200 ease-in-out',
        'border-b border-border/40 backdrop-blur-xl bg-background/60 supports-[backdrop-filter]:bg-background/60 w-full',
        className,
      )}
    >
      <div className={cn(
        'flex items-center justify-between gap-2 px-3 sm:px-4 md:px-6 lg:px-8 h-16 w-full',
        maxWidth && 'max-w-full sm:max-w-3xl lg:max-w-4xl mx-auto',
      )}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {showSidebarTrigger && state === 'collapsed' && (
            <>
              <SidebarTrigger className="-ms-1 flex-shrink-0" />
              <Separator orientation="vertical" className="me-2 h-4 flex-shrink-0" />
            </>
          )}
          {showLogo && (
            <>
              <Link href="/" className="flex items-center gap-2 flex-shrink-0">
                <Logo size="sm" variant="icon" />
                <span className="text-base font-semibold tracking-tight">
                  {BRAND.displayName}
                </span>
              </Link>
              <Separator orientation="vertical" className="me-2 h-4 flex-shrink-0" />
            </>
          )}
          {currentPage && (
            <Breadcrumb className="min-w-0 flex-1">
              <BreadcrumbList>
                {parentPage && (
                  <>
                    <BreadcrumbItem className="hidden md:block">
                      <BreadcrumbLink asChild>
                        <Link href={currentPage.parent!}>
                          {t(parentPage.titleKey)}
                        </Link>
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator className="hidden md:block" />
                  </>
                )}
                <BreadcrumbItem className="min-w-0 max-w-md">
                  <BreadcrumbPage className="line-clamp-1 truncate max-w-full" title={'isDynamic' in currentPage && currentPage.isDynamic ? currentPage.titleKey : t(currentPage.titleKey)}>
                    {'isDynamic' in currentPage && currentPage.isDynamic
                      ? currentPage.titleKey
                      : t(currentPage.titleKey)}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <ChatScrollButton variant="header" />
          {threadActions}
        </div>
      </div>
    </header>
  );
}
export const NavigationHeader = React.memo(NavigationHeaderComponent);
function MinimalHeaderComponent({ className }: { className?: string } = {}) {
  const { state } = useSidebar();

  return (
    <header
      className={cn(
        'sticky top-0 left-0 right-0 z-50 flex h-16 shrink-0 items-center',
        className,
      )}
    >
      <div className="flex items-center gap-2 px-4 md:px-6 lg:px-8 h-16">
        {state === 'collapsed' && <SidebarTrigger className="-ms-1" />}
      </div>
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
