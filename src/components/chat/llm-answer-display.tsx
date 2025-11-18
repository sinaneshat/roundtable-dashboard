'use client';

import { ExternalLink, Sparkles } from 'lucide-react';

import { AnimatedBadge } from '@/components/ui/animated-card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { FadeInText, TypingText } from '@/components/ui/typing-text';
import { cn } from '@/lib/ui/cn';

type LLMAnswerDisplayProps = {
  answer: string | null;
  isStreaming?: boolean;
  className?: string;
  sources?: Array<{ url: string; title: string }>;
};

export function LLMAnswerDisplay({ answer, isStreaming = false, className, sources }: LLMAnswerDisplayProps) {
  // Show skeleton before first chunk arrives
  if (!answer && isStreaming) {
    return (
      <div className={cn('space-y-2 llm-answer-skeleton', className)}>
        <div className="flex items-center gap-2 mb-3">
          <AnimatedBadge delay={0.05}>
            <Badge variant="secondary" className="text-xs">
              <Sparkles className="size-3 mr-1 animate-pulse" />
              AI synthesizing answer...
            </Badge>
          </AnimatedBadge>
        </div>
        <Skeleton className="h-4 w-full skeleton-line" />
        <Skeleton className="h-4 w-5/6 skeleton-line" />
        <Skeleton className="h-4 w-4/6 skeleton-line" />
        <Separator className="!mt-3" />
      </div>
    );
  }

  if (!answer) {
    return null;
  }

  return (
    <div className={cn('space-y-2', className)}>
      {/* Simplified header */}
      <FadeInText delay={0.05}>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Sparkles className="size-3" />
          <span>AI Summary</span>
          {isStreaming && <span className="animate-pulse">•••</span>}
        </div>
      </FadeInText>

      {/* Markdown content with typing effect */}
      <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
        <TypingText text={answer} speed={5} delay={100} enabled={isStreaming} />
      </div>

      {/* Compact source list - no border */}
      {sources && sources.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {sources.map((source, idx) => (
            <a
              key={source.url}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              <span className="truncate max-w-[150px]">
                [
                {idx + 1}
                ]
              </span>
              <ExternalLink className="size-2.5" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
