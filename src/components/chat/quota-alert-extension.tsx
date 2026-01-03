'use client';

import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { Button } from '@/components/ui/button';
import { useUsageStatsQuery } from '@/hooks/queries';
import { cn } from '@/lib/ui/cn';

export function QuotaAlertExtension() {
  const t = useTranslations('usage');
  const { data: statsData, isLoading } = useUsageStatsQuery();

  const isBlocked = useMemo(() => {
    if (!statsData?.success || !statsData.data) {
      return false;
    }
    return statsData.data.credits.available <= 0;
  }, [statsData]);

  if (isLoading || !isBlocked) {
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
            'border-0 border-b border-destructive/20 rounded-none rounded-t-2xl',
            'bg-destructive/10',
          )}
        >
          <p className="text-[10px] leading-tight text-destructive font-medium text-left flex-1 min-w-0">
            {t('quotaAlert.message')}
          </p>
          <Button
            asChild
            variant="destructive"
            size="sm"
            className="h-6 px-3 text-[10px] font-semibold shrink-0 rounded-full"
          >
            <Link href="/chat/pricing">
              {t('quotaAlert.action')}
            </Link>
          </Button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
