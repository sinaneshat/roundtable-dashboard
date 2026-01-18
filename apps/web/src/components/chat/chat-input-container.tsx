import type { BorderVariant } from '@roundtable/shared';
import { BorderVariants, ComponentSizes, ComponentVariants, PlanTypes } from '@roundtable/shared';
import { Link } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { memo, useMemo } from 'react';

import { Button } from '@/components/ui/button';
import { STRING_LIMITS } from '@/constants';
import { useUsageStatsQuery } from '@/hooks/queries';
import { useFreeTrialState } from '@/hooks/utils';
import { MAX_PARTICIPANTS_LIMIT, MIN_PARTICIPANTS_REQUIRED } from '@/lib/config';
import { useTranslations } from '@/lib/i18n';
import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';
import { cn } from '@/lib/ui/cn';

type AlertConfig = {
  message: string;
  variant: BorderVariant;
  actionLabel?: string;
  actionHref?: string;
};

type ChatInputContainerProps = {
  participants?: ParticipantConfig[];
  inputValue?: string;
  isHydrating?: boolean;
  isModelsLoading?: boolean;
  children: ReactNode;
  className?: string;
};

const variantStyles: Record<BorderVariant, {
  border: string;
  alertBg: string;
  text: string;
  button: string;
}> = {
  [BorderVariants.DEFAULT]: {
    border: 'border-border',
    alertBg: 'bg-muted',
    text: 'text-foreground',
    button: 'border-border/40 bg-muted/20 text-foreground hover:bg-muted/30',
  },
  [BorderVariants.SUCCESS]: {
    border: 'border-green-500/30',
    alertBg: 'bg-green-500/10',
    text: 'text-green-600 dark:text-green-400',
    button: 'border-green-500/40 bg-green-500/20 text-green-600 dark:text-green-400 hover:bg-green-500/30',
  },
  [BorderVariants.WARNING]: {
    border: 'border-amber-500/30',
    alertBg: 'bg-amber-500/10',
    text: 'text-amber-600 dark:text-amber-400',
    button: 'border-amber-500/40 bg-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-500/30',
  },
  [BorderVariants.ERROR]: {
    border: 'border-destructive/30',
    alertBg: 'bg-destructive/10',
    text: 'text-destructive',
    button: 'border-destructive/40 bg-destructive/20 text-destructive hover:bg-destructive/30',
  },
};

/**
 * ChatInputContainer - Unified container wrapping alert + header + input
 *
 * Provides a single border around the entire chat input area.
 * When alerts are shown, they appear at the top with the border wrapping everything.
 */
