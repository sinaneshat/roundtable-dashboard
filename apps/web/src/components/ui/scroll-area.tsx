'use client';

import { motion } from 'motion/react';
import type { ComponentProps, ElementRef } from 'react';

import { cn } from '@/lib/ui/cn';

type ScrollAreaProps = ComponentProps<'div'> & {
  orientation?: 'vertical' | 'horizontal' | 'both';
  layoutScroll?: boolean;
  viewportRef?: React.RefObject<HTMLDivElement | null>;
};

function ScrollArea({ ref, className, children, orientation = 'vertical', layoutScroll = false, viewportRef, ...props }: ScrollAreaProps & { ref?: React.RefObject<ElementRef<'div'> | null> }) {
  const viewportClasses = cn(
    'size-full rounded-[inherit]',
    orientation === 'horizontal' && 'overflow-x-auto overflow-y-hidden',
    orientation === 'vertical' && 'overflow-y-auto overflow-x-hidden',
    orientation === 'both' && 'overflow-auto',
    'custom-scrollbar',
  );

  return (
    <div
      ref={ref}
      className={cn('relative overflow-hidden', className)}
      {...props}
    >
      {layoutScroll
        ? (
            <motion.div
              ref={viewportRef}
              layoutScroll
              className={viewportClasses}
            >
              {children}
            </motion.div>
          )
        : (
            <div
              ref={viewportRef}
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
  return null;
}

export { ScrollArea, ScrollBar };
