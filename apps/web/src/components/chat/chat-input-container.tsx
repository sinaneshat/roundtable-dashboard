import type { BorderVariant, CreditStatus } from '@roundtable/shared';
import { BorderVariants, ComponentSizes, ComponentVariants, CreditStatuses, PlanTypes } from '@roundtable/shared';
import { Link } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { memo, useMemo } from 'react';

import { Button } from '@/components/ui/button';
import { STRING_LIMITS } from '@/constants';
import { useUsageStatsQuery } from '@/hooks/queries';
import { useFreeTrialState, useIsMobile } from '@/hooks/utils';
import { MAX_PARTICIPANTS_LIMIT, MIN_PARTICIPANTS_REQUIRED } from '@/lib/config';
import { useTranslations } from '@/lib/i18n';
import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';
import { cn } from '@/lib/ui/cn';
import { validateUsageStatsCache } from '@/stores/chat/actions/types';

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
  autoMode?: boolean;
};

const variantStyles: Record<BorderVariant, {
  border: string;
  alertBg: string;
  text: string;
  button: string;
}> = {
  [BorderVariants.DEFAULT]: {
    alertBg: 'bg-muted',
    border: 'border-border',
    button: 'border-border/40 bg-muted/20 text-foreground hover:bg-muted/30',
    text: 'text-foreground',
  },
  [BorderVariants.ERROR]: {
    alertBg: 'bg-destructive/10',
    border: 'border-destructive/30',
    button: 'border-destructive/40 bg-destructive/20 text-destructive hover:bg-destructive/30',
    text: 'text-destructive',
  },
  [BorderVariants.SUCCESS]: {
    alertBg: 'bg-green-500/10',
    border: 'border-green-500/30',
    button: 'border-green-500/40 bg-green-500/20 text-green-600 dark:text-green-400 hover:bg-green-500/30',
    text: 'text-green-600 dark:text-green-400',
  },
  [BorderVariants.WARNING]: {
    alertBg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    button: 'border-amber-500/40 bg-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-500/30',
    text: 'text-amber-600 dark:text-amber-400',
  },
};

export const ChatInputContainer = memo(({
  autoMode = false,
  children,
  className,
  inputValue = '',
  isHydrating = false,
  isModelsLoading = false,
  participants = [],
}: ChatInputContainerProps) => {
  const t = useTranslations();
  const isMobile = useIsMobile();
  const { data: statsData, isLoading: isLoadingStats } = useUsageStatsQuery();
  const { hasUsedTrial, isFreeUser, isWarningState } = useFreeTrialState();

  const isOverLimit = inputValue.length > STRING_LIMITS.MESSAGE_MAX;
  const participantCount = participants.length;
  const showMinModelsError = !autoMode && participantCount < MIN_PARTICIPANTS_REQUIRED && !isHydrating && !isModelsLoading;
  const showMaxModelsError = participantCount > MAX_PARTICIPANTS_LIMIT && !isHydrating && !isModelsLoading;

  const creditStatus = useMemo((): { status: CreditStatus; estimated: number; available: number; remaining: number } => {
    const validated = validateUsageStatsCache(statsData);
    if (!validated) {
      return { available: 0, estimated: 0, remaining: 0, status: CreditStatuses.OK };
    }

    const { credits, plan } = validated;

    if (plan.type !== PlanTypes.PAID) {
      return { available: credits.available, estimated: 0, remaining: 0, status: CreditStatuses.OK };
    }

    const count = participantCount || 1;
    const estimated = count * 250;
    const remaining = credits.available - estimated;

    if (credits.available < estimated) {
      return { available: credits.available, estimated, remaining, status: CreditStatuses.INSUFFICIENT };
    }
    if (remaining < 500 && remaining >= 0) {
      return { available: credits.available, estimated, remaining, status: CreditStatuses.LOW };
    }
    return { available: credits.available, estimated, remaining, status: CreditStatuses.OK };
  }, [statsData, participantCount]);

  const isQuotaExceeded = useMemo(() => {
    const validated = validateUsageStatsCache(statsData);
    if (!validated || validated.plan.type !== PlanTypes.PAID) {
      return false;
    }
    return validated.credits.available < creditStatus.estimated || validated.credits.available <= 0;
  }, [statsData, creditStatus.estimated]);

  const alert: AlertConfig | null = useMemo(() => {
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
    if (!isFreeUser && creditStatus.status === CreditStatuses.INSUFFICIENT && participantCount > 0) {
      return {
        message: t('chat.input.insufficientCredits'),
        variant: BorderVariants.ERROR,
      };
    }
    if (!isFreeUser && creditStatus.status === CreditStatuses.LOW && participantCount > 0) {
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
        actionHref: '/chat/pricing',
        actionLabel: isMobile
          ? t('usage.freeTrial.upgradeToProShort')
          : t('usage.freeTrial.upgradeToPro'),
        message: hasUsedTrial
          ? t('usage.freeTrial.usedDescription')
          : t('usage.freeTrial.availableDescription'),
        variant: isWarningState ? BorderVariants.WARNING : BorderVariants.SUCCESS,
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
    isMobile,
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
        styles?.border ?? 'border-border',
        className,
      )}
    >
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

      {children}
    </div>
  );
});

ChatInputContainer.displayName = 'ChatInputContainer';
