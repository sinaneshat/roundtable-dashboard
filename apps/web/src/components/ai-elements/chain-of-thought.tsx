import type { ChainOfThoughtStepStatus } from '@roundtable/shared';
import { ChainOfThoughtStepStatuses } from '@roundtable/shared';
import { cva } from 'class-variance-authority';
import type { ComponentProps, ReactNode } from 'react';
import { createContext, use, useCallback, useMemo, useState } from 'react';

import type { Icon } from '@/components/icons';
import { Icons } from '@/components/icons';
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
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
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

type ChainOfThoughtProps = {
  readonly open?: boolean;
  readonly defaultOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly children?: ReactNode;
} & Omit<ComponentProps<'div'>, 'className' | 'children'>;

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

type ChainOfThoughtHeaderProps = {
  readonly children?: ReactNode;
  readonly className?: string;
  readonly disabled?: boolean;
} & Omit<ComponentProps<typeof CollapsibleTrigger>, 'className' | 'children' | 'disabled'>;

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
      <Icons.chevronDown
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

type ChainOfThoughtContentProps = {
  readonly className?: string;
  readonly children?: ReactNode;
} & Omit<ComponentProps<typeof CollapsibleContent>, 'className' | 'children'>;

export function ChainOfThoughtContent({
  className,
  children,
  ...props
}: ChainOfThoughtContentProps) {
  return (
    <CollapsibleContent
      className={cn(
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

const stepIconVariants = cva('mt-0.5 flex-shrink-0', {
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
});

const stepLabelVariants = cva('text-sm font-medium', {
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
});

type ChainOfThoughtStepProps = {
  readonly status?: ChainOfThoughtStepStatus;
  readonly icon?: Icon;
  readonly label: string;
  readonly description?: ReactNode;
  readonly badge?: ReactNode;
  readonly metadata?: ReactNode;
  readonly className?: string;
  readonly children?: ReactNode;
} & Omit<ComponentProps<'div'>, 'className' | 'children'>;

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

type ChainOfThoughtSearchResultsProps = {
  readonly className?: string;
  readonly children?: ReactNode;
} & Omit<ComponentProps<'div'>, 'className' | 'children'>;

export function ChainOfThoughtSearchResults({
  className,
  children,
  ...props
}: ChainOfThoughtSearchResultsProps) {
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)} {...props}>
      {children}
    </div>
  );
}

type ChainOfThoughtSearchResultProps = {
  readonly className?: string;
  readonly children?: ReactNode;
} & Omit<ComponentProps<typeof Badge>, 'className' | 'children' | 'variant'>;

export function ChainOfThoughtSearchResult({
  className,
  children,
  ...props
}: ChainOfThoughtSearchResultProps) {
  return (
    <Badge variant="secondary" className={cn('text-xs font-normal', className)} {...props}>
      {children}
    </Badge>
  );
}

// ============================================================================
// Image
// ============================================================================

type ChainOfThoughtImageProps = {
  readonly caption?: string;
  readonly className?: string;
  readonly children?: ReactNode;
} & Omit<ComponentProps<'div'>, 'className' | 'children'>;

export function ChainOfThoughtImage({
  caption,
  className,
  children,
  ...props
}: ChainOfThoughtImageProps) {
  return (
    <div className={cn('space-y-2', className)} {...props}>
      <div className="rounded-md overflow-hidden bg-muted">{children}</div>
      {caption && <p className="text-xs text-muted-foreground text-center">{caption}</p>}
    </div>
  );
}
