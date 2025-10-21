'use client';

import type { LucideIcon } from 'lucide-react';
import { ChevronDown } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { createContext, use, useCallback, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/ui/cn';

/**
 * Chain of Thought - AI reasoning visualization component
 *
 * Provides a collapsible interface for displaying step-by-step AI reasoning,
 * search results, images, and other process information.
 *
 * Based on AI Elements design pattern for showing model thinking processes.
 */

// ============================================================================
// Context
// ============================================================================

type ChainOfThoughtContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const ChainOfThoughtContext = createContext<ChainOfThoughtContextValue | null>(null);

function useChainOfThought() {
  const context = use(ChainOfThoughtContext);
  if (!context) {
    throw new Error('ChainOfThought components must be used within ChainOfThought');
  }
  return context;
}

// ============================================================================
// Root Component
// ============================================================================

type ChainOfThoughtProps = ComponentProps<'div'> & {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function ChainOfThought({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  className,
  children,
  ...props
}: ChainOfThoughtProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const open = controlledOpen !== undefined ? controlledOpen : uncontrolledOpen;

  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (controlledOpen === undefined) {
      setUncontrolledOpen(newOpen);
    }
    onOpenChange?.(newOpen);
  }, [controlledOpen, onOpenChange]);

  const contextValue = useMemo(
    () => ({ open, setOpen: handleOpenChange }),
    [open, handleOpenChange],
  );

  return (
    <ChainOfThoughtContext value={contextValue}>
      <Collapsible open={open} onOpenChange={handleOpenChange}>
        <div
          className={cn(
            'rounded-lg border border-border/50 bg-muted/30',
            className,
          )}
          {...props}
        >
          {children}
        </div>
      </Collapsible>
    </ChainOfThoughtContext>
  );
}

// ============================================================================
// Header
// ============================================================================

type ChainOfThoughtHeaderProps = ComponentProps<typeof CollapsibleTrigger> & {
  children?: ReactNode;
};

export function ChainOfThoughtHeader({
  children = 'Chain of Thought',
  className,
  ...props
}: ChainOfThoughtHeaderProps) {
  const { open } = useChainOfThought();

  return (
    <CollapsibleTrigger
      className={cn(
        'flex w-full items-center justify-between px-4 py-3 text-sm font-medium',
        'text-muted-foreground hover:text-foreground transition-colors',
        'focus:outline-none focus-visible:outline-none',
        className,
      )}
      {...props}
    >
      <span>{children}</span>
      <ChevronDown
        className={cn(
          'size-4 transition-transform duration-200',
          open && 'rotate-180',
        )}
      />
    </CollapsibleTrigger>
  );
}

// ============================================================================
// Content
// ============================================================================

type ChainOfThoughtContentProps = ComponentProps<typeof CollapsibleContent>;

export function ChainOfThoughtContent({
  className,
  children,
  ...props
}: ChainOfThoughtContentProps) {
  return (
    <CollapsibleContent
      className={cn(
        'px-4 pb-4 space-y-3 overflow-x-auto',
        'animate-in fade-in-50 slide-in-from-top-2',
        className,
      )}
      {...props}
    >
      {children}
    </CollapsibleContent>
  );
}

// ============================================================================
// Step
// ============================================================================

type StepStatus = 'complete' | 'active' | 'pending';

type ChainOfThoughtStepProps = ComponentProps<'div'> & {
  icon?: LucideIcon;
  label: string;
  description?: string;
  status?: StepStatus;
};

export function ChainOfThoughtStep({
  icon: Icon,
  label,
  description,
  status = 'complete',
  className,
  children,
  ...props
}: ChainOfThoughtStepProps) {
  const statusConfig = {
    complete: {
      iconColor: 'text-green-500',
      labelColor: 'text-foreground',
    },
    active: {
      iconColor: 'text-primary',
      labelColor: 'text-foreground',
    },
    pending: {
      iconColor: 'text-muted-foreground',
      labelColor: 'text-muted-foreground',
    },
  };

  const config = statusConfig[status];

  return (
    <div className={cn('space-y-2', className)} {...props}>
      <div className="flex items-start gap-2">
        {Icon && (
          <div className={cn('mt-0.5 flex-shrink-0', config.iconColor)}>
            <Icon className="size-4" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className={cn('text-sm font-medium', config.labelColor)}>
            {label}
          </div>
          {description && (
            <div className="text-xs text-muted-foreground mt-0.5">
              {description}
            </div>
          )}
        </div>
        {status === 'active' && (
          <div className="flex-shrink-0">
            <div className="size-2 rounded-full bg-primary animate-pulse" />
          </div>
        )}
      </div>
      {children && <div className="ml-6 space-y-2">{children}</div>}
    </div>
  );
}

// ============================================================================
// Search Results
// ============================================================================

type ChainOfThoughtSearchResultsProps = ComponentProps<'div'>;

export function ChainOfThoughtSearchResults({
  className,
  children,
  ...props
}: ChainOfThoughtSearchResultsProps) {
  return (
    <div
      className={cn('flex flex-wrap gap-1.5', className)}
      {...props}
    >
      {children}
    </div>
  );
}

type ChainOfThoughtSearchResultProps = ComponentProps<typeof Badge>;

export function ChainOfThoughtSearchResult({
  className,
  children,
  ...props
}: ChainOfThoughtSearchResultProps) {
  return (
    <Badge
      variant="secondary"
      className={cn('text-xs font-normal', className)}
      {...props}
    >
      {children}
    </Badge>
  );
}

// ============================================================================
// Image
// ============================================================================

type ChainOfThoughtImageProps = ComponentProps<'div'> & {
  caption?: string;
};

export function ChainOfThoughtImage({
  caption,
  className,
  children,
  ...props
}: ChainOfThoughtImageProps) {
  return (
    <div className={cn('space-y-2', className)} {...props}>
      <div className="rounded-md overflow-hidden bg-muted">
        {children}
      </div>
      {caption && (
        <p className="text-xs text-muted-foreground text-center">
          {caption}
        </p>
      )}
    </div>
  );
}
