'use client';

import type { ComponentPropsWithoutRef, ElementRef } from 'react';
import { forwardRef } from 'react';

import * as TogglePrimitive from '@radix-ui/react-toggle';
import { cva, type VariantProps } from 'class-variance-authority';

import type { ComponentVariant, ComponentSize } from '@/api/core/enums';
import { cn } from '@/lib/ui/cn';

const toggleVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium ring-offset-background transition-colors hover:bg-muted hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        outline:
          'border border-input bg-transparent hover:bg-accent hover:text-accent-foreground',
      } satisfies Partial<Record<ComponentVariant, string>>,
      size: {
        default: 'h-10 min-w-10 px-3',
        sm: 'h-9 min-w-9 px-2.5',
        lg: 'h-11 min-w-11 px-5',
      } satisfies Partial<Record<ComponentSize, string>>,
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

const Toggle = forwardRef<
  ElementRef<typeof TogglePrimitive.Root>,
  ComponentPropsWithoutRef<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>
>(({ className, variant, size, ...props }, ref) => {
  return (
    <TogglePrimitive.Root
      ref={ref}
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  );
});

Toggle.displayName = TogglePrimitive.Root.displayName;

export { Toggle, toggleVariants };

