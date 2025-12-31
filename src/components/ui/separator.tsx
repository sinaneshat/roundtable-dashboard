"use client"

import type { ComponentPropsWithoutRef, ElementRef } from 'react';
import { forwardRef } from 'react';

import * as SeparatorPrimitive from "@radix-ui/react-separator"

import { cn } from "@/lib/ui/cn"

const Separator = forwardRef<
  ElementRef<typeof SeparatorPrimitive.Root>,
  ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(({ className, orientation = "horizontal", decorative = true, ...props }, ref) => (
  <SeparatorPrimitive.Root
    ref={ref}
    data-slot="separator"
    role="separator"
    decorative={decorative}
    orientation={orientation}
    className={cn(
      "bg-border shrink-0 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px",
      className
    )}
    {...props}
  />
))

Separator.displayName = SeparatorPrimitive.Root.displayName

export { Separator }

