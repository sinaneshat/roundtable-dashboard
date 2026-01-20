import type { UIBillingInterval } from '@roundtable/shared';
import { motion } from 'motion/react';

import { Icons } from '@/components/icons';
import { useIsMounted } from '@/hooks/utils';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/ui/cn';

import { GlowingEffect } from './glowing-effect';
import { HoverBorderGradient } from './hover-border-gradient';

type PriceConfig = {
  amount: number;
  currency: string;
  interval?: UIBillingInterval | null;
  trialDays?: number | null;
};

type PricingCardProps = {
  name: string;
  description?: string | null;
  price: PriceConfig;
  features?: string[] | null;
  isCurrentPlan?: boolean;
  isMostPopular?: boolean;
  isProcessingSubscribe?: boolean;
  isProcessingCancel?: boolean;
  isProcessingManageBilling?: boolean;
  onSubscribe?: () => void;
  onCancel?: () => void;
  onManageBilling?: () => void;
  className?: string;
  delay?: number;
  hasOtherSubscription?: boolean;
  disabled?: boolean;
};

const VALUE_PROPS = [
  { icon: 'sparkles', key: 'allModels' },
  { icon: 'layers', key: 'presets' },
  { icon: 'infinity', key: 'unlimited' },
  { icon: 'messagesSquare', key: 'councilSummary' },
] as const;

