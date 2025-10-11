'use client';

import { ArrowUpCircle, ChevronDown, Clock, MessageSquare, MessagesSquare } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { SidebarMenu, SidebarMenuItem } from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { useUsageStatsQuery } from '@/hooks/queries';
import { cn } from '@/lib/ui/cn';

/**
 * UsageMetrics Component - Minimal Design
 *
 * Shows a subtle, collapsible view of usage statistics
 * Collapsed by default to reduce visual noise
 * Expands to show detailed usage when needed
 */
export function UsageMetrics() {
  const t = useTranslations();
  const router = useRouter();
  const { data: usageData, isLoading, isError } = useUsageStatsQuery();
  const [isOpen, setIsOpen] = useState(false);

  // Loading state - minimal skeleton
  if (isLoading) {
    return (
      <SidebarMenu className="group-data-[collapsible=icon]:hidden">
        <SidebarMenuItem>
          <Skeleton className="h-9 w-full rounded-md" />
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  // Error state - hide completely on error
  if (isError || !usageData?.success) {
    return null;
  }

  const usage = usageData.data;

  // Calculate warning states
  const threadsWarning = usage.threads.percentage >= 80;
  const messagesWarning = usage.messages.percentage >= 80;
  const threadsMaxedOut = usage.threads.percentage >= 100;
  const messagesMaxedOut = usage.messages.percentage >= 100;
  const isMaxedOut = threadsMaxedOut || messagesMaxedOut;
  const hasWarning = threadsWarning || messagesWarning;

  const handleUpgrade = () => {
    router.push('/chat/pricing');
  };

  // Determine if user has premium tier
  const isPremiumTier = usage.subscription.tier !== 'free';

  return (
    <SidebarMenu className="group-data-[collapsible=icon]:hidden">
      <Collapsible open={isOpen} onOpenChange={setIsOpen} asChild>
        <SidebarMenuItem>
          {/* Collapsed State - Minimal with Premium Indicator */}
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'w-full justify-between h-9 px-2 text-xs font-normal hover:bg-accent/50 transition-colors',
                hasWarning && 'text-destructive/80 hover:text-destructive',
              )}
            >
              <div className="flex items-center gap-1.5">
                <Badge
                  variant={isPremiumTier ? 'default' : 'outline'}
                  className={cn(
                    'text-[10px] px-1.5 py-0 h-4 font-medium capitalize',
                    !isPremiumTier && 'border-muted-foreground/20',
                    hasWarning && !isPremiumTier && 'border-destructive/30 text-destructive bg-destructive/5',
                  )}
                >
                  {t(`subscription.tiers.${usage.subscription.tier}`)}
                </Badge>
                {hasWarning && (
                  <span className="text-[9px] text-muted-foreground">
                    {Math.min(usage.threads.remaining, usage.messages.remaining)}
                    {' '}
                    {t('usage.remaining')}
                  </span>
                )}
              </div>
              <ChevronDown
                className={cn(
                  'size-3 text-muted-foreground transition-transform duration-200',
                  isOpen && 'rotate-180',
                )}
              />
            </Button>
          </CollapsibleTrigger>

          {/* Expanded State - Minimal Design */}
          <CollapsibleContent className="space-y-2 pt-2 px-2">
            {/* Threads Usage */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-1">
                  <MessagesSquare className="size-3" />
                  <span className="text-muted-foreground">{t('usage.threads')}</span>
                </div>
                <span className={cn(
                  'font-mono text-[9px]',
                  threadsWarning ? 'text-destructive font-medium' : 'text-muted-foreground',
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
                  'h-1',
                  threadsWarning && '[&>*]:bg-destructive',
                )}
              />
            </div>

            {/* Messages Usage */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-1">
                  <MessageSquare className="size-3" />
                  <span className="text-muted-foreground">{t('usage.messages')}</span>
                </div>
                <span className={cn(
                  'font-mono text-[9px]',
                  messagesWarning ? 'text-destructive font-medium' : 'text-muted-foreground',
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
                  'h-1',
                  messagesWarning && '[&>*]:bg-destructive',
                )}
              />
            </div>

            {/* Period Info */}
            <div className="flex items-center justify-between text-[9px] text-muted-foreground pt-0.5">
              <span>
                {usage.period.daysRemaining}
                {' '}
                {t('usage.daysLeft')}
              </span>
            </div>

            {/* Pending Tier Change Alert - Compact */}
            {usage.subscription.pendingTierChange && (
              <div className="rounded-md border border-amber-200/50 dark:border-amber-900/20 bg-amber-50/50 dark:bg-amber-950/10 p-1.5">
                <div className="flex items-center gap-1.5">
                  <Clock className="size-3 text-amber-600 dark:text-amber-400 shrink-0" />
                  <p className="text-[9px] text-amber-700 dark:text-amber-300">
                    {t('usage.changingTo')}
                    {' '}
                    <span className="font-semibold capitalize">
                      {usage.subscription.pendingTierChange}
                    </span>
                  </p>
                </div>
              </div>
            )}

            {/* Upgrade button - minimal, only when maxed out */}
            {isMaxedOut && (
              <Button
                variant="outline"
                size="sm"
                className="w-full h-7 rounded-md gap-1 text-[10px]"
                onClick={handleUpgrade}
              >
                <ArrowUpCircle className="size-3" />
                {t('usage.upgradeNow')}
              </Button>
            )}
          </CollapsibleContent>
        </SidebarMenuItem>
      </Collapsible>
    </SidebarMenu>
  );
}
