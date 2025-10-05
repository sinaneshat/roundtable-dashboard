'use client';

import { AlertCircle, ArrowUpCircle, MessageSquare, MessagesSquare } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useSidebar } from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { useUsageStatsQuery } from '@/hooks/queries';
import { cn } from '@/lib/ui/cn';

/**
 * UsageMetrics Component
 *
 * Displays user's current usage statistics for threads and messages
 * Shows progress bars and remaining quota
 * Non-clickable - only shows upgrade button when quota is maxed out
 * Positioned above the profile icon in the sidebar
 */
export function UsageMetrics() {
  const t = useTranslations();
  const router = useRouter();
  const { state } = useSidebar();
  const { data: usageData, isLoading, isError } = useUsageStatsQuery();

  const isCollapsed = state === 'collapsed';

  // Loading state
  if (isLoading) {
    return (
      <div className={cn('px-2 py-3', isCollapsed && 'px-2')}>
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-2 w-full" />
        </div>
      </div>
    );
  }

  // Error state
  if (isError || !usageData?.success) {
    return (
      <div className={cn('px-2 py-3', isCollapsed && 'hidden')}>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <AlertCircle className="size-4" />
          <span>{t('usage.errorLoading')}</span>
        </div>
      </div>
    );
  }

  const usage = usageData.data;

  // Collapsed state - show minimal icons with tooltips
  if (isCollapsed) {
    return (
      <div className="flex flex-col items-center gap-2 px-2 py-3">
        <div className="flex size-8 items-center justify-center rounded-md bg-sidebar-accent">
          <MessagesSquare className="size-4" />
        </div>
      </div>
    );
  }

  // Calculate if user is approaching limits (80% or more) or maxed out (100%)
  const threadsWarning = usage.threads.percentage >= 80;
  const messagesWarning = usage.messages.percentage >= 80;
  const threadsMaxedOut = usage.threads.percentage >= 100;
  const messagesMaxedOut = usage.messages.percentage >= 100;
  const isMaxedOut = threadsMaxedOut || messagesMaxedOut;

  const handleUpgrade = () => {
    router.push('/chat/pricing');
  };

  return (
    <div className="px-2 py-3">
      <div className="space-y-3">
        {/* Threads Usage */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <MessagesSquare className="size-3.5" />
              <span className="font-medium">{t('usage.threads')}</span>
            </div>
            <span className={cn(
              'font-mono text-[10px]',
              threadsWarning ? 'text-destructive' : 'text-muted-foreground',
            )}
            >
              {usage.threads.used}
              /
              {usage.threads.limit}
            </span>
          </div>
          <Progress
            value={usage.threads.percentage}
            className={cn(
              'h-1.5',
              threadsWarning && '[&>*]:bg-destructive',
            )}
          />
          {threadsWarning && (
            <p className="text-[10px] text-destructive">
              {usage.threads.remaining}
              {' '}
              {t('usage.threadsRemaining')}
            </p>
          )}
        </div>

        {/* Messages Usage */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <MessageSquare className="size-3.5" />
              <span className="font-medium">{t('usage.messages')}</span>
            </div>
            <span className={cn(
              'font-mono text-[10px]',
              messagesWarning ? 'text-destructive' : 'text-muted-foreground',
            )}
            >
              {usage.messages.used}
              /
              {usage.messages.limit}
            </span>
          </div>
          <Progress
            value={usage.messages.percentage}
            className={cn(
              'h-1.5',
              messagesWarning && '[&>*]:bg-destructive',
            )}
          />
          {messagesWarning && (
            <p className="text-[10px] text-destructive">
              {usage.messages.remaining}
              {' '}
              {t('usage.messagesRemaining')}
            </p>
          )}
        </div>

        {/* Subscription Tier & Period Info */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1">
          <span className="capitalize">
            {usage.subscription.tier}
            {' '}
            {t('usage.plan')}
          </span>
          <span>
            {usage.period.daysRemaining}
            {' '}
            {t('usage.daysLeft')}
          </span>
        </div>

        {/* Upgrade button - only shown when quota is maxed out */}
        {isMaxedOut && (
          <Button
            variant="outline"
            size="sm"
            className="w-full rounded-full gap-1.5"
            onClick={handleUpgrade}
          >
            <ArrowUpCircle className="size-3.5" />
            {t('usage.upgradeNow')}
          </Button>
        )}
      </div>
    </div>
  );
}
