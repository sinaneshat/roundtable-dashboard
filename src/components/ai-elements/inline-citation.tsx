'use client';

import { useTranslations } from 'next-intl';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { createContext, use, useMemo, useState } from 'react';

import type { CitationSourceType } from '@/api/core/enums';
import { CitationSourceTypes } from '@/api/core/enums';
import type { Icon } from '@/components/icons';
import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatFileSize } from '@/lib/format';
import { cn } from '@/lib/ui/cn';

// ============================================================================
// Context for Citation State
// ============================================================================

type InlineCitationContextValue = {
  readonly isOpen: boolean;
  readonly setIsOpen: (open: boolean) => void;
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

type SourceTypeConfig = {
  readonly icon: Icon;
  readonly label: string;
  readonly color: string;
};

const SOURCE_TYPE_CONFIG: Record<CitationSourceType, SourceTypeConfig> = {
  [CitationSourceTypes.MEMORY]: {
    icon: Icons.sparkles,
    label: 'Memory',
    color: 'text-purple-500',
  },
  [CitationSourceTypes.THREAD]: {
    icon: Icons.messageSquare,
    label: 'Thread',
    color: 'text-blue-500',
  },
  [CitationSourceTypes.ATTACHMENT]: {
    icon: Icons.fileText,
    label: 'File',
    color: 'text-green-500',
  },
  [CitationSourceTypes.SEARCH]: {
    icon: Icons.globe,
    label: 'Search',
    color: 'text-amber-500',
  },
  [CitationSourceTypes.MODERATOR]: {
    icon: Icons.search,
    label: 'Moderator',
    color: 'text-cyan-500',
  },
  [CitationSourceTypes.RAG]: {
    icon: Icons.database,
    label: 'Indexed File',
    color: 'text-indigo-500',
  },
};

// ============================================================================
// InlineCitation Root
// ============================================================================

type InlineCitationProps = {
  readonly className?: string;
  readonly children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<'span'>, 'className' | 'children'>;

function InlineCitation({ className, children, ...props }: InlineCitationProps) {
  const [isOpen, setIsOpen] = useState(false);

  const contextValue = useMemo(
    () => ({ isOpen, setIsOpen }),
    [isOpen],
  );

  return (
    <InlineCitationContext value={contextValue}>
      <span data-slot="inline-citation" className={cn('inline', className)} {...props}>
        {children}
      </span>
    </InlineCitationContext>
  );
}

// ============================================================================
// InlineCitationCard (Popover Container)
// ============================================================================

type InlineCitationCardProps = {
  readonly children: ReactNode;
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
  readonly displayNumber: number;
  readonly sourceType: CitationSourceType;
  readonly className?: string;
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
  readonly children: ReactNode;
  readonly className?: string;
};

function InlineCitationCardBody({ children, className }: InlineCitationCardBodyProps) {
  return (
    <PopoverContent className={cn('w-80 p-0 backdrop-blur-lg bg-popover/95', className)} align="start" sideOffset={8}>
      <div className="p-3 space-y-3">{children}</div>
    </PopoverContent>
  );
}

// ============================================================================
// InlineCitationSource (Source Info Display)
// ============================================================================

type InlineCitationSourceProps = {
  readonly title: string;
  readonly sourceType: CitationSourceType;
  readonly description?: string;
  readonly url?: string;
  readonly threadTitle?: string;
  readonly className?: string;
  readonly downloadUrl?: string;
  readonly filename?: string;
  readonly mimeType?: string;
  readonly fileSize?: number;
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
  const t = useTranslations();
  const config = SOURCE_TYPE_CONFIG[sourceType];
  const Icon = config.icon;
  const isAttachment = sourceType === CitationSourceTypes.ATTACHMENT;
  const displayTitle = filename || title;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-start gap-2">
        <div className={cn('shrink-0 p-1.5 rounded-md bg-muted/50', config.color)}>
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
          <h4 className="text-sm font-medium leading-tight mt-0.5 line-clamp-2">{displayTitle}</h4>
          {isAttachment && (mimeType || fileSize) && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {mimeType && <span>{mimeType}</span>}
              {mimeType && fileSize && <span> · </span>}
              {fileSize && <span>{formatFileSize(fileSize)}</span>}
            </p>
          )}
        </div>
      </div>
      {description && (
        <p className="text-xs text-muted-foreground line-clamp-3">{description}</p>
      )}
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
          <Icons.download className="size-3" />
          <span>{t('chat.citations.download', { name: filename || 'file' })}</span>
        </a>
      )}
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
          <Icons.externalLink className="size-3" />
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
  readonly children: ReactNode;
  readonly className?: string;
};

function InlineCitationQuote({ children, className }: InlineCitationQuoteProps) {
  return (
    <blockquote className={cn('border-l-2 border-primary/30 pl-3 py-1 text-xs text-muted-foreground italic line-clamp-4', className)}>
      {children}
    </blockquote>
  );
}

// ============================================================================
// InlineCitationText (Inline Text with Citation)
// ============================================================================

type InlineCitationTextProps = {
  readonly className?: string;
} & Omit<ComponentPropsWithoutRef<'span'>, 'className'>;

function InlineCitationText({ className, ...props }: InlineCitationTextProps) {
  return <span data-slot="inline-citation-text" className={cn('inline', className)} {...props} />;
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
