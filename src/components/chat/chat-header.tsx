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
import { SidebarTrigger } from '@/components/ui/sidebar';
import { BRAND } from '@/constants/brand';
import { cn } from '@/lib/ui/cn';

import { ChatSection } from './chat-states';
import { useThreadHeaderOptional } from './thread-header-context';

// =============================================================================
// UNIFIED HEADER SYSTEM FOR CHAT
// Consolidates: chat-header.tsx + page-header.tsx + chat/chat-header.tsx
// Following Next.js best practices: Server components pass data as props
// =============================================================================

const breadcrumbMap: Record<string, { titleKey: string; parent?: string }> = {
  '/chat': { titleKey: 'navigation.chat' },
  '/chat/pricing': { titleKey: 'navigation.pricing', parent: '/chat' },
};

// Navigation Header - consolidated navigation component
type NavigationHeaderProps = {
  className?: string;
  /**
   * Dynamic breadcrumb for thread pages - passed from server
   * Following Next.js pattern: server component passes data as props
   */
  threadTitle?: string;
  threadParent?: string;
  threadActions?: ReactNode;
  /**
   * Show sidebar trigger - set to false for public pages
   */
  showSidebarTrigger?: boolean;
  /**
   * Show logo instead of sidebar trigger - for public pages
   */
  showLogo?: boolean;
  /**
   * Constrain header content width to match page content
   */
  maxWidth?: boolean;
};

// ✅ CRITICAL: Memoize navigation header to prevent re-renders during message streaming
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

  // Get thread data from context (used by child components to pass data up to layout)
  // Use optional version that doesn't throw if provider is missing (for public pages)
  const context = useThreadHeaderOptional();

  // Merge context values with props (props take precedence for backward compatibility)
  // For public pages (showSidebarTrigger=false), don't use context values
  const threadTitle = threadTitleProp ?? (showSidebarTrigger ? context.threadTitle : null);
  const threadParent = threadParentProp ?? '/chat';
  const threadActions = threadActionsProp ?? (showSidebarTrigger ? context.threadActions : null);

  // Check if this is a thread page (dynamic route)
  // Handles both authenticated (/chat/[slug]) and public (/public/chat/[slug]) thread pages
  const isThreadPage = (
    (pathname?.startsWith('/chat/') && pathname !== '/chat' && pathname !== '/chat/pricing')
    || pathname?.startsWith('/public/chat/')
  );

  // Use thread props for thread pages, otherwise use static map
  const currentPage = isThreadPage && threadTitle
    ? { titleKey: threadTitle, parent: threadParent, isDynamic: true }
    : pathname ? breadcrumbMap[pathname] : undefined;

  const parentPage = currentPage?.parent ? breadcrumbMap[currentPage.parent] : null;

  return (
    <header
      className={cn(
        'sticky top-0 z-50 flex h-16 shrink-0 items-center gap-2 transition-all duration-200 ease-in-out',
        'backdrop-blur-2xl w-full',
        className,
      )}
    >
      <div className={cn(
        'flex items-center justify-between gap-2 px-3 sm:px-4 md:px-6 lg:px-8 h-16 w-full',
        maxWidth && 'max-w-full sm:max-w-3xl lg:max-w-4xl mx-auto',
      )}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Show either sidebar trigger or logo based on context */}
          {showSidebarTrigger && (
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

        {/* Action buttons at the right end - passed from server as props */}
        {threadActions && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {threadActions}
          </div>
        )}
      </div>
    </header>
  );
}

// Export memoized version to prevent unnecessary re-renders
export const NavigationHeader = React.memo(NavigationHeaderComponent);

// Page Header - replaces page-header.tsx
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

// Chat Page Header - replaces ui/chat-header.tsx
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

// Header Action Wrapper
export function PageHeaderAction({ children }: { children: ReactNode }) {
  return <div className="flex items-center space-x-2">{children}</div>;
}
