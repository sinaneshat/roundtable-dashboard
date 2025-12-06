'use client';

import { ExternalLink } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Streamdown } from 'streamdown';

import { streamdownComponents } from '@/components/markdown/streamdown-components';
import { defaultMarkdownComponents } from '@/components/markdown/unified-markdown-components';
import { StreamingCursor } from '@/components/ui/streaming-text';
import { FadeInText } from '@/components/ui/typing-text';
import { cn } from '@/lib/ui/cn';

type LLMAnswerDisplayProps = {
  answer: string | null;
  isStreaming?: boolean;
  className?: string;
  sources?: Array<{ url: string; title: string }>;
};

export function LLMAnswerDisplay({ answer, isStreaming = false, className, sources }: LLMAnswerDisplayProps) {
  // Don't show internal loading - unified loading indicator handles this
  if (!answer) {
    return null;
  }

  return (
    <div className={cn('space-y-3 mt-3', className)}>
      {/* Simplified header */}
      <FadeInText delay={0.05}>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
          <span>AI Summary</span>
        </div>
      </FadeInText>

      {/* Markdown content - uses Streamdown for proper streaming animation */}
      <div className="text-base">
        {isStreaming
          ? (
              <div>
                <Streamdown
                  className="leading-relaxed text-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                  components={streamdownComponents}
                >
                  {answer}
                </Streamdown>
                {/* ✅ STREAMING CURSOR: Show blinking cursor while streaming */}
                <StreamingCursor />
              </div>
            )
          : (
              <div className="prose prose-base dark:prose-invert max-w-none">
                <ReactMarkdown components={defaultMarkdownComponents}>
                  {answer}
                </ReactMarkdown>
              </div>
            )}
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
