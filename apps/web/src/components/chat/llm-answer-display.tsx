import Markdown from 'react-markdown';

import { Icons } from '@/components/icons';
import { LazyStreamdown } from '@/components/markdown/lazy-streamdown';
import { streamdownComponents } from '@/components/markdown/unified-markdown-components';
import { StreamingCursor } from '@/components/ui/streaming-text';
import { FadeInText } from '@/components/ui/typing-text';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/ui/cn';

type LLMAnswerDisplayProps = {
  answer: string | null;
  isStreaming?: boolean;
  className?: string;
  sources?: Array<{ url: string; title: string }>;
};

export function LLMAnswerDisplay({ answer, isStreaming = false, className, sources }: LLMAnswerDisplayProps) {
  const t = useTranslations('chat');

  if (!answer) {
    return null;
  }

  return (
    <div className={cn('space-y-3 mt-3', className)}>
      <FadeInText delay={0.05}>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
          <span>{t('aiSummary')}</span>
        </div>
      </FadeInText>

      <div dir="auto" className="min-w-0">
        {isStreaming
          ? (
              <div className="min-w-0">
                <LazyStreamdown
                  className="min-w-0 text-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                  components={streamdownComponents}
                >
                  {answer}
                </LazyStreamdown>
                <StreamingCursor />
              </div>
            )
          : (
              // Non-streaming: Direct import renders synchronously - no hydration flash
              <div className="min-w-0 text-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                <Markdown components={streamdownComponents}>{answer}</Markdown>
              </div>
            )}
      </div>

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
              <Icons.externalLink className="size-2.5" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
