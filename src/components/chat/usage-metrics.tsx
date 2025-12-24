'use client';
import {
  ArrowUpCircle,
  Coins,
  CreditCard,
  Gift,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { UsageStatuses, UsageStatusMetadata } from '@/api/core/enums';
import { CREDIT_CONFIG } from '@/api/services/product-logic.service';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useUsageStatsQuery } from '@/hooks/queries';
import { cn } from '@/lib/ui/cn';

/**
 * ✅ CREDITS-ONLY: Simplified usage display
 * Shows only credit balance and plan info
 * Users don't need to see threads/messages/analysis quotas
 */
export function UsageMetrics() {
  const t = useTranslations();
  const router = useRouter();
  const { data: usageData, isLoading, isError } = useUsageStatsQuery();

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-full rounded-md" />
        <Skeleton className="h-8 w-full rounded-md" />
      </div>
    );
  }

  if (isError || !usageData?.success) {
    return null;
  }

  const { credits, plan } = usageData.data;
  const creditsStatus = credits?.status ?? UsageStatuses.DEFAULT;
  const isLowCredits = creditsStatus === UsageStatuses.CRITICAL || creditsStatus === UsageStatuses.WARNING;
  const isPaidPlan = plan?.type === 'paid';
  const hasPaymentMethod = plan?.hasPaymentMethod ?? false;

  // Calculate credit usage percentage
  const totalCredits = isPaidPlan ? (plan?.monthlyCredits || 1_000_000) : 10_000;
  const usedPercentage = Math.min(100, Math.round(((totalCredits - credits.available) / totalCredits) * 100));

  const handleUpgrade = () => {
    router.push('/chat/pricing');
  };

  return (
    <div className="space-y-3">
      {/* Plan Badge */}
      <div className="flex items-center justify-between">
        <Badge
          variant={isPaidPlan ? 'default' : 'outline'}
          className={cn(
            'text-[10px] px-1.5 py-0.5 h-4 font-semibold',
            !isPaidPlan && !hasPaymentMethod && 'border-amber-500/40 text-amber-600 bg-amber-500/10',
          )}
        >
          {plan?.name || 'Free'}
        </Badge>
        {!hasPaymentMethod && !isPaidPlan && (
          <div className="flex items-center gap-1 text-[9px] text-amber-600">
            <CreditCard className="size-2.5" />
            <span className="font-medium">{t('usage.addCard')}</span>
          </div>
        )}
      </div>

      {/* Credits Balance */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Coins className="size-3 text-muted-foreground" />
            <span className="text-xs font-medium">{t('usage.credits')}</span>
          </div>
          <span className={cn(
            'font-mono text-sm font-bold tabular-nums',
            UsageStatusMetadata[creditsStatus].textColor,
          )}
          >
            {credits.available.toLocaleString()}
          </span>
        </div>
        <Progress
          value={usedPercentage}
          className="h-1.5"
          indicatorClassName={UsageStatusMetadata[creditsStatus].progressColor}
          aria-label={`${credits.available.toLocaleString()} ${t('usage.creditsAvailable')}`}
        />
        <p className="text-[9px] text-muted-foreground text-right">
          {credits.available.toLocaleString()}
          {' '}
          {t('usage.creditsAvailable')}
        </p>
      </div>

      {/* Actions */}
      {!isPaidPlan && (
        <div className="space-y-2">
          {/* Descriptive message for users without payment method */}
          {!hasPaymentMethod && (
            <div className="flex items-start gap-2 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <Gift className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
              <p className="text-[10px] leading-tight text-emerald-600 dark:text-emerald-400">
                {t('usage.cardAlert.sidebarMessage', {
                  credits: CREDIT_CONFIG.PLANS.free.cardConnectionCredits.toLocaleString(),
                })}
              </p>
            </div>
          )}

          {/* Glass-style button */}
          <button
            type="button"
            onClick={handleUpgrade}
            className={cn(
              'w-full flex items-center justify-center gap-1.5 h-8 rounded-full text-xs font-medium',
              'backdrop-blur-sm transition-all duration-200',
              hasPaymentMethod
                ? 'bg-white/5 hover:bg-white/10 active:bg-white/15 text-foreground'
                : 'bg-emerald-500/20 hover:bg-emerald-500/25 active:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30',
              isLowCredits && hasPaymentMethod && 'bg-amber-500/20 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30',
            )}
          >
            {hasPaymentMethod
              ? (
                  <>
                    <ArrowUpCircle className="size-3" />
                    {t('usage.upgradeNow')}
                  </>
                )
              : (
                  <>
                    <CreditCard className="size-3" />
                    {t('usage.connectCard')}
                  </>
                )}
          </button>
        </div>
      )}
    </div>
  );
}
