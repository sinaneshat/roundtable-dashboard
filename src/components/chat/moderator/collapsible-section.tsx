'use client';

import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/ui/cn';

type CollapsibleSectionProps = {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
};

/**
 * CollapsibleSection - Accordion-style section wrapper
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
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className={cn('w-full', className)}>
      <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-3 text-left hover:bg-accent/30 transition-colors rounded">
        <div className="flex items-center gap-2">
          {icon && <span className="text-muted-foreground">{icon}</span>}
          <span className="font-medium text-sm">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          {subtitle && (
            <span className="text-xs text-muted-foreground hidden sm:inline">{subtitle}</span>
          )}
          <ChevronDown
            className={cn(
              'size-4 text-muted-foreground transition-transform duration-200',
              isOpen && 'rotate-180',
            )}
          />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-3 py-3">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
