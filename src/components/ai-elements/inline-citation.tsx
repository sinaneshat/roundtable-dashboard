'use client';

/**
 * InlineCitation Component System
 *
 * Provides inline citations for AI-generated content that references sources from
 * project context (memories, threads, files, searches, analyses).
 *
 * Usage:
 * ```tsx
 * <InlineCitation>
 *   <InlineCitationCard>
 *     <InlineCitationCardTrigger displayNumber={1} sourceType="memory" />
 *     <InlineCitationCardBody>
 *       <InlineCitationSource
 *         title="Project Requirements"
 *         sourceType="memory"
 *         description="Key requirements from project setup"
 *       />
 *       <InlineCitationQuote>
 *         "The authentication must use OAuth 2.0 protocol..."
 *       </InlineCitationQuote>
 *     </InlineCitationCardBody>
 *   </InlineCitationCard>
 * </InlineCitation>
 * ```
 */

import { Database, Download, ExternalLink, FileText, Globe, MessageSquare, Search, Sparkles } from 'lucide-react';
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';
import { createContext, use, useMemo, useState } from 'react';

import type { CitationSourceType } from '@/api/core/enums';
import { CitationSourceTypes } from '@/api/core/enums';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/ui/cn';

// ============================================================================
// Context for Citation State
// ============================================================================

type InlineCitationContextValue = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
};

const InlineCitationContext = createContext<InlineCitationContextValue | null>(null);

function useInlineCitation() {
  const context = use(InlineCitationContext);
  if (!context) {
    throw new Error('InlineCitation components must be used within InlineCitation');
  }
  return context;
}

// ============================================================================
// Source Type Icons & Labels
// ============================================================================

const SOURCE_TYPE_CONFIG: Record<CitationSourceType, {
  icon: ElementType;
  label: string;
  color: string;
}> = {
  [CitationSourceTypes.MEMORY]: {
    icon: Sparkles,
    label: 'Memory',
    color: 'text-purple-500',
  },
  [CitationSourceTypes.THREAD]: {
    icon: MessageSquare,
    label: 'Thread',
    color: 'text-blue-500',
  },
  [CitationSourceTypes.ATTACHMENT]: {
    icon: FileText,
    label: 'File',
    color: 'text-green-500',
  },
  [CitationSourceTypes.SEARCH]: {
    icon: Globe,
    label: 'Search',
    color: 'text-amber-500',
  },
  [CitationSourceTypes.ANALYSIS]: {
    icon: Search,
    label: 'Analysis',
    color: 'text-cyan-500',
  },
  [CitationSourceTypes.RAG]: {
    icon: Database,
    label: 'Indexed File',
    color: 'text-indigo-500',
  },
};

// ============================================================================
// InlineCitation Root
// ============================================================================

type InlineCitationProps = ComponentPropsWithoutRef<'span'>;

function InlineCitation({ className, children, ...props }: InlineCitationProps) {
  const [isOpen, setIsOpen] = useState(false);

  const contextValue = useMemo(
    () => ({ isOpen, setIsOpen }),
    [isOpen],
  );

  return (
    <InlineCitationContext value={contextValue}>
      <span
        data-slot="inline-citation"
        className={cn('inline', className)}
        {...props}
      >
        {children}
      </span>
    </InlineCitationContext>
  );
}

// ============================================================================
// InlineCitationCard (Popover Container)
// ============================================================================

type InlineCitationCardProps = {
  children: ReactNode;
};

function InlineCitationCard({ children }: InlineCitationCardProps) {
  const { isOpen, setIsOpen } = useInlineCitation();

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      {children}
    </Popover>
  );
}

// ============================================================================
// InlineCitationCardTrigger (Badge Button)
// ============================================================================

type InlineCitationCardTriggerProps = {
  displayNumber: number;
  sourceType: CitationSourceType;
  className?: string;
};

function InlineCitationCardTrigger({
  displayNumber,
  sourceType,
  className,
}: InlineCitationCardTriggerProps) {
  const config = SOURCE_TYPE_CONFIG[sourceType];

  return (
    <PopoverTrigger asChild>
      <button
        type="button"
        className={cn(
          'inline-flex items-center justify-center align-super',
          'cursor-pointer transition-all duration-150',
          'hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
          className,
        )}
      >
        <Badge
          variant="glass"
          className={cn(
            'h-4 min-w-4 px-1 text-[10px] font-semibold leading-none',
            'hover:bg-primary/20',
            config.color,
          )}
        >
          {displayNumber}
        </Badge>
      </button>
    </PopoverTrigger>
  );
}

