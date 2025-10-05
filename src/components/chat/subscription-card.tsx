'use client';

import { CreditCard, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

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
      </Card>
    </div>
  );
}
