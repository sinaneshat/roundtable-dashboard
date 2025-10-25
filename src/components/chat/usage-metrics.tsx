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
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useUsageStatsQuery } from '@/hooks/queries';
import { cn } from '@/lib/ui/cn';

export function UsageMetrics() {
  const t = useTranslations();
  const router = useRouter();
  const { data: usageData, isLoading, isError } = useUsageStatsQuery();
  const threadsStatus = usageData?.success ? usageData.data.threads.status : 'default';
  const messagesStatus = usageData?.success ? usageData.data.messages.status : 'default';
  const analysisStatus = usageData?.success ? usageData.data.analysis.status : 'default';
  const isMaxedOut = threadsStatus === 'critical' || messagesStatus === 'critical' || analysisStatus === 'critical';
  const hasWarning = threadsStatus === 'warning' || messagesStatus === 'warning' || analysisStatus === 'warning' || isMaxedOut;
  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-full rounded-md" />
        <Skeleton className="h-20 w-full rounded-md" />
        <Skeleton className="h-4 w-2/3 rounded-md" />
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
  const getProgressColor = (status: string) => {
    switch (status) {
      case 'critical':
        return '[&>*]:bg-destructive';
      case 'warning':
        return '[&>*]:bg-orange-500 dark:[&>*]:bg-orange-600';
      default:
        return '';
    }
  };
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <Badge
          variant={isPremiumTier ? 'default' : 'outline'}
          className={cn(
            'text-[11px] px-2 py-0.5 h-5 font-semibold capitalize',
            isMaxedOut && !isPremiumTier && 'border-destructive/40 text-destructive bg-destructive/10',
          )}
        >
          {t(`subscription.tiers.${usage.subscription.tier}.name`)}
        </Badge>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Clock className="size-3" />
          <span className="font-medium">
            {usage.period.daysRemaining}
            {' '}
            {t('usage.daysLeft')}
          </span>
        </div>
      </div>
      <Separator className="my-2" />
      <div className="space-y-2.5">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <MessagesSquare className="size-3 text-muted-foreground" />
              <span className="text-[11px] font-medium">{t('usage.threads')}</span>
            </div>
            <span className={cn(
              'font-mono text-[11px] font-semibold tabular-nums',
              threadsStatus === 'critical' && 'text-destructive',
              threadsStatus === 'warning' && 'text-orange-600 dark:text-orange-500',
            )}
            >
              {threadsPercentage.toFixed(0)}
              %
            </span>
          </div>
          <Progress
            value={threadsPercentage}
            className={cn('h-1.5', getProgressColor(threadsStatus))}
            aria-label={`${t('usage.threads')}: ${usage.threads.used} ${t('usage.of')} ${usage.threads.limit} ${t('usage.used')}`}
          />
          <div className="flex items-center justify-between text-[9px] text-muted-foreground">
            <span>
              {usage.threads.used.toLocaleString()}
              {' '}
              {t('usage.of')}
              {' '}
              {usage.threads.limit.toLocaleString()}
            </span>
            <span className={cn(
              'font-medium',
              threadsStatus === 'warning' && 'text-orange-600 dark:text-orange-500',
              threadsStatus === 'critical' && 'text-destructive',
            )}
            >
              {usage.threads.remaining.toLocaleString()}
              {' '}
              {t('usage.remaining')}
            </span>
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <MessageSquare className="size-3 text-muted-foreground" />
              <span className="text-[11px] font-medium">{t('usage.messages')}</span>
            </div>
            <span className={cn(
              'font-mono text-[11px] font-semibold tabular-nums',
              messagesStatus === 'critical' && 'text-destructive',
              messagesStatus === 'warning' && 'text-orange-600 dark:text-orange-500',
            )}
            >
              {messagesPercentage.toFixed(0)}
              %
            </span>
          </div>
          <Progress
            value={messagesPercentage}
            className={cn('h-1.5', getProgressColor(messagesStatus))}
            aria-label={`${t('usage.messages')}: ${usage.messages.used} ${t('usage.of')} ${usage.messages.limit} ${t('usage.used')}`}
          />
          <div className="flex items-center justify-between text-[9px] text-muted-foreground">
            <span>
              {usage.messages.used.toLocaleString()}
              {' '}
              {t('usage.of')}
              {' '}
              {usage.messages.limit.toLocaleString()}
            </span>
            <span className={cn(
              'font-medium',
              messagesStatus === 'warning' && 'text-orange-600 dark:text-orange-500',
              messagesStatus === 'critical' && 'text-destructive',
            )}
            >
              {usage.messages.remaining.toLocaleString()}
              {' '}
              {t('usage.remaining')}
            </span>
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <BarChart3 className="size-3 text-muted-foreground" />
              <span className="text-[11px] font-medium">{t('usage.analysis')}</span>
            </div>
            <span className={cn(
              'font-mono text-[11px] font-semibold tabular-nums',
              analysisStatus === 'critical' && 'text-destructive',
              analysisStatus === 'warning' && 'text-orange-600 dark:text-orange-500',
            )}
            >
              {analysisPercentage.toFixed(0)}
              %
            </span>
          </div>
          <Progress
            value={analysisPercentage}
            className={cn('h-1.5', getProgressColor(analysisStatus))}
            aria-label={`${t('usage.analysis')}: ${usage.analysis.used} ${t('usage.of')} ${usage.analysis.limit} ${t('usage.used')}`}
          />
          <div className="flex items-center justify-between text-[9px] text-muted-foreground">
            <span>
              {usage.analysis.used.toLocaleString()}
              {' '}
              {t('usage.of')}
              {' '}
              {usage.analysis.limit.toLocaleString()}
            </span>
            <span className={cn(
              'font-medium',
              analysisStatus === 'warning' && 'text-orange-600 dark:text-orange-500',
              analysisStatus === 'critical' && 'text-destructive',
            )}
            >
              {usage.analysis.remaining.toLocaleString()}
              {' '}
              {t('usage.remaining')}
            </span>
          </div>
        </div>
      </div>
      {usage.subscription.pendingTierChange && (
        <>
          <Separator className="my-2" />
          <div className="rounded-md border border-amber-200/50 dark:border-amber-900/20 bg-amber-50/50 dark:bg-amber-950/10 p-1.5">
            <div className="flex items-center gap-1.5">
              <Clock className="size-3 text-amber-600 dark:text-amber-400 shrink-0" />
              <div className="flex-1">
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
          </div>
        </>
      )}
      {(hasWarning || isMaxedOut) && !isPremiumTier && (
        <>
          <Separator className="my-2" />
          <Button
            variant={isMaxedOut ? 'default' : 'outline'}
            size="sm"
            className="w-full h-7 rounded-md gap-1 text-[11px] font-medium"
            onClick={handleUpgrade}
          >
            <ArrowUpCircle className="size-3" />
            {t('usage.upgradeNow')}
          </Button>
        </>
      )}
    </div>
  );
}
