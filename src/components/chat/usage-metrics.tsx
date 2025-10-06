'use client';

import { AlertCircle, ArrowDownCircle, ArrowUpCircle, Clock, MessageSquare, MessagesSquare } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
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

        {/* Pending Tier Change Alert */}
        {usage.subscription.pendingTierChange && (
          <div className="rounded-lg border border-amber-200 dark:border-amber-900/30 bg-amber-50 dark:bg-amber-950/20 p-2.5 space-y-1.5">
            <div className="flex items-start gap-2">
              <Clock className="size-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0 space-y-0.5">
                <p className="text-[10px] font-medium text-amber-900 dark:text-amber-100">
                  {t('usage.scheduledChange')}
                </p>
                <p className="text-[10px] text-amber-700 dark:text-amber-300">
                  {t('usage.changingTo')}
                  {' '}
                  <span className="font-semibold capitalize">
                    {usage.subscription.pendingTierChange}
                  </span>
                  {' '}
                  {t('usage.onPeriodEnd')}
                </p>
              </div>
            </div>
            <Badge
              variant="outline"
              className="w-full justify-center text-[9px] h-5 bg-amber-100 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300"
            >
              <ArrowDownCircle className="size-2.5 mr-1" />
              {t('usage.keepAccessUntil')}
              {' '}
              {new Date(usage.period.end).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })}
            </Badge>
          </div>
        )}

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
