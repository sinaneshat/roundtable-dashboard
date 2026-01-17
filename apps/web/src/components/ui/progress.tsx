import * as ProgressPrimitive from '@radix-ui/react-progress';

import { cn } from '@/lib/ui/cn';

/**
 * Progress component - Official shadcn/ui pattern
 *
 * Uses CSS variables from theme (bg-primary, bg-destructive, etc.)
 * for consistent theming without custom color safelists.
 *
 * @see https://ui.shadcn.com/docs/components/progress
 * @see https://github.com/shadcn-ui/ui/discussions/1454
 */
function Progress({
  className,
  value,
  indicatorClassName,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & {
  indicatorClassName?: string;
}) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        'bg-primary/20 relative h-2 w-full overflow-hidden rounded-full',
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          'bg-primary h-full w-full flex-1 transition-all',
          indicatorClassName,
        )}
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
