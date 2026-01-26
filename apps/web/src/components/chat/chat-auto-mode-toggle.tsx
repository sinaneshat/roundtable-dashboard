import { motion } from 'motion/react';
import { memo, useCallback } from 'react';

import { Icons } from '@/components/icons';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/ui/cn';

type ChatAutoModeToggleProps = {
  autoMode: boolean;
  onAutoModeChange: (enabled: boolean) => void;
  isAnalyzing?: boolean;
  disabled?: boolean;
};

export const ChatAutoModeToggle = memo(({
  autoMode,
  disabled = false,
  isAnalyzing = false,
  onAutoModeChange,
}: ChatAutoModeToggleProps) => {
  const t = useTranslations();

  const handleAutoClick = useCallback(() => {
    if (!disabled && !isAnalyzing) {
      onAutoModeChange(true);
    }
  }, [disabled, isAnalyzing, onAutoModeChange]);

  const handleManualClick = useCallback(() => {
    if (!disabled && !isAnalyzing) {
      onAutoModeChange(false);
    }
  }, [disabled, isAnalyzing, onAutoModeChange]);

  return (
    <div
      className={cn(
        'inline-flex items-center shrink-0',
        'px-1 py-1',
        'transition-all duration-300 ease-out',
        disabled && 'opacity-50 pointer-events-none',
      )}
      role="radiogroup"
      aria-label={t('chat.autoMode.label')}
    >
      {/* Auto Button */}
      <motion.button
        type="button"
        role="radio"
        aria-checked={autoMode}
        onClick={handleAutoClick}
        disabled={disabled || isAnalyzing}
        className={cn(
          'relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg',
          'text-xs font-medium',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1',
          'transition-colors duration-200',
          autoMode
            ? 'text-foreground'
            : 'text-muted-foreground/70 hover:text-muted-foreground',
        )}
        animate={{
          scale: autoMode ? 1 : 0.98,
        }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        {/* Background pill for active state */}
        {autoMode && (
          <motion.div
            layoutId="auto-mode-pill"
            className={cn(
              'absolute inset-0 rounded-lg',
              'bg-gradient-to-r from-violet-500/20 via-purple-500/20 to-fuchsia-500/20',
              'border border-purple-500/30',
            )}
            initial={false}
            transition={{ damping: 30, stiffness: 400, type: 'spring' }}
          />
        )}
        <motion.div
          className="relative z-10 flex items-center gap-1.5"
          animate={{
            color: autoMode ? 'rgb(168, 85, 247)' : undefined,
          }}
        >
          <motion.div
            animate={{
              rotate: isAnalyzing ? 360 : 0,
              scale: autoMode ? [1, 1.1, 1] : 1,
            }}
            transition={{
              rotate: {
                duration: 1,
                ease: 'linear',
                repeat: isAnalyzing ? Infinity : 0,
              },
              scale: {
                duration: 0.4,
                ease: 'easeOut',
              },
            }}
          >
            <Icons.sparkles
              className={cn(
                'size-3.5 transition-colors duration-300',
                autoMode ? 'text-purple-400' : 'text-muted-foreground/50',
              )}
            />
          </motion.div>
          <span>{isAnalyzing ? t('chat.autoMode.analyzing') : t('chat.autoMode.label')}</span>
        </motion.div>
      </motion.button>

      {/* Manual Button */}
      <motion.button
        type="button"
        role="radio"
        aria-checked={!autoMode}
        onClick={handleManualClick}
        disabled={disabled || isAnalyzing}
        className={cn(
          'relative flex items-center px-3 py-1.5 rounded-lg',
          'text-xs font-medium',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
          'transition-colors duration-200',
          !autoMode
            ? 'text-foreground'
            : 'text-muted-foreground/70 hover:text-muted-foreground',
        )}
        animate={{
          scale: !autoMode ? 1 : 0.98,
        }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        {/* Background pill for active state */}
        {!autoMode && (
          <motion.div
            layoutId="auto-mode-pill"
            className="absolute inset-0 rounded-lg bg-muted/50 border border-border/50"
            initial={false}
            transition={{ damping: 30, stiffness: 400, type: 'spring' }}
          />
        )}
        <span className="relative z-10">{t('chat.autoMode.manualLabel')}</span>
      </motion.button>
    </div>
  );
});

ChatAutoModeToggle.displayName = 'ChatAutoModeToggle';
