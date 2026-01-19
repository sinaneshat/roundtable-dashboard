import type { ComponentProps } from 'react';

import { cn } from '@/lib/ui/cn';

/**
 * Skeleton - Base loading skeleton primitive
 *
 * The foundational skeleton element with animated pulse effect.
 * All composed skeletons should use this component.
 *
 * For composed skeletons (card, message, input, etc.), import from:
 * @/components/skeletons
 */
function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('bg-accent animate-pulse rounded-xl', className)}
      {...props}
    />
  );
}

export { Skeleton };
