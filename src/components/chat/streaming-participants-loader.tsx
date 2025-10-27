'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

import type { ParticipantConfig } from '@/components/chat/chat-form-schemas';
import { cn } from '@/lib/ui/cn';

export type StreamingParticipantsLoaderProps = {
  participants: ParticipantConfig[];
  currentParticipantIndex: number | null;
  isAnalyzing?: boolean;
  className?: string;
};
export function StreamingParticipantsLoader({
  participants: _participants,
  currentParticipantIndex: _currentParticipantIndex,
  isAnalyzing = false,
  className,
}: StreamingParticipantsLoaderProps) {
  const t = useTranslations('chat.streaming');
  const thinkingMessages = useMemo(
    () =>
      isAnalyzing
        ? (t.raw('analyzingMessages') as string[] || ['Analyzing responses...', 'Preparing analysis...'])
        : (t.raw('thinkingMessages') as string[]),
    [isAnalyzing, t],
  );
  const [thinkingMessage, setThinkingMessage] = useState(thinkingMessages[0]);
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
