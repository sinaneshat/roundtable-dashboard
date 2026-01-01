'use client';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { Icons } from '@/components/icons';
import { cn } from '@/lib/ui/cn';

type VoiceVisualizationProps = {
  /** Whether voice recording is active */
  isActive: boolean;
  /** Audio levels array (0-100) for each bar */
  audioLevels?: number[];
  /** Number of visualization bars */
  barCount?: number;
};

const EMPTY_AUDIO_LEVELS: number[] = [];

const DEFAULT_BAR_HEIGHTS = Array.from({ length: 40 }, (_, i) => {
  return 30 + ((i * 17) % 50);
});

export function VoiceVisualization({
  isActive,
  audioLevels = EMPTY_AUDIO_LEVELS,
  barCount = 40,
}: VoiceVisualizationProps) {
  const t = useTranslations('chat.input');
  const bars = useMemo(() => {
    if (audioLevels.length > 0) {
      return audioLevels.slice(0, barCount);
    }
    return DEFAULT_BAR_HEIGHTS.slice(0, barCount);
  }, [audioLevels, barCount]);

  if (!isActive) {
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
            'flex items-center gap-3 px-3 py-3',
            'border-0 border-b border-primary/20 rounded-none rounded-t-2xl',
            'bg-primary/10 backdrop-blur-xl',
          )}
        >
          <div className="flex items-center gap-2 shrink-0">
            <motion.div
              animate={{
                scale: [1, 1.2, 1],
                opacity: [1, 0.8, 1],
              }}
              transition={{
                duration: 1.5,
                repeat: Number.POSITIVE_INFINITY,
                ease: 'easeInOut',
              }}
            >
              <Icons.mic className="size-3.5 text-primary" />
            </motion.div>
            <span className="text-[10px] font-medium text-primary">
              {t('recording')}
            </span>
          </div>

          <div className="flex items-center gap-[2px] flex-1 h-6 min-w-0">
            {bars.map((level, index) => {
              const duration = 0.8 + ((index * 7) % 40) / 100;
              const minHeight = Math.max(20, level);
              const maxHeight = Math.max(20, (level + 30) % 100);

              return (
                <motion.div
                  // eslint-disable-next-line react/no-array-index-key
                  key={`bar-${index}`}
                  className="flex-1 bg-primary/60 rounded-full min-w-[2px]"
                  initial={{ height: '20%' }}
                  animate={{
                    height: [`${minHeight}%`, `${maxHeight}%`, `${minHeight}%`],
                  }}
                  transition={{
                    duration,
                    repeat: Number.POSITIVE_INFINITY,
                    ease: 'easeInOut',
                    delay: index * 0.02,
                  }}
                />
              );
            })}
          </div>

          <span className="text-[10px] text-primary/60 shrink-0 hidden sm:block">
            {t('clickMicToStop')}
          </span>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
