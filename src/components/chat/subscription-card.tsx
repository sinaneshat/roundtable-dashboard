'use client';

import { ArrowDownCircle, CreditCard, Info, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useSidebar } from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { useUsageStatsQuery } from '@/hooks/queries';
import { cn } from '@/lib/ui/cn';
import { chatGlass } from '@/lib/ui/glassmorphism';

/**
 * SubscriptionCard Component
 *
 * Minimal subscription card shown in sidebar above user section
 * - Displays current subscription plan
 * - Shows "Manage Billing" button only
 * - Uses glass design for modern aesthetic
 * - Matches shadcn MCP design patterns
 */
export function SubscriptionCard() {
  const t = useTranslations();
  const router = useRouter();
  const { state } = useSidebar();
  const { data: usageData, isLoading, isError } = useUsageStatsQuery();
  const [isProcessing, setIsProcessing] = useState(false);

  const isCollapsed = state === 'collapsed';

  // Hide when collapsed
  if (isCollapsed) {
    return null;
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="px-2 py-3">
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }

  // Error or no data - hide component
  if (isError || !usageData?.success) {
    return null;
  }

  const subscription = usageData.data.subscription;

  const handleManageBilling = async () => {
    setIsProcessing(true);
    try {
      // Navigate to pricing page where billing portal link exists
      router.push('/chat/pricing');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="px-2 py-3">
      <Card
        variant="glass"
        className={cn(
          chatGlass.quickStartCard,
          'p-4 gap-3',
        )}
      >
        {/* Plan Name & Icon */}
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
            <CreditCard className="size-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold capitalize truncate">
              {subscription.tier}
              {' '}
              {t('usage.plan')}
            </p>
            <p className="text-xs text-muted-foreground">
              {subscription.isAnnual ? t('pricing.card.annual') : t('pricing.card.monthly')}
            </p>
          </div>
        </div>

        {/* Pending Tier Change Badge */}
        {subscription.pendingTierChange && (
          <Badge
            variant="secondary"
            className="w-full justify-center text-[10px] gap-1 bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
          >
            <ArrowDownCircle className="size-3" />
            {t('subscription.changingTo')}
            {' '}
            <span className="font-semibold capitalize">{subscription.pendingTierChange}</span>
          </Badge>
        )}

        {/* Manage Billing Button */}
        <Button
          variant="outline"
          size="sm"
          className="w-full rounded-full"
          onClick={handleManageBilling}
          disabled={isProcessing}
        >
          {isProcessing
            ? (
                <>
                  <Loader2 className="size-3.5 animate-spin mr-2" />
                  {t('pricing.card.processing')}
                </>
              )
            : (
                t('pricing.card.manageBilling')
              )}
        </Button>

        {/* Info about plan changes */}
        <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground">
          <Info className="size-3 mt-0.5 shrink-0" />
          <p className="leading-tight">
            {t('subscription.planChangeInfo')}
          </p>
        </div>
      </Card>
    </div>
  );
}
