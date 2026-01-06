'use client';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { ComponentSizes, ComponentVariants, PlanTypes } from '@/api/core/enums';
import { useChatStore } from '@/components/providers/chat-store-provider/context';
import { Button } from '@/components/ui/button';
import { useThreadsQuery, useUsageStatsQuery } from '@/hooks/queries';
import { cn } from '@/lib/ui/cn';

type AlertState = 'fresh' | 'hasThread' | 'completed';

export function CardConnectionAlert() {
  const t = useTranslations();
  const { data: statsData, isLoading: isLoadingStats } = useUsageStatsQuery();
  const { data: threadsData, isLoading: isLoadingThreads } = useThreadsQuery();
  const messages = useChatStore(state => state.messages);
  const hasLocalMessages = messages.length > 0;

  const freeRoundUsedFromApi = useMemo(() => {
    if (!statsData?.success || !statsData.data) {
      return false;
    }
    return statsData.data.plan?.freeRoundUsed ?? false;
  }, [statsData]);

  // Check if free user has existing threads (even incomplete ones)
  const existingThread = useMemo(() => {
    if (!threadsData?.pages?.[0]?.success) {
      return null;
    }
    const threads = threadsData.pages[0].data?.items ?? [];
    return threads[0] ?? null; // Get first/most recent thread
  }, [threadsData]);

  const hasExistingThread = existingThread !== null;
  const hasCompletedRound = freeRoundUsedFromApi || hasLocalMessages;

  // Determine alert state: fresh (no thread), hasThread (incomplete), completed (round done)
  const alertState: AlertState = useMemo(() => {
    if (hasCompletedRound)
      return 'completed';
    if (hasExistingThread)
      return 'hasThread';
    return 'fresh';
  }, [hasCompletedRound, hasExistingThread]);

  const shouldShow = useMemo(() => {
    if (!statsData?.success || !statsData.data) {
      return false;
    }
    const { plan } = statsData.data;
    return plan?.type !== PlanTypes.PAID;
  }, [statsData]);

  const isLoading = isLoadingStats || isLoadingThreads;

  if (isLoading || !shouldShow) {
    return null;
  }

  // Get appropriate message based on state
  const getMessage = () => {
    switch (alertState) {
      case 'completed':
        return t('usage.alert.postRoundDescription');
      case 'hasThread':
        return t('usage.alert.incompleteThreadDescription');
      default:
        return t('usage.alert.defaultDescription');
    }
  };

  // Get button text and link based on state
  const getButtonConfig = () => {
    if (alertState === 'hasThread' && existingThread?.slug) {
      return {
        text: t('usage.alert.continueThread'),
        href: `/chat/${existingThread.slug}`,
      };
    }
    return {
      text: t('usage.alert.upgradeToPro'),
      href: '/chat/pricing',
    };
  };

  const buttonConfig = getButtonConfig();
  const isWarningState = alertState !== 'fresh';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.25, ease: 'easeInOut' }}
        className="overflow-hidden"
      >
        <div
          className={cn(
            'flex items-center justify-between gap-3 px-3 py-2',
            'border-0 border-b rounded-none rounded-t-2xl',
            isWarningState
              ? 'border-amber-500/20 bg-amber-500/10'
              : 'border-green-500/20 bg-green-500/10',
          )}
        >
          <p className={cn(
            'text-[11px] leading-tight font-medium text-left flex-1 min-w-0',
            isWarningState
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-green-600 dark:text-green-400',
          )}
          >
            {getMessage()}
          </p>
          <Button
            asChild
            variant={ComponentVariants.OUTLINE}
            size={ComponentSizes.SM}
            className={cn(
              'h-7 px-4 text-[11px] font-semibold shrink-0 rounded-full relative z-10',
              isWarningState
                ? 'border-amber-500/40 bg-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-500/30'
                : 'border-green-500/40 bg-green-500/20 text-green-600 dark:text-green-400 hover:bg-green-500/30',
            )}
          >
            <Link href={buttonConfig.href} className="flex items-center justify-center w-full h-full">
              {buttonConfig.text}
            </Link>
          </Button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
