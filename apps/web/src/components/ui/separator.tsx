'use client';

import * as SeparatorPrimitive from '@radix-ui/react-separator';
import type { ComponentPropsWithoutRef, ElementRef } from 'react';

import { cn } from '@/lib/ui/cn';

function Separator({ ref, className, orientation = 'horizontal', decorative = true, ...props }: ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root> & { ref?: React.RefObject<ElementRef<typeof SeparatorPrimitive.Root> | null> }) {
  return (
    <SeparatorPrimitive.Root
      ref={ref}
      data-slot="separator"
      role="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        'bg-border shrink-0 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px',
        className,
      )}
      {...props}
    />
  );
}

Separator.displayName = SeparatorPrimitive.Root.displayName;

export { Separator };
