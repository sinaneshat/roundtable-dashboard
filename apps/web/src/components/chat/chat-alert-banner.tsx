import { ComponentSizes, ComponentVariants } from '@roundtable/shared';
import { Link } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { memo } from 'react';

import { Button } from '@/components/ui/button';
import type { ChatAlertVariant } from '@/lib/enums/chat-ui';
import { ChatAlertVariants, DEFAULT_CHAT_ALERT_VARIANT } from '@/lib/enums/chat-ui';
import { cn } from '@/lib/ui/cn';

type ChatAlertBannerProps = {
  message: string;
  variant?: ChatAlertVariant;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  className?: string;
  showAction?: boolean;
  children?: ReactNode;
  /** Inline mode - no rounded corners, bottom border instead of side borders */
  inline?: boolean;
};

const variantStyles: Record<ChatAlertVariant, {
  container: string;
  inlineContainer: string;
  text: string;
  button: string;
}> = {
  [ChatAlertVariants.SUCCESS]: {
    container: 'border-green-500/30',
    inlineContainer: 'border-green-500/20 bg-green-500/10',
    text: 'text-green-600 dark:text-green-400',
    button: 'border-green-500/40 bg-green-500/20 text-green-600 dark:text-green-400 hover:bg-green-500/30',
  },
  [ChatAlertVariants.WARNING]: {
    container: 'border-amber-500/30',
    inlineContainer: 'border-amber-500/20 bg-amber-500/10',
    text: 'text-amber-600 dark:text-amber-400',
    button: 'border-amber-500/40 bg-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-500/30',
  },
  [ChatAlertVariants.ERROR]: {
    container: 'border-destructive/30',
    inlineContainer: 'border-destructive/20 bg-destructive/10',
    text: 'text-destructive',
    button: 'border-destructive/40 bg-destructive/20 text-destructive hover:bg-destructive/30',
  },
};

export const ChatAlertBanner = memo(({
  message,
  variant = DEFAULT_CHAT_ALERT_VARIANT,
  actionLabel,
  actionHref,
  onAction,
  className,
  showAction = true,
  children,
  inline = false,
}: ChatAlertBannerProps) => {
  const styles = variantStyles[variant];
  const hasAction = showAction && (actionLabel && (actionHref || onAction));

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
            'flex items-center justify-between gap-3',
            'px-3 sm:px-4 py-2 sm:py-2.5',
            inline
              ? ['border-0 border-b', styles.inlineContainer]
              : ['rounded-t-2xl border border-b-0 bg-card', styles.container],
            className,
          )}
        >
          <p
            className={cn(
              'text-[11px] sm:text-xs font-medium flex-1 min-w-0 text-left',
              styles.text,
            )}
          >
            {message}
          </p>
          {hasAction && actionHref && (
            <Button
              asChild
              variant={ComponentVariants.OUTLINE}
              size={ComponentSizes.SM}
              className={cn(
                'h-7 px-4 text-[11px] font-semibold shrink-0 rounded-full',
                styles.button,
              )}
            >
              <Link to={actionHref}>
                {actionLabel}
              </Link>
            </Button>
          )}
          {hasAction && !actionHref && onAction && (
            <Button
              variant={ComponentVariants.OUTLINE}
              size={ComponentSizes.SM}
              onClick={onAction}
              className={cn(
                'h-7 px-4 text-[11px] font-semibold shrink-0 rounded-full',
                styles.button,
              )}
            >
              {actionLabel}
            </Button>
          )}
          {children}
        </div>
      </motion.div>
    </AnimatePresence>
  );
});

ChatAlertBanner.displayName = 'ChatAlertBanner';
