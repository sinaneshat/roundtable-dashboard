'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

import type { ParticipantConfig } from '@/components/chat/chat-form-schemas';
import { LoaderFive } from '@/components/ui/loader';
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
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex(prev => (prev + 1) % thinkingMessages.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [thinkingMessages.length]);

  const currentMessage = thinkingMessages[messageIndex] || 'Thinking...';

  return (
    <div className={cn('ml-12 my-4', className)}>
      <AnimatePresence mode="wait">
        <motion.div
          key={messageIndex}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="text-sm text-muted-foreground"
        >
          <LoaderFive text={currentMessage} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
