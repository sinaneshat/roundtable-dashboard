'use client';

import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/ui/cn';

type LLMAnswerDisplayProps = {
  answer: string | null;
  isStreaming?: boolean;
  className?: string;
};

export function LLMAnswerDisplay({ answer, isStreaming = false, className }: LLMAnswerDisplayProps) {
  const t = useTranslations('chat.tools.webSearch');

  // Show skeleton before first chunk arrives
  if (!answer && isStreaming) {
    return (
      <div className={cn('space-y-3', className)}>
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary/80 animate-pulse" />
          <span className="text-xs font-semibold text-foreground">
            {t('llmAnswer.title')}
          </span>
        </div>
        <div className="space-y-2 pl-6">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/6" />
        </div>
        <Separator className="!mt-4" />
      </div>
    );
  }

  if (!answer) {
    return null;
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-primary/80 flex-shrink-0" />
        <span className="text-xs font-semibold text-foreground">
          {t('llmAnswer.title')}
        </span>
        {isStreaming && (
          <motion.span
            className="text-xs text-muted-foreground/60"
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            {t('llmAnswer.generating')}
          </motion.span>
        )}
      </div>
      <div className="pl-6 pr-2">
        <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap border-l-2 border-primary/30 pl-3 py-1">
          {answer}
          {isStreaming && (
            <motion.span
              className="inline-block w-1.5 h-4 ml-0.5 bg-primary/70"
              animate={{ opacity: [0, 1, 0] }}
              transition={{ duration: 0.8, repeat: Infinity }}
            />
          )}
        </p>
      </div>
      <Separator className="!mt-4" />
    </div>
  );
}
