"use client"

import type { ComponentProps, ElementRef } from 'react';
import { forwardRef } from 'react';

import { cn } from "@/lib/ui/cn"

const ScrollArea = forwardRef<ElementRef<"div">, ComponentProps<"div">>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-slot="scroll-area"
        className={cn("relative overflow-hidden", className)}
        {...props}
      >
        <div
          data-slot="scroll-area-viewport"
          className={cn(
            "size-full overflow-auto rounded-[inherit]",
            // Thin scrollbar styling via CSS
            "[&::-webkit-scrollbar]:w-2",
            "[&::-webkit-scrollbar-track]:bg-transparent",
            "[&::-webkit-scrollbar-thumb]:bg-border",
            "[&::-webkit-scrollbar-thumb]:rounded-full",
            "hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/50"
          )}
        >
          {children}
        </div>
      </div>
    )
  }
)
ScrollArea.displayName = "ScrollArea"

function ScrollBar({ className, orientation = "vertical" }: { className?: string; orientation?: "vertical" | "horizontal" }) {
  // No-op - scrollbar styling is handled via CSS in ScrollArea
  return null
}

export { ScrollArea, ScrollBar }
