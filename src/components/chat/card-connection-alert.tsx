/**
 * Card Connection Alert - Prompt for new users without payment method
 *
 * Shows when user hasn't connected a card yet (free plan without payment method)
 * Same styling as QuotaAlertExtension for visual consistency
 */
'use client';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { Button } from '@/components/ui/button';
import { useUsageStatsQuery } from '@/hooks/queries';
import { CREDIT_CONFIG } from '@/lib/config/credit-config';
import { cn } from '@/lib/ui/cn';

export function CardConnectionAlert() {
  const t = useTranslations();
  const { data: statsData, isLoading } = useUsageStatsQuery();

  // Show alert when user is on free plan without payment method connected
  const shouldShow = useMemo(() => {
    if (!statsData?.success || !statsData.data) {
      return false;
    }
    const { plan } = statsData.data;
    // Show for free plan users without payment method
    return plan?.type !== 'paid' && !plan?.hasPaymentMethod;
  }, [statsData]);

  if (isLoading || !shouldShow) {
    return null;
  }

  const freeCredits = CREDIT_CONFIG.PLANS.free.cardConnectionCredits.toLocaleString();

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
            'border-0 border-b border-amber-500/20 rounded-none rounded-t-2xl',
            'bg-amber-500/10',
          )}
        >
          <p className="text-[10px] leading-tight text-amber-600 dark:text-amber-500 font-medium text-left flex-1 min-w-0">
            {t('usage.cardAlert.description', { credits: freeCredits })}
          </p>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-6 px-3 text-[10px] font-semibold shrink-0 rounded-full border-amber-500/40 bg-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-500/30"
          >
            <Link href="/chat/pricing">
              {t('usage.cardAlert.connectCard')}
            </Link>
          </Button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
