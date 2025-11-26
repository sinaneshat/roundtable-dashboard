'use client';
import {
  ArrowUpCircle,
  BarChart3,
  Clock,
  MessageSquare,
  MessagesSquare,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useUsageStatsQuery } from '@/hooks/queries';
import { cn } from '@/lib/ui/cn';

export function UsageMetrics() {
  const t = useTranslations();
  const router = useRouter();
  const { data: usageData, isLoading, isError } = useUsageStatsQuery();
  const threadsStatus = usageData?.data?.threads?.status ?? 'default';
  const messagesStatus = usageData?.data?.messages?.status ?? 'default';
  const analysisStatus = usageData?.data?.analysis?.status ?? 'default';
  const isMaxedOut = threadsStatus === 'critical' || messagesStatus === 'critical' || analysisStatus === 'critical';
  const hasWarning = threadsStatus === 'warning' || messagesStatus === 'warning' || analysisStatus === 'warning' || isMaxedOut;
  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-full rounded-md" />
        <Skeleton className="h-16 w-full rounded-md" />
      </div>
    );
  }
  if (isError || !usageData?.success) {
    return null;
  }
  const usage = usageData.data;
  const threadsPercentage = usage.threads.percentage;
  const messagesPercentage = usage.messages.percentage;
  const analysisPercentage = usage.analysis.percentage;
  const handleUpgrade = () => {
    router.push('/chat/pricing');
  };
  const isPremiumTier = usage.subscription.tier !== 'free';
  /**
   * Get progress indicator color based on usage status
   * Uses theme CSS variables for consistent styling without custom safelists
   * @see https://github.com/shadcn-ui/ui/discussions/1454
   */
  const getProgressIndicatorColor = (status: string): string => {
    switch (status) {
      case 'critical':
        return 'bg-destructive';
      case 'warning':
        return 'bg-warning';
      default:
        return 'bg-primary';
    }
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-2">
        <Badge
          variant={isPremiumTier ? 'default' : 'outline'}
          className={cn(
            'text-[10px] px-1.5 py-0.5 h-4 font-semibold capitalize',
            isMaxedOut && !isPremiumTier && 'border-destructive/40 text-destructive bg-destructive/10',
          )}
        >
          {t(`subscription.tiers.${usage.subscription.tier}.name`)}
        </Badge>
        <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
          <Clock className="size-2.5" />
          <span className="font-medium">
            {usage.period.daysRemaining}
            {' '}
            {t('usage.daysLeft')}
          </span>
        </div>
      </div>
      <div className="space-y-1.5">
        {/* Threads Usage */}
        <div className="space-y-0.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <MessagesSquare className="size-2.5 text-muted-foreground" />
              <span className="text-[10px] font-medium">{t('usage.threads')}</span>
            </div>
            <span className={cn(
              'font-mono text-[10px] font-semibold tabular-nums',
              threadsStatus === 'critical' && 'text-destructive',
              threadsStatus === 'warning' && 'text-orange-600 dark:text-orange-500',
            )}
            >
              {usage.threads.used.toLocaleString()}
              /
              {usage.threads.limit.toLocaleString()}
            </span>
          </div>
          <Progress
            value={threadsPercentage}
            className="h-1"
            indicatorClassName={getProgressIndicatorColor(threadsStatus)}
            aria-label={`${t('usage.threads')}: ${usage.threads.used} ${t('usage.of')} ${usage.threads.limit} ${t('usage.used')}`}
          />
        </div>

        {/* Messages Usage */}
        <div className="space-y-0.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <MessageSquare className="size-2.5 text-muted-foreground" />
              <span className="text-[10px] font-medium">{t('usage.messages')}</span>
            </div>
            <span className={cn(
              'font-mono text-[10px] font-semibold tabular-nums',
              messagesStatus === 'critical' && 'text-destructive',
              messagesStatus === 'warning' && 'text-orange-600 dark:text-orange-500',
            )}
            >
              {usage.messages.used.toLocaleString()}
              /
              {usage.messages.limit.toLocaleString()}
            </span>
          </div>
          <Progress
            value={messagesPercentage}
            className="h-1"
            indicatorClassName={getProgressIndicatorColor(messagesStatus)}
            aria-label={`${t('usage.messages')}: ${usage.messages.used} ${t('usage.of')} ${usage.messages.limit} ${t('usage.used')}`}
          />
        </div>

        {/* Analysis Usage */}
        <div className="space-y-0.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <BarChart3 className="size-2.5 text-muted-foreground" />
              <span className="text-[10px] font-medium">{t('usage.analysis')}</span>
            </div>
            <span className={cn(
              'font-mono text-[10px] font-semibold tabular-nums',
              analysisStatus === 'critical' && 'text-destructive',
              analysisStatus === 'warning' && 'text-orange-600 dark:text-orange-500',
            )}
            >
              {usage.analysis.used.toLocaleString()}
              /
              {usage.analysis.limit.toLocaleString()}
            </span>
          </div>
          <Progress
            value={analysisPercentage}
            className="h-1"
            indicatorClassName={getProgressIndicatorColor(analysisStatus)}
            aria-label={`${t('usage.analysis')}: ${usage.analysis.used} ${t('usage.of')} ${usage.analysis.limit} ${t('usage.used')}`}
          />
        </div>
      </div>
      {usage.subscription.pendingTierChange && (
        <div className="mt-2 rounded-md border border-amber-200/50 dark:border-amber-900/20 bg-amber-50/50 dark:bg-amber-950/10 p-1.5">
          <div className="flex items-center gap-1">
            <Clock className="size-2.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-[9px] font-medium text-amber-700 dark:text-amber-300">
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
      )}
      {(hasWarning || isMaxedOut) && !isPremiumTier && (
        <Button
          variant={isMaxedOut ? 'default' : 'outline'}
          size="sm"
          className="w-full h-6 rounded-md gap-1 text-[10px] font-medium mt-2"
          onClick={handleUpgrade}
        >
          <ArrowUpCircle className="size-2.5" />
          {t('usage.upgradeNow')}
        </Button>
      )}
    </div>
  );
}
