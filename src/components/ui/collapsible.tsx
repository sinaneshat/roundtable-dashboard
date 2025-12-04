'use client';

import type { ComponentPropsWithoutRef, ElementRef } from 'react';
import { forwardRef } from 'react';

import * as CollapsiblePrimitive from '@radix-ui/react-collapsible';

import { cn } from '@/lib/ui/cn';

const Collapsible = CollapsiblePrimitive.Root;

const CollapsibleTrigger = CollapsiblePrimitive.CollapsibleTrigger;

const CollapsibleContent = forwardRef<
  ElementRef<typeof CollapsiblePrimitive.CollapsibleContent>,
  ComponentPropsWithoutRef<typeof CollapsiblePrimitive.CollapsibleContent>
>(({ className, children, ...props }, ref) => (
  <CollapsiblePrimitive.CollapsibleContent
    ref={ref}
    className={cn('overflow-hidden', className)}
    {...props}
  >
    {children}
  </CollapsiblePrimitive.CollapsibleContent>
));

CollapsibleContent.displayName = 'CollapsibleContent';

export { Collapsible, CollapsibleContent, CollapsibleTrigger };
