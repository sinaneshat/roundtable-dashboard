import type { CitationSourceType } from '@roundtable/shared';
import { CitationSourceTypes } from '@roundtable/shared';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { createContext, use, useCallback, useMemo, useState } from 'react';

import type { Icon } from '@/components/icons';
import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  useCarousel,
} from '@/components/ui/carousel';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatFileSize } from '@/lib/format';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/ui/cn';
import { rlog } from '@/lib/utils/dev-logger';
import type { AvailableSource } from '@/services/api';

import { extractHostname, formatCitationIdForDisplay } from './citation-utils';

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
  [CitationSourceTypes.ATTACHMENT]: {
    color: 'text-green-500',
    icon: Icons.fileText,
    label: 'File',
  },
  [CitationSourceTypes.MEMORY]: {
    color: 'text-purple-500',
    icon: Icons.sparkles,
    label: 'Memory',
  },
  [CitationSourceTypes.MODERATOR]: {
    color: 'text-cyan-500',
    icon: Icons.search,
    label: 'Moderator',
  },
  [CitationSourceTypes.RAG]: {
    color: 'text-indigo-500',
    icon: Icons.database,
    label: 'Indexed File',
  },
  [CitationSourceTypes.SEARCH]: {
    color: 'text-amber-500',
    icon: Icons.globe,
    label: 'Search',
  },
  [CitationSourceTypes.THREAD]: {
    color: 'text-blue-500',
    icon: Icons.messageSquare,
    label: 'Thread',
  },
};

// ============================================================================
// InlineCitation Root
// ============================================================================

