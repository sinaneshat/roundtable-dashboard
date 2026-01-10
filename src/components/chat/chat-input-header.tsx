'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { memo } from 'react';

import { ComponentSizes, ComponentVariants } from '@/api/core/enums';
import { ChatAutoModeToggle } from '@/components/chat/chat-auto-mode-toggle';
import { Button } from '@/components/ui/button';
import { useFreeTrialState } from '@/hooks/utils';
import { cn } from '@/lib/ui/cn';

type ChatInputHeaderProps = {
  autoMode: boolean;
  onAutoModeChange: (enabled: boolean) => void;
  isAnalyzing?: boolean;
  disabled?: boolean;
};

export const ChatInputHeader = memo(({
  autoMode,
  onAutoModeChange,
  isAnalyzing = false,
  disabled = false,
}: ChatInputHeaderProps) => {
  const t = useTranslations();
  const { isFreeUser, isWarningState } = useFreeTrialState();

  const showAlert = isFreeUser;

  const getMessage = () => {
    if (isWarningState) {
      return t('usage.freeTrial.usedDescription');
    }
    return t('usage.freeTrial.availableDescription');
  };

  return (
    <div
      className={cn(
        'flex items-center',
        'rounded-t-2xl',
        'border border-b-0',
        'bg-card',
        'overflow-hidden',
        // Match toolbar horizontal padding
        'px-2 sm:px-3 py-1.5 sm:py-2',
        showAlert && (isWarningState ? 'border-amber-500/30' : 'border-green-500/30'),
      )}
    >
      {/* Toggle Section */}
      <ChatAutoModeToggle
        autoMode={autoMode}
        onAutoModeChange={onAutoModeChange}
        isAnalyzing={isAnalyzing}
        disabled={disabled}
      />

      {/* Alert Section - seamlessly blended with toggle */}
      {showAlert && (
        <div
          className={cn(
            'flex items-center justify-between gap-2 sm:gap-3 flex-1 min-w-0',
            'ml-1 sm:ml-2',
          )}
        >
          <p
            className={cn(
              'text-[10px] sm:text-[11px] leading-tight font-medium text-left flex-1 min-w-0 truncate',
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
              'h-6 px-2.5 sm:px-3 text-[10px] font-semibold shrink-0 rounded-full',
              isWarningState
                ? 'border-amber-500/40 bg-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-500/30'
                : 'border-green-500/40 bg-green-500/20 text-green-600 dark:text-green-400 hover:bg-green-500/30',
            )}
          >
            <Link href="/chat/pricing">
              {t('usage.freeTrial.upgradeToPro')}
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
});

ChatInputHeader.displayName = 'ChatInputHeader';
