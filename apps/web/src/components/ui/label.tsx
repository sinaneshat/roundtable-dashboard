'use client';

import * as LabelPrimitive from '@radix-ui/react-label';
import type { ComponentPropsWithoutRef, ElementRef } from 'react';

import { cn } from '@/lib/ui/cn';

function Label({ ref, className, ...props }: ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & { ref?: React.RefObject<ElementRef<typeof LabelPrimitive.Root> | null> }) {
  return (
    <LabelPrimitive.Root
      ref={ref}
      data-slot="label"
      className={cn(
        'flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
