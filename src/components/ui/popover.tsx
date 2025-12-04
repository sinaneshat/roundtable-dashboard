"use client"

import type { ComponentProps } from 'react';

import * as PopoverPrimitive from "@radix-ui/react-popover"

import { cn } from "@/lib/ui/cn"
import { glassCard } from "@/lib/ui/glassmorphism"

function Popover({
  ...props
}: ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({
  ...props
}: ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

type PopoverContentProps = ComponentProps<typeof PopoverPrimitive.Content> & {
  glass?: boolean;
};

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  glass = false,
  ...props
}: PopoverContentProps) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=start]:slide-in-from-end-2 data-[side=end]:slide-in-from-start-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-72 origin-(--radix-popover-content-transform-origin) rounded-md p-4 outline-hidden",
          glass
            ? cn(glassCard("medium"), "border")
            : "bg-popover text-popover-foreground border shadow-md",
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

function PopoverAnchor({
  ...props
}: ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
}

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger }
