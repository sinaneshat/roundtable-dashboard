'use client';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { ComponentSizes, ComponentVariants, PlanTypes } from '@/api/core/enums';
import { useChatStore } from '@/components/providers/chat-store-provider/context';
import { Button } from '@/components/ui/button';
import { useUsageStatsQuery } from '@/hooks/queries';
import { cn } from '@/lib/ui/cn';

export function CardConnectionAlert() {
  const t = useTranslations();
  const { data: statsData, isLoading } = useUsageStatsQuery();
  const messages = useChatStore(state => state.messages);
  const hasLocalMessages = messages.length > 0;

  const freeRoundUsedFromApi = useMemo(() => {
    if (!statsData?.success || !statsData.data) {
      return false;
    }
    return statsData.data.plan?.freeRoundUsed ?? false;
  }, [statsData]);

  const hasCompletedRound = freeRoundUsedFromApi || hasLocalMessages;

  const shouldShow = useMemo(() => {
    if (!statsData?.success || !statsData.data) {
      return false;
    }
    const { plan } = statsData.data;
    return plan?.type !== PlanTypes.PAID;
  }, [statsData]);

  if (isLoading || !shouldShow) {
    return null;
  }

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
            hasCompletedRound
              ? 'border-amber-500/20 bg-amber-500/10'
              : 'border-green-500/20 bg-green-500/10',
          )}
        >
          <p className={cn(
            'text-[11px] leading-tight font-medium text-left flex-1 min-w-0',
            hasCompletedRound
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-green-600 dark:text-green-400',
          )}
          >
            {hasCompletedRound
              ? t('usage.alert.postRoundDescription')
              : t('usage.alert.defaultDescription')}
          </p>
          <Button
            asChild
            variant={ComponentVariants.OUTLINE}
            size={ComponentSizes.SM}
            className={cn(
              'h-7 px-4 text-[11px] font-semibold shrink-0 rounded-full relative z-10',
              hasCompletedRound
                ? 'border-amber-500/40 bg-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-500/30'
                : 'border-green-500/40 bg-green-500/20 text-green-600 dark:text-green-400 hover:bg-green-500/30',
            )}
          >
            <Link href="/chat/pricing" className="flex items-center justify-center w-full h-full">
              {t('usage.alert.upgradeToPro')}
            </Link>
          </Button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
