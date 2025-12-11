'use client';

import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/ui/cn';

type CollapsibleSectionProps = {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  /** Controlled open state - when provided, overrides internal state */
  demoOpen?: boolean;
  /** Force section to stay open (e.g., during streaming) */
  forceOpen?: boolean;
};

/**
 * CollapsibleSection - Clean, minimal accordion-style section wrapper
 *
 * Used for the expandable sections in the Round Outcome panel:
 * - Key Insights & Recommendations
 * - Contributor Perspectives
 * - Consensus Analysis
 * - Evidence & Reasoning
 * - Explore Alternatives
 * - Round Summary
 * - About This Framework
 */
export function CollapsibleSection({
  icon,
  title,
  subtitle,
  children,
  defaultOpen = false,
  className,
  demoOpen,
  forceOpen,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  // Priority: forceOpen > demoOpen > internal state
  // forceOpen: Used during streaming to keep sections expanded
  // demoOpen: Used for demo mode controlled state
  const effectiveOpen = forceOpen || (demoOpen !== undefined ? demoOpen : isOpen);

  return (
    <Collapsible
      open={effectiveOpen}
      onOpenChange={demoOpen === undefined ? setIsOpen : undefined}
      className={cn('w-full rounded-lg', className)}
    >
      <CollapsibleTrigger
        className={cn(
          'group flex w-full items-center justify-between text-left',
          // Consistent padding with touch targets
          'px-3 py-3 sm:px-4 sm:py-3',
          'min-h-[48px]', // Minimum touch target
          'rounded-lg transition-colors',
          // Subtle hover effect
          'hover:bg-accent/30',
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {icon && (
            <span className="flex-shrink-0 text-muted-foreground">
              {icon}
            </span>
          )}
          <span className="font-medium text-sm truncate text-foreground/90">
            {title}
          </span>
        </div>
        <div className="flex items-center gap-2 sm:gap-2.5 flex-shrink-0 ml-2">
          {subtitle && (
            <Badge
              variant="secondary"
              className={cn(
                'text-[10px] sm:text-xs font-normal hidden sm:inline-flex',
                'bg-muted/50 hover:bg-muted/50 text-muted-foreground',
                'max-w-[120px] md:max-w-none truncate',
              )}
            >
              {subtitle}
            </Badge>
          )}
          <div
            className={cn(
              'flex items-center justify-center size-6 rounded-md transition-colors',
              'group-hover:bg-accent/50',
            )}
          >
            <ChevronDown
              className={cn(
                'size-4 text-muted-foreground transition-transform duration-200 flex-shrink-0',
                effectiveOpen && 'rotate-180',
              )}
            />
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
        {/* Content with consistent padding matching ChainOfThoughtContent pattern */}
        <div className="px-3 pt-1 pb-4 sm:px-4 sm:pt-2 sm:pb-5">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
