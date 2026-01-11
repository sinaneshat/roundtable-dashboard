'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { memo } from 'react';

import { ComponentSizes, ComponentVariants } from '@/api/core/enums';
import { Button } from '@/components/ui/button';
import { useFreeTrialState } from '@/hooks/utils';
import { cn } from '@/lib/ui/cn';

export const ChatInputUpgradeBanner = memo(() => {
  const t = useTranslations();
  const { isFreeUser, isLoadingStats, hasUsedTrial } = useFreeTrialState();

  if (isLoadingStats || !isFreeUser) {
    return null;
  }

  const message = hasUsedTrial
    ? t('usage.freeTrial.usedDescription')
    : t('usage.freeTrial.availableDescription');

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3',
        'rounded-t-2xl',
        'border border-b-0',
        'px-3 sm:px-4 py-2 sm:py-2.5',
        'bg-card',
        hasUsedTrial
          ? 'border-amber-500/30'
          : 'border-green-500/30',
      )}
    >
      <p
        className={cn(
          'text-[11px] sm:text-xs font-medium flex-1 min-w-0 text-left',
          hasUsedTrial
            ? 'text-amber-600 dark:text-amber-400'
            : 'text-green-600 dark:text-green-400',
        )}
      >
        {message}
      </p>
      <Button
        asChild
        variant={ComponentVariants.OUTLINE}
        size={ComponentSizes.SM}
        className={cn(
          'h-7 px-4 text-[11px] font-semibold shrink-0 rounded-full',
          hasUsedTrial
            ? 'border-amber-500/40 bg-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-500/30'
            : 'border-green-500/40 bg-green-500/20 text-green-600 dark:text-green-400 hover:bg-green-500/30',
        )}
      >
        <Link href="/chat/pricing">
          {t('usage.freeTrial.upgradeToPro')}
        </Link>
      </Button>
    </div>
  );
});

ChatInputUpgradeBanner.displayName = 'ChatInputUpgradeBanner';
