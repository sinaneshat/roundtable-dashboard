'use client';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { ComponentSizes, ComponentVariants } from '@/api/core/enums';
import { Button } from '@/components/ui/button';
import { useFreeTrialState } from '@/hooks/utils';
import { cn } from '@/lib/ui/cn';

type FreeTrialAlertProps = {
  hasHeaderToggle?: boolean;
};

/**
 * Free Trial Alert - Shows upgrade prompt for free users
 *
 * Free users get ONE thread + ONE round upon signup.
 * Once they create a thread, they've used their quota and can only:
 * - Resume that thread (stream resumption works)
 * - Upgrade to Pro for unlimited access
 *
 * States:
 * - 'available': Fresh user, no thread created yet (green)
 * - 'used': User has created a thread (amber warning)
 */
export function FreeTrialAlert({ hasHeaderToggle = false }: FreeTrialAlertProps) {
  const t = useTranslations();
  const { isFreeUser, hasUsedTrial, isWarningState, isLoadingStats } = useFreeTrialState();

  if (isLoadingStats || !isFreeUser) {
    return null;
  }

  const getMessage = () => {
    if (hasUsedTrial) {
      return t('usage.freeTrial.usedDescription');
    }
    return t('usage.freeTrial.availableDescription');
  };

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
            'border-0 border-b rounded-none',
            hasHeaderToggle ? 'rounded-tr-2xl' : 'rounded-t-2xl',
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
            <Link href="/chat/pricing" className="flex items-center justify-center w-full h-full">
              {t('usage.freeTrial.upgradeToPro')}
            </Link>
          </Button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
