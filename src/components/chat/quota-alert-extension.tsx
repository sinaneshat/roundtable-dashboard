'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { PlanTypes } from '@/api/core/enums';
import { useUsageStatsQuery } from '@/hooks/queries';
import { cn } from '@/lib/ui/cn';

/**
 * Quota Alert Extension - Shows ONLY for PAID users who are out of credits.
 *
 * Free users see the CardConnectionAlert (yellow/amber wrapper) instead.
 * This component shows a simple message without an upgrade button since
 * paid users cannot purchase the same plan again.
 */
export function QuotaAlertExtension() {
  const t = useTranslations('usage');
  const { data: statsData, isLoading } = useUsageStatsQuery();

  // Only show for PAID users who are out of credits
  // Free users see CardConnectionAlert instead
  const shouldShow = useMemo(() => {
    if (!statsData?.success || !statsData.data) {
      return false;
    }
    const { credits, plan } = statsData.data;
    // Only show for paid users - free users get CardConnectionAlert
    if (plan?.type !== PlanTypes.PAID) {
      return false;
    }
    return credits.available <= 0;
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
            'flex items-center justify-center gap-3 px-3 py-2',
            'border-0 border-b border-destructive/20 rounded-none rounded-t-2xl',
            'bg-destructive/10',
          )}
        >
          <p className="text-[10px] leading-tight text-destructive font-medium text-center">
            {t('quotaAlert.paidUserMessage')}
          </p>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
