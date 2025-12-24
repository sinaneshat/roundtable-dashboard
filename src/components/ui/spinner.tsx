import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/ui/cn';

/**
 * Spinner Component - shadcn/ui pattern
 *
 * Simple loading indicator with circular animation
 * Uses Loader2 icon from lucide-react
 *
 * @example
 * <Spinner />
 * <Spinner className="size-6" />
 */
function Spinner({ className, ...props }: React.ComponentProps<'svg'>) {
  return (
    <Loader2
      role="status"
      className={cn('size-4 animate-spin', className)}
      {...props}
    />
  );
}

export { Spinner };