export function PricingCard({
  name,
  description: _description,
  price,
  isCurrentPlan = false,
  isMostPopular = false,
  isProcessingSubscribe = false,
  isProcessingCancel = false,
  isProcessingManageBilling = false,
  onSubscribe,
  onCancel,
  onManageBilling,
  className,
  delay = 0,
  hasOtherSubscription = false,
  disabled = false,
}: PricingCardProps) {
  const t = useTranslations();
  const isMounted = useIsMounted();

  // SSR-safe: disable animations on server to prevent invisible content
  const isServer = !isMounted;

  const handleAction = () => {
    if (isCurrentPlan && onCancel) {
      onCancel();
    } else if (onSubscribe) {
      onSubscribe();
    }
  };

  const getButtonText = () => {
    if (isCurrentPlan) {
      return t('pricing.card.cancelSubscription');
    }
    if (hasOtherSubscription) {
      return t('pricing.card.switchPlan');
    }
    return t('pricing.card.getStarted');
  };

  const isActionButtonLoading = isCurrentPlan ? isProcessingCancel : isProcessingSubscribe;

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'sparkles':
        return <Icons.sparkles className="size-5" />;
      case 'layers':
        return <Icons.layers className="size-5" />;
      case 'infinity':
        return <Icons.infinity className="size-5" />;
      case 'messagesSquare':
        return <Icons.messagesSquare className="size-5" />;
      default:
        return <Icons.check className="size-5" />;
    }
  };

  return (
    <motion.div
      initial={isServer ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.5,
        delay,
        ease: [0.16, 1, 0.3, 1],
      }}
      className={cn('relative h-full', className)}
    >
      {isCurrentPlan && (
        <motion.div
          initial={isServer ? false : { opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: delay + 0.2, duration: 0.3 }}
          className="absolute -top-3 left-1/2 z-20 -translate-x-1/2"
        >
          <div className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground shadow-lg">
            <Icons.check className="size-3" />
            {t('pricing.card.currentPlan')}
          </div>
        </motion.div>
      )}

      <div className="relative h-full rounded-2xl border-2 border-white/20 dark:border-white/10 p-2 md:rounded-3xl md:p-3 shadow-lg">
        <GlowingEffect
          blur={0}
          borderWidth={2}
          spread={80}
          glow={isMostPopular && !isCurrentPlan}
          disabled={false}
          proximity={64}
          inactiveZone={0.01}
        />

        <div className="relative flex h-full flex-col overflow-hidden rounded-xl border border-white/20 dark:border-white/10 bg-background/50 backdrop-blur-sm p-6 dark:shadow-[0px_0px_27px_0px_#2D2D2D]">
          <div className="relative flex flex-1 flex-col gap-6">
            <motion.div
              initial={isServer ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: delay + 0.1, duration: 0.4 }}
              className="text-center"
            >
              <h2 className="text-lg font-medium tracking-tight text-muted-foreground">
                {name}
              </h2>
            </motion.div>

            <motion.div
              initial={isServer ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: delay + 0.15, duration: 0.4 }}
              className="text-center"
            >
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-5xl font-bold tracking-tight">
                  {new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: price.currency,
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  }).format(price.amount / 100)}
                </span>
                {price.interval && (
                  <span className="text-base text-muted-foreground">
                    /
                    {price.interval}
                  </span>
                )}
              </div>
            </motion.div>

            <motion.div
              initial={isServer ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: delay + 0.25, duration: 0.4 }}
              className="w-full h-px bg-gradient-to-r from-transparent via-border to-transparent"
            />

            <motion.ul
              initial={isServer ? false : 'hidden'}
              animate="show"
              variants={{
                hidden: { opacity: 0 },
                show: {
                  opacity: 1,
                  transition: {
                    staggerChildren: 0.08,
                    delayChildren: delay + 0.3,
                  },
                },
              }}
              className="flex-1 space-y-4"
            >
              {VALUE_PROPS.map(prop => (
                <motion.li
                  key={prop.key}
                  variants={isServer ? undefined : {
                    hidden: { opacity: 0, x: -10 },
                    show: { opacity: 1, x: 0 },
                  }}
                  transition={{
                    type: 'spring',
                    stiffness: 500,
                    damping: 40,
                  }}
                  className="flex items-center gap-3"
                >
                  <div className="rounded-lg bg-primary/10 p-2 text-primary">
                    {getIcon(prop.icon)}
                  </div>
                  <div className="flex-1">
                    <span className="text-sm font-medium">
                      {t(`pricing.card.valueProps.${prop.key}.title`)}
                    </span>
                    <p className="text-xs text-muted-foreground">
                      {t(`pricing.card.valueProps.${prop.key}.description`)}
                    </p>
                  </div>
                </motion.li>
              ))}
            </motion.ul>

            <motion.div
              initial={isServer ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: delay + 0.5, duration: 0.4 }}
              className="space-y-3 pt-2"
            >
              {isCurrentPlan && onManageBilling && (
                <HoverBorderGradient
                  as="button"
                  containerClassName={cn(
                    'w-full rounded-full',
                    isProcessingManageBilling && 'cursor-not-allowed opacity-50',
                  )}
                  className="w-full text-center text-sm font-medium transition-all duration-200 bg-background text-foreground"
                  onClick={onManageBilling}
                  disabled={isProcessingManageBilling}
                >
                  {isProcessingManageBilling
                    ? (
                        <span className="flex items-center justify-center gap-2">
                          <Icons.loader className="h-4 w-4 animate-spin" />
                          {t('pricing.card.processing')}
                        </span>
                      )
                    : (
                        t('pricing.card.manageBilling')
                      )}
                </HoverBorderGradient>
              )}

              <HoverBorderGradient
                as="button"
                containerClassName={cn(
                  'w-full rounded-full',
                  (isActionButtonLoading || disabled) && 'cursor-not-allowed opacity-50',
                )}
                className={cn(
                  'w-full text-center text-sm font-medium transition-all duration-200',
                  !isCurrentPlan && 'bg-primary text-primary-foreground',
                  isCurrentPlan && 'bg-destructive/10 text-destructive hover:bg-destructive/20',
                )}
                onClick={handleAction}
                disabled={isActionButtonLoading || disabled}
              >
                {isActionButtonLoading
                  ? (
                      <span className="flex items-center justify-center gap-2">
                        <Icons.loader className="h-4 w-4 animate-spin" />
                        {t('pricing.card.processing')}
                      </span>
                    )
                  : (
                      getButtonText()
                    )}
              </HoverBorderGradient>
            </motion.div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
