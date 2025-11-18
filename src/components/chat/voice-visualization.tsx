/**
 * Voice Visualization Component - Real-time audio waveform display
 *
 * Displays animated waveform bars when voice recording is active:
 * - Real-time audio level visualization
 * - Smooth animations using Framer Motion
 * - Compact design matching QuotaAlertExtension style
 * - Shows recording status with visual feedback
 */
'use client';
import { Mic } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo } from 'react';

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

// Generate static bar heights for default animation
const DEFAULT_BAR_HEIGHTS = Array.from({ length: 40 }, (_, i) => {
  // Use deterministic variation based on index for consistent renders
  return 30 + ((i * 17) % 50); // Deterministic variation between 30-80
});

export function VoiceVisualization({
  isActive,
  audioLevels = EMPTY_AUDIO_LEVELS,
  barCount = 40,
}: VoiceVisualizationProps) {
  // Generate bars based on audio levels or use default animation
  const bars = useMemo(() => {
    if (audioLevels.length > 0) {
      return audioLevels.slice(0, barCount);
    }
    // Default bars when no audio levels provided
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
          {/* Recording indicator */}
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
              <Mic className="size-3.5 text-primary" />
            </motion.div>
            <span className="text-[10px] font-medium text-primary">
              Recording...
            </span>
          </div>

          {/* Audio visualization bars */}
          <div className="flex items-center gap-[2px] flex-1 h-6 min-w-0">
            {bars.map((level, index) => {
              // Deterministic animation timing based on index
              const duration = 0.8 + ((index * 7) % 40) / 100; // 0.8 to 1.2 seconds
              const minHeight = Math.max(20, level);
              const maxHeight = Math.max(20, (level + 30) % 100);

              return (
                <motion.div
                  // Using index as key is appropriate here: bars represent fixed positional
                  // waveform data that doesn't reorder - each bar's identity is its position
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

          {/* Status text */}
          <span className="text-[10px] text-primary/60 shrink-0 hidden sm:block">
            Click mic to stop
          </span>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
