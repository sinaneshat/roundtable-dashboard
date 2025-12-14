'use client';

import { cva } from 'class-variance-authority';
import type { LucideIcon } from 'lucide-react';
import { ChevronDown } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { createContext, use, useCallback, useMemo, useState } from 'react';

import type { ChainOfThoughtStepStatus } from '@/api/core/enums';
import { ChainOfThoughtStepStatuses } from '@/api/core/enums';
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
  disabled?: boolean;
};

export function ChainOfThought({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  disabled = false,
  className,
  children,
  ...props
}: ChainOfThoughtProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const open = controlledOpen !== undefined ? controlledOpen : uncontrolledOpen;

  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (disabled)
      return;
    if (controlledOpen === undefined) {
      setUncontrolledOpen(newOpen);
    }
    onOpenChange?.(newOpen);
  }, [controlledOpen, onOpenChange, disabled]);

  const contextValue = useMemo(
    () => ({ open, setOpen: handleOpenChange }),
    [open, handleOpenChange],
  );

  return (
    <ChainOfThoughtContext value={contextValue}>
      <Collapsible open={open} onOpenChange={handleOpenChange} disabled={disabled}>
        <div
          className={cn(
            'w-full rounded-2xl border border-border/50 bg-muted/30',
            disabled && 'opacity-100',
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
  disabled,
  ...props
}: ChainOfThoughtHeaderProps) {
  const { open } = useChainOfThought();

  return (
    <CollapsibleTrigger
      className={cn(
        // Base styles with consistent padding
        'flex w-full items-center justify-between',
        'px-3 py-2.5 sm:px-4 sm:py-3', // Consistent vertical padding
        'text-sm font-medium',
        'text-muted-foreground hover:text-foreground transition-colors',
        'focus:outline-none focus-visible:outline-none',
        // Minimum touch target height (44px recommended)
        'min-h-[44px]',
        disabled && 'cursor-not-allowed opacity-60',
        className,
      )}
      disabled={disabled}
      {...props}
    >
      <span className="flex-1 min-w-0">{children}</span>
      <ChevronDown
        className={cn(
          'size-4 flex-shrink-0 ml-2 transition-transform duration-200',
          open && 'rotate-180',
          disabled && 'opacity-50',
        )}
      />
    </CollapsibleTrigger>
  );
}

// ============================================================================
// Content
// ============================================================================

type ChainOfThoughtContentProps = ComponentProps<typeof CollapsibleContent> & {
  /** Enable stagger animation for children elements */
  staggerChildren?: boolean;
};

export function ChainOfThoughtContent({
  className,
  children,
  staggerChildren: _staggerChildren = false,
  ...props
}: ChainOfThoughtContentProps) {
  // ✅ SIMPLIFIED: No stagger animations - content appears instantly
  // Only the typing effect inside items should be animated
  return (
    <CollapsibleContent
      className={cn(
        // Consistent Y padding and spacing for body content
        'px-3 pt-1 pb-4 space-y-3 sm:px-4 sm:pt-2 sm:pb-5 sm:space-y-4',
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

/**
 * CVA variants for step icon colors
 * Values correspond to CHAIN_OF_THOUGHT_STEP_STATUSES enum
 * @see ChainOfThoughtStepStatuses in @/api/core/enums
 */
const stepIconVariants = cva(
  'mt-0.5 flex-shrink-0',
  {
    variants: {
      status: {
        [ChainOfThoughtStepStatuses.PENDING]: 'text-muted-foreground',
        [ChainOfThoughtStepStatuses.ACTIVE]: 'text-blue-500',
        [ChainOfThoughtStepStatuses.COMPLETE]: 'text-green-500',
      },
    },
    defaultVariants: {
      status: ChainOfThoughtStepStatuses.COMPLETE,
    },
  },
);

/**
 * CVA variants for step label colors
 * Values correspond to CHAIN_OF_THOUGHT_STEP_STATUSES enum
 * @see ChainOfThoughtStepStatuses in @/api/core/enums
 */
const stepLabelVariants = cva(
  'text-sm font-medium',
  {
    variants: {
      status: {
        [ChainOfThoughtStepStatuses.PENDING]: 'text-muted-foreground',
        [ChainOfThoughtStepStatuses.ACTIVE]: 'text-foreground',
        [ChainOfThoughtStepStatuses.COMPLETE]: 'text-foreground',
      },
    },
    defaultVariants: {
      status: ChainOfThoughtStepStatuses.COMPLETE,
    },
  },
);

type ChainOfThoughtStepProps = ComponentProps<'div'> & {
  /** Step status from Zod schema - single source of truth */
  status?: ChainOfThoughtStepStatus;
  icon?: LucideIcon;
  label: string;
  description?: ReactNode;
  badge?: ReactNode;
  metadata?: ReactNode;
};

export function ChainOfThoughtStep({
  icon: Icon,
  label,
  description,
  status = ChainOfThoughtStepStatuses.COMPLETE,
  badge,
  metadata,
  className,
  children,
  ...props
}: ChainOfThoughtStepProps) {
  const shouldAnimate = status === ChainOfThoughtStepStatuses.ACTIVE;

  return (
    <div className={cn('space-y-2', className)} {...props}>
      <div className="flex items-start gap-2.5">
        {Icon && (
          <div className={stepIconVariants({ status })}>
            <Icon className={cn('size-4', shouldAnimate && 'animate-pulse')} />
          </div>
        )}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={stepLabelVariants({ status })}>
              {label}
            </span>
            {badge}
          </div>
          {description && (
            <div className="text-xs text-muted-foreground leading-relaxed">
              {description}
            </div>
          )}
          {metadata && (
            <div className="flex items-center gap-2 flex-wrap">
              {metadata}
            </div>
          )}
        </div>
        {status === ChainOfThoughtStepStatuses.ACTIVE && (
          <div className="flex-shrink-0 mt-1">
            <div className="size-2 rounded-full bg-blue-500 animate-pulse" />
          </div>
        )}
      </div>
      {children && <div className="ml-6 space-y-3">{children}</div>}
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
