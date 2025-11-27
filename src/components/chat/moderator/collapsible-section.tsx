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
  /** Optional accent color for the section */
  accentColor?: 'primary' | 'emerald' | 'amber' | 'blue' | 'purple';
};

/**
 * CollapsibleSection - Modern accordion-style section wrapper
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
  accentColor,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  // Accent color classes for left border indicator
  const accentClasses = {
    primary: 'border-l-primary/60',
    emerald: 'border-l-emerald-500/60',
    amber: 'border-l-amber-500/60',
    blue: 'border-l-blue-500/60',
    purple: 'border-l-purple-500/60',
  };

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className={cn(
        'w-full rounded-lg transition-all duration-200',
        // Subtle background on hover when closed
        !isOpen && 'hover:bg-accent/20',
        // Enhanced background when open
        isOpen && 'bg-accent/10',
        className,
      )}
    >
      <CollapsibleTrigger
        className={cn(
          'group flex w-full items-center justify-between text-left',
          // Consistent padding with touch targets
          'px-3 py-3 sm:px-4 sm:py-3',
          'min-h-[48px]', // Minimum touch target
          'rounded-lg transition-colors',
          // Left border accent when open
          'border-l-2 border-l-transparent',
          isOpen && accentColor && accentClasses[accentColor],
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {icon && (
            <span
              className={cn(
                'flex-shrink-0 transition-colors',
                isOpen ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {icon}
            </span>
          )}
          <span
            className={cn(
              'font-medium text-sm truncate transition-colors',
              isOpen ? 'text-foreground' : 'text-foreground/80',
            )}
          >
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
                isOpen && 'rotate-180',
              )}
            />
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
        {/* Content with smooth padding and separator */}
        <div
          className={cn(
            'px-3 pt-1 pb-4 sm:px-4 sm:pt-2 sm:pb-5',
            // Indent content to align with title (past icon)
            icon && 'pl-10 sm:pl-12',
          )}
        >
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