export const ChatInputContainer = memo(({
  participants = [],
  inputValue = '',
  isHydrating = false,
  isModelsLoading = false,
  children,
  className,
}: ChatInputContainerProps) => {
  const t = useTranslations();
  const { data: statsData, isLoading: isLoadingStats } = useUsageStatsQuery();
  const { isFreeUser, hasUsedTrial, isWarningState } = useFreeTrialState();

  const isOverLimit = inputValue.length > STRING_LIMITS.MESSAGE_MAX;
  const participantCount = participants.length;
  const showMinModelsError = participantCount < MIN_PARTICIPANTS_REQUIRED && !isHydrating && !isModelsLoading;
  const showMaxModelsError = participantCount > MAX_PARTICIPANTS_LIMIT && !isHydrating && !isModelsLoading;

  // Credit estimation for paid users
  const creditStatus = useMemo(() => {
    if (!statsData?.success || !statsData.data || typeof statsData.data !== 'object') {
      return { status: 'ok' as const, estimated: 0, available: 0, remaining: 0 };
    }

    const data = statsData.data as { credits?: { available: number }; plan?: { type: string } };
    const credits = data.credits;
    const plan = data.plan;

    if (!credits || plan?.type !== PlanTypes.PAID) {
      return { status: 'ok' as const, estimated: 0, available: credits?.available ?? 0, remaining: 0 };
    }

    const count = participantCount || 1;
    const estimated = count * 250;
    const remaining = credits.available - estimated;

    if (credits.available < estimated) {
      return { status: 'insufficient' as const, estimated, available: credits.available, remaining };
    }
    if (remaining < 500 && remaining >= 0) {
      return { status: 'low' as const, estimated, available: credits.available, remaining };
    }
    return { status: 'ok' as const, estimated, available: credits.available, remaining };
  }, [statsData, participantCount]);

  const isQuotaExceeded = useMemo(() => {
    if (!statsData?.success || !statsData.data || typeof statsData.data !== 'object')
      return false;
    const data = statsData.data as { credits?: { available: number }; plan?: { type: string } };
    const credits = data.credits;
    const plan = data.plan;
    if (!credits || plan?.type !== PlanTypes.PAID)
      return false;
    return credits.available < creditStatus.estimated || credits.available <= 0;
  }, [statsData, creditStatus.estimated]);

  // Determine which alert to show (priority order)
  const alert: AlertConfig | null = useMemo(() => {
    // Model count validation (highest priority)
    if (showMinModelsError) {
      return {
        message: t('chat.input.minModelsRequired', { min: MIN_PARTICIPANTS_REQUIRED }),
        variant: BorderVariants.ERROR,
      };
    }
    if (showMaxModelsError) {
      return {
        message: t('chat.input.maxModelsExceeded', { max: MAX_PARTICIPANTS_LIMIT }),
        variant: BorderVariants.ERROR,
      };
    }
    if (isOverLimit) {
      return { message: t('chat.input.messageTooLong'), variant: BorderVariants.ERROR };
    }
    if (!isFreeUser && creditStatus.status === 'insufficient' && participantCount > 0) {
      return {
        message: t('chat.input.insufficientCredits'),
        variant: BorderVariants.ERROR,
      };
    }
    if (!isFreeUser && creditStatus.status === 'low' && participantCount > 0) {
      return {
        message: t('chat.input.lowCredits'),
        variant: BorderVariants.WARNING,
      };
    }
    if (!isFreeUser && isQuotaExceeded && !isLoadingStats) {
      return { message: t('usage.quotaAlert.paidUserMessage'), variant: BorderVariants.ERROR };
    }
    if (isFreeUser && !isLoadingStats) {
      return {
        message: hasUsedTrial
          ? t('usage.freeTrial.usedDescription')
          : t('usage.freeTrial.availableDescription'),
        variant: isWarningState ? BorderVariants.WARNING : BorderVariants.SUCCESS,
        actionLabel: t('usage.freeTrial.upgradeToPro'),
        actionHref: '/chat/pricing',
      };
    }
    return null;
  }, [
    showMinModelsError,
    showMaxModelsError,
    isOverLimit,
    isFreeUser,
    creditStatus,
    participantCount,
    isQuotaExceeded,
    isLoadingStats,
    hasUsedTrial,
    isWarningState,
    t,
  ]);

  const styles = alert ? variantStyles[alert.variant] : null;

  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden',
        'rounded-2xl border shadow-lg',
        'bg-card',
        'transition-all duration-200',
        styles?.border,
        className,
      )}
    >
      {/* Alert banner - inside the container, no separate border */}
      <AnimatePresence>
        {alert && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div
              className={cn(
                'flex items-center justify-between gap-3',
                'px-3 sm:px-4 py-2 sm:py-2.5',
                'border-b',
                styles?.alertBg,
                styles?.border,
              )}
            >
              <p className={cn('text-[11px] sm:text-xs font-medium flex-1 min-w-0 text-left', styles?.text)}>
                {alert.message}
              </p>
              {alert.actionLabel && alert.actionHref && (
                <Button
                  asChild
                  variant={ComponentVariants.OUTLINE}
                  size={ComponentSizes.SM}
                  className={cn('h-7 px-4 text-[11px] font-semibold shrink-0 rounded-full', styles?.button)}
                >
                  <Link to={alert.actionHref}>{alert.actionLabel}</Link>
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Children (header + input) - no borders, they're inside the container */}
      {children}
    </div>
  );
});

ChatInputContainer.displayName = 'ChatInputContainer';
