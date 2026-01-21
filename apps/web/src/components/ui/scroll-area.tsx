'use client';

import { motion } from 'motion/react';
import type { ComponentProps, ElementRef } from 'react';

import { cn } from '@/lib/ui/cn';

type ScrollAreaProps = ComponentProps<'div'> & {
  orientation?: 'vertical' | 'horizontal' | 'both';
  layoutScroll?: boolean;
};

function ScrollArea({ ref, className, children, orientation = 'vertical', layoutScroll = false, ...props }: ScrollAreaProps & { ref?: React.RefObject<ElementRef<'div'> | null> }) {
  const viewportClasses = cn(
    'size-full rounded-[inherit]',
    // Overflow handling based on orientation
    orientation === 'horizontal' && 'overflow-x-auto overflow-y-hidden',
    orientation === 'vertical' && 'overflow-y-auto overflow-x-hidden',
    orientation === 'both' && 'overflow-auto',
    // Vertical scrollbar styling
    '[&::-webkit-scrollbar]:w-2',
    // Horizontal scrollbar styling
    '[&::-webkit-scrollbar]:h-1.5',
    '[&::-webkit-scrollbar-track]:bg-transparent',
    '[&::-webkit-scrollbar-thumb]:bg-border',
    '[&::-webkit-scrollbar-thumb]:rounded-full',
    'hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/50',
  );

  return (
    <div
      ref={ref}
      data-slot="scroll-area"
      className={cn('relative overflow-hidden', className)}
      {...props}
    >
      {layoutScroll
        ? (
            <motion.div
              data-slot="scroll-area-viewport"
              layoutScroll
              className={viewportClasses}
            >
              {children}
            </motion.div>
          )
        : (
            <div
              data-slot="scroll-area-viewport"
              className={viewportClasses}
            >
              {children}
            </div>
          )}
    </div>
  );
}
ScrollArea.displayName = 'ScrollArea';

function ScrollBar(_props: { className?: string; orientation?: 'vertical' | 'horizontal' }) {
  // No-op - scrollbar styling is handled via CSS in ScrollArea
  return null;
}

export { ScrollArea, ScrollBar };
