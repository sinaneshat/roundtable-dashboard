'use client';

import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import React, { createContext, use, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/ui/cn';

/**
 * Branch Component System - AI SDK Elements Pattern
 *
 * Manages multiple versions of conversation rounds, allowing navigation
 * between different response branches. Adapted for round-based variants
 * where each round can have multiple regenerated versions.
 *
 * Following: https://ai-sdk.dev/elements/components/branch
 */

// ============================================================================
// Context and Types
// ============================================================================

type BranchContextValue = {
  /** Current branch index (0-based) */
  currentBranch: number;
  /** Total number of branches available */
  totalBranches: number;
  /** Navigate to a specific branch */
  setBranch: (index: number) => void;
  /** Navigate to next branch */
  nextBranch: () => void;
  /** Navigate to previous branch */
  previousBranch: () => void;
};

const BranchContext = createContext<BranchContextValue | null>(null);

function useBranch(): BranchContextValue {
  const context = use(BranchContext);
  if (!context) {
    throw new Error('Branch components must be used within a <Branch> component');
  }
  return context;
}

// ============================================================================
// Branch Container
// ============================================================================

export type BranchProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Index of the branch to show by default (0-based) */
  defaultBranch?: number;
  /** Total number of branches available */
  totalBranches: number;
  /** Callback when branch changes */
  onBranchChange?: (branchIndex: number) => void;
};

/**
 * Branch - Container for managing multiple response variants
 *
 * Provides context for branch navigation and manages active branch state.
 * Uses CSS to hide/show branches without re-rendering.
 */
export function Branch({
  defaultBranch = 0,
  totalBranches,
  onBranchChange,
  className,
  children,
  ...props
}: BranchProps) {
  const [currentBranch, setCurrentBranch] = useState(defaultBranch);

  const setBranch = (index: number) => {
    if (index < 0 || index >= totalBranches)
      return;
    setCurrentBranch(index);
    onBranchChange?.(index);
  };

  const nextBranch = () => {
    if (currentBranch < totalBranches - 1) {
      setBranch(currentBranch + 1);
    }
  };

  const previousBranch = () => {
    if (currentBranch > 0) {
      setBranch(currentBranch - 1);
    }
  };

  return (
    <BranchContext
      value={{
        currentBranch,
        totalBranches,
        setBranch,
        nextBranch,
        previousBranch,
      }}
    >
      <div className={cn('relative', className)} {...props}>
        {children}
      </div>
    </BranchContext>
  );
}

// ============================================================================
// Branch Messages Container
// ============================================================================

export type BranchMessagesProps = React.HTMLAttributes<HTMLDivElement>;

/**
 * BranchMessages - Container for branch message content
 *
 * Wraps the messages for a specific branch. Uses CSS to show/hide
 * based on active branch to prevent re-rendering.
 */
export function BranchMessages({
  className,
  children,
  ...props
}: BranchMessagesProps) {
  return (
    <div className={cn('space-y-4', className)} {...props}>
      {children}
    </div>
  );
}

// ============================================================================
// Branch Selector (Navigation Controls Container)
// ============================================================================

export type BranchSelectorProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Aligns selector for user/assistant messages */
  from?: 'user' | 'assistant' | 'system';
};

/**
 * BranchSelector - Navigation controls container
 *
 * Contains Previous, Page, and Next controls for branch navigation.
 * Aligns based on message role (user vs assistant).
 */
export function BranchSelector({
  from = 'assistant',
  className,
  children,
  ...props
}: BranchSelectorProps) {
  const { totalBranches } = useBranch();

  // Don't show selector if only one branch
  if (totalBranches <= 1) {
    return null;
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 py-2 text-sm text-muted-foreground',
        from === 'user' && 'justify-end',
        from === 'assistant' && 'justify-start ml-12', // Align with avatar offset
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// ============================================================================
// Navigation Controls
// ============================================================================

export type BranchPreviousProps = React.ComponentProps<typeof Button>;

/**
 * BranchPrevious - Previous branch button
 */
export function BranchPrevious({
  className,
  disabled,
  ...props
}: BranchPreviousProps) {
  const { currentBranch, previousBranch } = useBranch();
  const isDisabled = disabled || currentBranch === 0;

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={previousBranch}
      disabled={isDisabled}
      className={cn('h-7 w-7 p-0', className)}
      aria-label="Previous branch"
      {...props}
    >
      <ChevronLeftIcon className="size-3.5" />
    </Button>
  );
}

export type BranchNextProps = React.ComponentProps<typeof Button>;

/**
 * BranchNext - Next branch button
 */
export function BranchNext({
  className,
  disabled,
  ...props
}: BranchNextProps) {
  const { currentBranch, totalBranches, nextBranch } = useBranch();
  const isDisabled = disabled || currentBranch >= totalBranches - 1;

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={nextBranch}
      disabled={isDisabled}
      className={cn('h-7 w-7 p-0', className)}
      aria-label="Next branch"
      {...props}
    >
      <ChevronRightIcon className="size-3.5" />
    </Button>
  );
}

export type BranchPageProps = React.HTMLAttributes<HTMLSpanElement>;

/**
 * BranchPage - Branch counter display
 *
 * Shows current branch position (e.g., "1 / 3")
 */
export function BranchPage({ className, ...props }: BranchPageProps) {
  const { currentBranch, totalBranches } = useBranch();

  return (
    <span
      className={cn('text-xs font-medium tabular-nums min-w-[3rem] text-center', className)}
      {...props}
    >
      {currentBranch + 1}
      {' '}
      /
      {totalBranches}
    </span>
  );
}

/**
 * Hook to access branch context
 * Use this in custom components that need branch state
 */
export { useBranch };