type InlineCitationProps = {
  readonly className?: string;
  readonly children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<'span'>, 'className' | 'children'>;

function InlineCitation({ children, className, ...props }: InlineCitationProps) {
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
  /** Display number for fallback when no sources */
  readonly displayNumber?: number;
  readonly sourceType: CitationSourceType;
  /** Array of source URLs to display hostname badge */
  readonly sources?: string[];
  readonly className?: string;
};

function InlineCitationCardTrigger({
  className,
  displayNumber,
  sources = [],
  sourceType,
}: InlineCitationCardTriggerProps) {
  const config = SOURCE_TYPE_CONFIG[sourceType];

  if (!config) {
    return null;
  }

  // Get display text: hostname for search results, type label for others
  const getDisplayText = () => {
    // For search results with URLs, show hostname
    if (sourceType === CitationSourceTypes.SEARCH && sources.length > 0) {
      const hostname = extractHostname(sources[0] ?? '');
      if (hostname) {
        const extraCount = sources.length - 1;
        return extraCount > 0 ? `${hostname} +${extraCount}` : hostname;
      }
    }

    // For other source types, show short label
    const shortLabels: Record<CitationSourceType, string> = {
      [CitationSourceTypes.ATTACHMENT]: 'file',
      [CitationSourceTypes.MEMORY]: 'mem',
      [CitationSourceTypes.MODERATOR]: 'mod',
      [CitationSourceTypes.RAG]: 'doc',
      [CitationSourceTypes.SEARCH]: 'web',
      [CitationSourceTypes.THREAD]: 'chat',
    };

    return shortLabels[sourceType] || (displayNumber?.toString() ?? '?');
  };

  const IconComponent = config.icon;

  return (
    <PopoverTrigger asChild>
      <button
        type="button"
        className={cn(
          'inline-flex items-center justify-center align-baseline',
          'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
          className,
        )}
      >
        <Badge
          variant="glass"
          className={cn(
            'h-5 px-1.5 text-[11px] font-medium leading-none gap-1',
            config.color,
          )}
        >
          <IconComponent className="size-3" />
          <span>{getDisplayText()}</span>
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
    <PopoverContent className={cn('z-20 w-80 p-0 backdrop-blur-lg bg-popover/95', className)} align="start" side="bottom" sideOffset={8}>
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
  /** Whether the citation data has been fully resolved from the database */
  readonly isResolved?: boolean;
  /** Raw citation ID for fallback display */
  readonly citationId?: string;
};

function InlineCitationSource({
  citationId,
  className,
  description,
  downloadUrl,
  filename,
  fileSize,
  isResolved: _isResolved = true,
  mimeType,
  sourceType,
  threadTitle,
  title,
  url,
}: InlineCitationSourceProps) {
  const t = useTranslations();
  const config = SOURCE_TYPE_CONFIG[sourceType];

  if (!config) {
    return null;
  }

  const IconComponent = config.icon;
  const isAttachment = sourceType === CitationSourceTypes.ATTACHMENT;

  // Extract hostname from URL for display (useful for search citations)
  const urlHostname = url
    ? (() => {
        try {
          return new URL(url).hostname;
        } catch {
          return null;
        }
      })()
    : null;

  // Format title nicely - priority: resolved title > filename > URL hostname > formatted ID
  const displayTitle = title
    || filename
    || urlHostname
    || formatCitationIdForDisplay(citationId || '', sourceType);

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-start gap-2">
        <div className={cn('shrink-0 p-1.5 rounded-md bg-muted/50', config.color)}>
          <IconComponent className="size-3.5" />
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
            {urlHostname && !title && (
              <span className="text-[10px] text-muted-foreground truncate">
                {urlHostname}
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
          <span className="truncate max-w-[200px]">{urlHostname || url}</span>
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
    <p className={cn('text-xs text-muted-foreground line-clamp-3', className)}>
      {children}
    </p>
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
// Carousel Components for Citation Sources
// ============================================================================

type InlineCitationCarouselProps = {
  readonly children: ReactNode;
  readonly className?: string;
};

function InlineCitationCarousel({ children, className }: InlineCitationCarouselProps) {
  return (
    <Carousel
      opts={{ align: 'start', loop: false }}
      className={cn('w-full', className)}
    >
      {children}
    </Carousel>
  );
}

type InlineCitationCarouselHeaderProps = {
  readonly children: ReactNode;
  readonly className?: string;
};

function InlineCitationCarouselHeader({ children, className }: InlineCitationCarouselHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between gap-2 mb-2', className)}>
      {children}
    </div>
  );
}

type InlineCitationCarouselIndexProps = {
  readonly className?: string;
  readonly children?: ReactNode;
};

function InlineCitationCarouselIndex({ children, className }: InlineCitationCarouselIndexProps) {
  const { api } = useCarousel();
  const [current, setCurrent] = useState(0);
  const [count, setCount] = useState(0);

  const onSelect = useCallback(() => {
    if (!api) {
      return;
    }
    setCurrent(api.selectedScrollSnap() + 1);
    setCount(api.scrollSnapList().length);
  }, [api]);

  // Subscribe to carousel changes
  useMemo(() => {
    if (!api) {
      return;
    }
    onSelect();
    api.on('select', onSelect);
    api.on('reInit', onSelect);
    return () => {
      api.off('select', onSelect);
      api.off('reInit', onSelect);
    };
  }, [api, onSelect]);

  if (children) {
    return <div className={cn('text-xs text-muted-foreground', className)}>{children}</div>;
  }

  return (
    <div className={cn('text-xs text-muted-foreground tabular-nums', className)}>
      {current}
      /
      {count}
    </div>
  );
}

type InlineCitationCarouselPrevProps = {
  readonly className?: string;
};

function InlineCitationCarouselPrev({ className }: InlineCitationCarouselPrevProps) {
  return (
    <CarouselPrevious
      variant="ghost"
      size="sm"
      className={cn(
        'relative static translate-x-0 translate-y-0 h-6 w-6',
        className,
      )}
    />
  );
}

type InlineCitationCarouselNextProps = {
  readonly className?: string;
};

function InlineCitationCarouselNext({ className }: InlineCitationCarouselNextProps) {
  return (
    <CarouselNext
      variant="ghost"
      size="sm"
      className={cn(
        'relative static translate-x-0 translate-y-0 h-6 w-6',
        className,
      )}
    />
  );
}

type InlineCitationCarouselContentProps = {
  readonly children: ReactNode;
  readonly className?: string;
};

function InlineCitationCarouselContent({ children, className }: InlineCitationCarouselContentProps) {
  return (
    <CarouselContent className={cn('-ml-2', className)}>
      {children}
    </CarouselContent>
  );
}

type InlineCitationCarouselItemProps = {
  readonly children: ReactNode;
  readonly className?: string;
};

function InlineCitationCarouselItem({ children, className }: InlineCitationCarouselItemProps) {
  return (
    <CarouselItem className={cn('pl-2 basis-full', className)}>
      <div className="space-y-2">
        {children}
      </div>
    </CarouselItem>
  );
}

// ============================================================================
// SourcesFooter - Unified Sources Display at End of Response
// ============================================================================

/**
 * SourceData - Type alias for AvailableSource from Zod schema
 *
 * ✅ SINGLE SOURCE OF TRUTH: Uses AvailableSourceSchema from @/api/types/citations
 * This ensures the citation data structure is consistent across the codebase.
 */
type SourceData = AvailableSource;

type SourcesFooterProps = {
  readonly sources: SourceData[];
  readonly className?: string;
};

function SourcesFooter({ className, sources }: SourcesFooterProps) {
  const t = useTranslations();
  const [isOpen, setIsOpen] = useState(false);

  const contextValue = useMemo(
    () => ({ isOpen, setIsOpen }),
    [isOpen],
  );

  // Log when popover opens
  const handleOpenChange = useCallback((open: boolean) => {
    if (open) {
      rlog.msg('citation-footer', `opened count=${sources.length} types=[${sources.map(s => s.sourceType).join(',')}]`);
    }
    setIsOpen(open);
  }, [sources]);

  if (sources.length === 0) {
    return null;
  }

  // Log when SourcesFooter renders with sources
  rlog.msg('citation-footer', `render count=${sources.length} ids=[${sources.map(s => (s.id ?? '?').slice(0, 8)).join(',')}]`);

  // Get unique hostnames for display
  const searchSources = sources.filter(s => s.sourceType === CitationSourceTypes.SEARCH && s.url);
  const firstHostname = searchSources.length > 0 && searchSources[0]?.url
    ? extractHostname(searchSources[0].url)
    : null;
  const extraCount = sources.length - 1;

  // Display text for trigger
  const triggerText = firstHostname
    ? (extraCount > 0 ? `${firstHostname} +${extraCount}` : firstHostname)
    : `${sources.length} ${sources.length === 1 ? 'source' : 'sources'}`;

  return (
    <InlineCitationContext value={contextValue}>
      <div className={cn('mt-4 pt-3 border-t border-border/50', className)}>
        <Popover open={isOpen} onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                'inline-flex items-center gap-2 px-3 py-1.5 rounded-full',
                'bg-muted/50 hover:bg-muted transition-colors',
                'text-sm text-muted-foreground hover:text-foreground',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
              )}
            >
              <Icons.globe className="size-4" />
              <span>{triggerText}</span>
              <Icons.chevronDown className="size-3 opacity-50" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="z-20 w-96 p-0 backdrop-blur-lg bg-popover/95"
            align="start"
            side="bottom"
            sideOffset={8}
          >
            <div className="p-4">
              <InlineCitationCarousel>
                <InlineCitationCarouselHeader>
                  <span className="text-sm font-medium">{t('chat.citations.sources')}</span>
                  <div className="flex items-center gap-1">
                    <InlineCitationCarouselPrev />
                    <InlineCitationCarouselIndex />
                    <InlineCitationCarouselNext />
                  </div>
                </InlineCitationCarouselHeader>
                <InlineCitationCarouselContent>
                  {sources.map(source => (
                    <InlineCitationCarouselItem key={source.id}>
                      <InlineCitationSource
                        title={source.title || source.filename || source.id || 'Unknown'}
                        sourceType={source.sourceType}
                        url={source.url}
                        downloadUrl={source.downloadUrl}
                        filename={source.filename}
                        mimeType={source.mimeType}
                        fileSize={source.fileSize}
                        threadTitle={source.threadTitle}
                        citationId={source.id}
                      />
                      {/* Show excerpt/quote if available - the actual cited content */}
                      {source.excerpt && (
                        <InlineCitationQuote>
                          {source.excerpt}
                        </InlineCitationQuote>
                      )}
                    </InlineCitationCarouselItem>
                  ))}
                </InlineCitationCarouselContent>
              </InlineCitationCarousel>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </InlineCitationContext>
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
  InlineCitationCarousel,
  InlineCitationCarouselContent,
  InlineCitationCarouselHeader,
  InlineCitationCarouselIndex,
  InlineCitationCarouselItem,
  InlineCitationCarouselNext,
  InlineCitationCarouselPrev,
  InlineCitationQuote,
  InlineCitationSource,
  InlineCitationText,
  SOURCE_TYPE_CONFIG,
  SourcesFooter,
};

export type { SourceData };
