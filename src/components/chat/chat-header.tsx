'use client';

import { motion } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

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
import { cn } from '@/lib/ui/cn';

import { useBreadcrumb } from './breadcrumb-context';
import { ChatSection } from './chat-states';

// =============================================================================
// UNIFIED HEADER SYSTEM FOR CHAT
// Consolidates: chat-header.tsx + page-header.tsx + chat/chat-header.tsx
// Eliminates ~128 lines of duplicate code with consistent API
// =============================================================================

const breadcrumbMap: Record<string, { titleKey: string; parent?: string }> = {
  '/chat': { titleKey: 'navigation.chat' },
  '/chat/pricing': { titleKey: 'navigation.pricing', parent: '/chat' },
};

// Navigation Header - consolidated navigation component
type NavigationHeaderProps = {
  className?: string;
};

export function NavigationHeader({ className }: NavigationHeaderProps = {}) {
  const pathname = usePathname();
  const t = useTranslations();
  const { dynamicBreadcrumb } = useBreadcrumb();

  // Check if this is a thread page (dynamic route)
  const isThreadPage = pathname?.startsWith('/chat/') && pathname !== '/chat' && pathname !== '/chat/pricing';

  // Use dynamic breadcrumb for thread pages, otherwise use static map
  const currentPage = isThreadPage && dynamicBreadcrumb
    ? { titleKey: dynamicBreadcrumb.title, parent: dynamicBreadcrumb.parent || '/chat', isDynamic: true }
    : pathname ? breadcrumbMap[pathname] : undefined;

  const parentPage = currentPage?.parent ? breadcrumbMap[currentPage.parent] : null;

  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className={cn(
        'flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 px-4 w-full">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="-ms-1" />
          <Separator orientation="vertical" className="me-2 h-4" />
          {currentPage && (
            <Breadcrumb>
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
                <BreadcrumbItem>
                  <BreadcrumbPage className="line-clamp-1 max-w-[300px]">
                    {'isDynamic' in currentPage && currentPage.isDynamic
                      ? currentPage.titleKey
                      : t(currentPage.titleKey)}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          )}
        </div>

        {/* Action buttons at the right end */}
        {dynamicBreadcrumb?.actions && (
          <div className="flex items-center gap-1">
            {dynamicBreadcrumb.actions}
          </div>
        )}
      </div>
    </motion.header>
  );
}

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
    </ChatSection>
  );
}

// Header Action Wrapper
export function PageHeaderAction({ children }: { children: ReactNode }) {
  return <div className="flex items-center space-x-2">{children}</div>;
}
