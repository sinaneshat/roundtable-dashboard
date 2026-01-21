import * as CollapsiblePrimitive from '@radix-ui/react-collapsible';
import type { ComponentPropsWithoutRef, ElementRef } from 'react';

import { cn } from '@/lib/ui/cn';

const Collapsible = CollapsiblePrimitive.Root;

const CollapsibleTrigger = CollapsiblePrimitive.CollapsibleTrigger;

/**
 * CollapsibleContent with smooth height animation
 * Uses CSS grid technique for animating to/from height: auto
 * This provides smooth accordion-like transitions
 */
function CollapsibleContent({ ref, className, children, ...props }: ComponentPropsWithoutRef<typeof CollapsiblePrimitive.CollapsibleContent> & { ref?: React.RefObject<ElementRef<typeof CollapsiblePrimitive.CollapsibleContent> | null> }) {
  return (
    <CollapsiblePrimitive.CollapsibleContent
      ref={ref}
      className={cn(
        'overflow-hidden',
        // Smooth height animation using CSS grid technique
        'data-[state=closed]:animate-collapsible-up',
        'data-[state=open]:animate-collapsible-down',
        className,
      )}
      {...props}
    >
      {children}
    </CollapsiblePrimitive.CollapsibleContent>
  );
}

CollapsibleContent.displayName = 'CollapsibleContent';

export { Collapsible, CollapsibleContent, CollapsibleTrigger };
