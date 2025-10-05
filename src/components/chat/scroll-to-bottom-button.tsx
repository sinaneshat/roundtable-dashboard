'use client';

import { ArrowDown } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/ui/cn';

type ScrollToBottomButtonProps = {
  /**
   * Whether to show the button
   */
  show?: boolean;
  /**
   * Click handler to scroll to bottom
   */
  onClick?: () => void;
  /**
   * Custom className
   */
  className?: string;
};

/**
 * Scroll-to-Bottom Button
 *
 * ChatGPT-style floating button that appears when user scrolls up.
 * Smoothly animates in/out with Framer Motion.
 *
 * Features:
 * - Appears above the input area when user scrolls up
 * - Smooth fade + slide animation
 * - Centered horizontally
 * - Glass morphism effect for modern look
 * - Accessible with keyboard navigation
 */
export function ScrollToBottomButton({
  show = false,
  onClick,
  className,
}: ScrollToBottomButtonProps) {
  const t = useTranslations();

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.9 }}
          transition={{
            duration: 0.2,
            ease: [0.4, 0, 0.2, 1],
          }}
          className={className}
        >
          <Button
            onClick={onClick}
            size="icon"
            variant="secondary"
            className={cn(
              'size-9 sm:size-10 rounded-full shadow-lg',
              'bg-background/95 backdrop-blur-sm',
              'border border-border/50',
              'hover:bg-accent hover:scale-105 active:scale-95',
              'transition-all duration-200',
              'group',
            )}
            aria-label={t('chat.scrollToBottom')}
            title={t('chat.scrollToBottom')}
          >
            <ArrowDown className="size-3.5 sm:size-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
