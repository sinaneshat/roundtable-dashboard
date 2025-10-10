'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import type { ParticipantConfig } from '@/lib/schemas/chat-forms';
import { cn } from '@/lib/ui/cn';

export type StreamingParticipantsLoaderProps = {
  /** List of participants in order */
  participants: ParticipantConfig[];
  /** Index of currently responding participant (0-based) */
  currentParticipantIndex: number | null;
  /** Optional className */
  className?: string;
};

/**
 * Simplified streaming loader that shows:
 * - Funny thinking messages that cycle
 * - Smooth animations with framer-motion
 *
 * Note: Removed participant avatars to keep only the fun text animation
 */
export function StreamingParticipantsLoader({
  participants: _participants,
  currentParticipantIndex: _currentParticipantIndex,
  className,
}: StreamingParticipantsLoaderProps) {
  const t = useTranslations('chat.streaming');

  // Get thinking messages from translations
  const thinkingMessages = t.raw('thinkingMessages') as string[];

  const [thinkingMessage, setThinkingMessage] = useState(thinkingMessages[0]);

  // Cycle through thinking messages every 2.5 seconds
  useEffect(() => {
    let index = 0;
    const interval = setInterval(() => {
      index = (index + 1) % thinkingMessages.length;
      setThinkingMessage(thinkingMessages[index]);
    }, 2500);

    return () => clearInterval(interval);
  }, [thinkingMessages]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn('flex items-center gap-3 ml-12 my-4 text-sm text-muted-foreground', className)}
    >
      {/* Animated dots */}
      <div className="flex gap-1">
        {[0, 1, 2].map(i => (
          <motion.div
            key={i}
            className="size-1.5 bg-muted-foreground/40 rounded-full"
            animate={{
              scale: [1, 1.3, 1],
              opacity: [0.4, 1, 0.4],
            }}
            transition={{
              repeat: Infinity,
              duration: 1.2,
              delay: i * 0.2,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>

      {/* Cycling funny message */}
      <AnimatePresence mode="wait">
        <motion.span
          key={thinkingMessage}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          transition={{ duration: 0.3 }}
          className="font-medium"
        >
          {thinkingMessage}
        </motion.span>
      </AnimatePresence>
    </motion.div>
  );
}
