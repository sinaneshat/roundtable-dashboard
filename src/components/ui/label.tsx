"use client"

import type { ComponentPropsWithoutRef, ElementRef } from 'react';
import { forwardRef } from 'react';

import * as LabelPrimitive from "@radix-ui/react-label"

import { cn } from "@/lib/ui/cn"

const Label = forwardRef<
  ElementRef<typeof LabelPrimitive.Root>,
  ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    data-slot="label"
    className={cn(
      "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
      className
    )}
    {...props}
  />
))

Label.displayName = LabelPrimitive.Root.displayName

export { Label }