// ============================================================================
// InlineCitationCardBody (Popover Content)
// ============================================================================

type InlineCitationCardBodyProps = {
  children: ReactNode;
  className?: string;
};

function InlineCitationCardBody({ children, className }: InlineCitationCardBodyProps) {
  return (
    <PopoverContent
      glass
      className={cn(
        'w-80 p-0',
        className,
      )}
      align="start"
      sideOffset={8}
    >
      <div className="p-3 space-y-3">
        {children}
      </div>
    </PopoverContent>
  );
}

// ============================================================================
// InlineCitationSource (Source Info Display)
// ============================================================================

type InlineCitationSourceProps = {
  title: string;
  sourceType: CitationSourceType;
  description?: string;
  url?: string;
  threadTitle?: string;
  className?: string;
  // Attachment-specific props
  downloadUrl?: string;
  filename?: string;
  mimeType?: string;
  fileSize?: number;
};

function InlineCitationSource({
  title,
  sourceType,
  description,
  url,
  threadTitle,
  className,
  downloadUrl,
  filename,
  mimeType,
  fileSize,
}: InlineCitationSourceProps) {
  const config = SOURCE_TYPE_CONFIG[sourceType];
  const Icon = config.icon;

  // Format file size for display
  const formatFileSize = (bytes: number | undefined) => {
    if (!bytes)
      return null;
    if (bytes < 1024)
      return `${bytes}B`;
    if (bytes < 1024 * 1024)
      return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  const isAttachment = sourceType === CitationSourceTypes.ATTACHMENT;
  const displayTitle = filename || title;

  return (
    <div className={cn('space-y-2', className)}>
      {/* Source Header */}
      <div className="flex items-start gap-2">
        <div className={cn(
          'shrink-0 p-1.5 rounded-md bg-muted/50',
          config.color,
        )}
        >
          <Icon className="size-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {config.label}
            </Badge>
            {threadTitle && (
              <span className="text-[10px] text-muted-foreground truncate">
                {threadTitle}
              </span>
            )}
          </div>
          <h4 className="text-sm font-medium leading-tight mt-0.5 line-clamp-2">
            {displayTitle}
          </h4>
          {/* File metadata for attachments */}
          {isAttachment && (mimeType || fileSize) && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {mimeType && <span>{mimeType}</span>}
              {mimeType && fileSize && <span> · </span>}
              {fileSize && <span>{formatFileSize(fileSize)}</span>}
            </p>
          )}
        </div>
      </div>

      {/* Description */}
      {description && (
        <p className="text-xs text-muted-foreground line-clamp-3">
          {description}
        </p>
      )}

      {/* Download Link (for file attachments) */}
      {isAttachment && downloadUrl && (
        <a
          href={downloadUrl}
          download={filename || title}
          className={cn(
            'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs',
            'bg-primary/10 text-primary hover:bg-primary/20',
            'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
          )}
        >
          <Download className="size-3" />
          <span>
            Download
            {filename || 'file'}
          </span>
        </a>
      )}

      {/* URL Link (for search results and external links) */}
      {url && !isAttachment && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'inline-flex items-center gap-1 text-xs text-primary',
            'hover:underline focus:outline-none focus-visible:underline',
          )}
        >
          <ExternalLink className="size-3" />
          <span className="truncate max-w-[200px]">{new URL(url).hostname}</span>
        </a>
      )}
    </div>
  );
}

// ============================================================================
// InlineCitationQuote (Quoted Excerpt)
// ============================================================================

type InlineCitationQuoteProps = {
  children: ReactNode;
  className?: string;
};

function InlineCitationQuote({ children, className }: InlineCitationQuoteProps) {
  return (
    <blockquote
      className={cn(
        'border-l-2 border-primary/30 pl-3 py-1',
        'text-xs text-muted-foreground italic',
        'line-clamp-4',
        className,
      )}
    >
      {children}
    </blockquote>
  );
}

// ============================================================================
// InlineCitationText (Inline Text with Citation)
// ============================================================================

type InlineCitationTextProps = ComponentPropsWithoutRef<'span'>;

function InlineCitationText({ className, ...props }: InlineCitationTextProps) {
  return (
    <span
      data-slot="inline-citation-text"
      className={cn('inline', className)}
      {...props}
    />
  );
}

// ============================================================================
// Exports
// ============================================================================

export {
  InlineCitation,
  InlineCitationCard,
  InlineCitationCardBody,
  InlineCitationCardTrigger,
  InlineCitationQuote,
  InlineCitationSource,
  InlineCitationText,
};
