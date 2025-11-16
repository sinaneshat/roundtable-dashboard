'use client';

import { motion } from 'framer-motion';
import { ExternalLink, Sparkles } from 'lucide-react';
import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';

import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/ui/cn';

type LLMAnswerDisplayProps = {
  answer: string | null;
  isStreaming?: boolean;
  className?: string;
  sources?: Array<{ url: string; title: string }>;
};

// Custom markdown components for rich rendering
const markdownComponents: Partial<Components> = {
  // Style links with external link icon
  a: ({ href, children, ...props }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary hover:text-primary/80 underline decoration-primary/30 underline-offset-4 transition-colors inline-flex items-center gap-1 group"
      {...props}
    >
      {children}
      <ExternalLink className="size-3 opacity-50 group-hover:opacity-100 transition-opacity" />
    </a>
  ),
  // Style paragraphs
  p: ({ children }) => (
    <p className="leading-relaxed mb-2 last:mb-0">
      {children}
    </p>
  ),
  // Style lists
  ul: ({ children }) => (
    <ul className="list-disc list-inside space-y-1 my-2">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-inside space-y-1 my-2">
      {children}
    </ol>
  ),
  // Style code blocks
  code: ({ inline, children, ...props }: { inline?: boolean; children?: React.ReactNode }) => {
    if (inline) {
      return (
        <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono" {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className="block bg-muted p-3 rounded-lg text-xs font-mono my-2 overflow-x-auto" {...props}>
        {children}
      </code>
    );
  },
  // Style blockquotes
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-primary/30 pl-4 py-1 my-2 italic text-muted-foreground">
      {children}
    </blockquote>
  ),
  // Style headings
  h1: ({ children }) => <h1 className="text-xl font-bold mt-4 mb-2">{children}</h1>,
  h2: ({ children }) => <h2 className="text-lg font-semibold mt-3 mb-2">{children}</h2>,
  h3: ({ children }) => <h3 className="text-base font-semibold mt-2 mb-1">{children}</h3>,
};

export function LLMAnswerDisplay({ answer, isStreaming = false, className, sources }: LLMAnswerDisplayProps) {
  // Show skeleton before first chunk arrives
  if (!answer && isStreaming) {
    return (
      <div className={cn('space-y-2', className)}>
        <div className="flex items-center gap-2 mb-3">
          <Badge variant="secondary" className="text-xs">
            <Sparkles className="size-3 mr-1 animate-pulse" />
            AI synthesizing answer...
          </Badge>
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/6" />
        <Separator className="!mt-3" />
      </div>
    );
  }

  if (!answer) {
    return null;
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* AI Answer Badge */}
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-xs">
          <Sparkles className="size-3 mr-1" />
          AI Answer
        </Badge>
        {isStreaming && (
          <Badge variant="outline" className="text-xs">
            Streaming...
          </Badge>
        )}
      </div>

      {/* Markdown-rendered answer with rich formatting */}
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <ReactMarkdown components={markdownComponents}>
          {answer}
        </ReactMarkdown>
        {isStreaming && (
          <motion.span
            className="inline-block w-1.5 h-4 ml-0.5 bg-primary/70 rounded-sm align-middle"
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 0.8, repeat: Infinity }}
          />
        )}
      </div>

      {/* Source citations (if provided separately) */}
      {sources && sources.length > 0 && (
        <div className="mt-4 pt-3 border-t border-border/30">
          <p className="text-xs font-medium text-muted-foreground mb-2">Sources cited:</p>
          <div className="flex flex-wrap gap-1.5">
            {sources.map((source, idx) => (
              <a
                key={idx}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 bg-primary/5 hover:bg-primary/10 px-2 py-1 rounded-md transition-colors group"
              >
                <span className="truncate max-w-[200px]">{source.title}</span>
                <ExternalLink className="size-3 opacity-50 group-hover:opacity-100 flex-shrink-0" />
              </a>
            ))}
          </div>
        </div>
      )}

      <Separator className="!mt-3" />
    </div>
  );
}
