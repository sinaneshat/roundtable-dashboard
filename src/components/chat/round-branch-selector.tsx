'use client';

import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/ui/cn';

/**
 * Round Branch Selector
 *
 * Standalone branch navigation for conversation rounds.
 * Allows users to navigate between different variants of an entire round
 * (user message + all participant responses).
 *
 * Simpler version that doesn't require Branch context wrapper.
 */

export type RoundBranchSelectorProps = {
  /** Round index for identification */
  roundIndex: number;
  /** Current active branch/variant index (0-based) */
  activeBranchIndex: number;
  /** Total number of branches/variants available */
  totalBranches: number;
  /** Callback when branch changes */
  onBranchChange?: (branchIndex: number) => Promise<void>;
  /** Alignment based on message role */
  from?: 'user' | 'assistant' | 'system';
  /** Additional className */
  className?: string;
};

export function RoundBranchSelector({
  roundIndex: _roundIndex,
  activeBranchIndex,
  totalBranches,
  onBranchChange,
  from = 'assistant',
  className,
}: RoundBranchSelectorProps) {
  const t = useTranslations('chat.variants');
  const [isSwitching, setIsSwitching] = useState(false);

  // Don't show if only one branch
  if (totalBranches <= 1) {
    return null;
  }

  const handlePrevious = async () => {
    if (activeBranchIndex === 0 || isSwitching || !onBranchChange)
      return;

    setIsSwitching(true);
    try {
      await onBranchChange(activeBranchIndex - 1);
    } finally {
      setIsSwitching(false);
    }
  };

  const handleNext = async () => {
    if (activeBranchIndex >= totalBranches - 1 || isSwitching || !onBranchChange)
      return;

    setIsSwitching(true);
    try {
      await onBranchChange(activeBranchIndex + 1);
    } finally {
      setIsSwitching(false);
    }
  };

  return (
    <div
      className={cn(
        'flex items-center gap-2 text-sm text-muted-foreground',
        from === 'user' && 'justify-end',
        from === 'assistant' && 'justify-start',
        className,
      )}
    >
      <Button
        variant="ghost"
        size="sm"
        onClick={handlePrevious}
        disabled={activeBranchIndex === 0 || isSwitching}
        className="h-7 w-7 p-0"
        aria-label={t('previousVariant')}
      >
        <ChevronLeftIcon className="size-3.5" />
      </Button>

      <span className="text-xs font-medium tabular-nums min-w-[3rem] text-center">
        {activeBranchIndex + 1}
        {' '}
        /
        {totalBranches}
      </span>

      <Button
        variant="ghost"
        size="sm"
        onClick={handleNext}
        disabled={activeBranchIndex >= totalBranches - 1 || isSwitching}
        className="h-7 w-7 p-0"
        aria-label={t('nextVariant')}
      >
        <ChevronRightIcon className="size-3.5" />
      </Button>
    </div>
  );
}
