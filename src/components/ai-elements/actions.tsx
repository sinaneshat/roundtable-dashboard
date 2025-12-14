import type { HTMLAttributes } from 'react';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/ui/cn';

/**
 * Actions - Row of action buttons for AI responses
 *
 * ✅ AI ELEMENTS PATTERN: Consistent action buttons for AI responses
 * Based on the official AI Elements Actions component pattern
 *
 * Features:
 * - Row of composable action buttons
 * - Support for custom actions with tooltips
 * - Keyboard accessible with proper ARIA labels
 * - Consistent with design system styling
 *
 * @example
 * ```tsx
 * <Actions className="mt-2">
 *   <Action onClick={regenerate} label="Retry">
 *     <RefreshCcwIcon className="size-3" />
 *   </Action>
 *   <Action onClick={copy} label="Copy">
 *     <CopyIcon className="size-3" />
 *   </Action>
 * </Actions>
 * ```
 */
export type ActionsProps = HTMLAttributes<HTMLDivElement>;

export function Actions({ children, className, ...props }: ActionsProps) {
  return (
    <div
      className={cn('flex items-center gap-1 mt-2', className)}
      {...props}
    >
      <TooltipProvider>
        {children}
      </TooltipProvider>
    </div>
  );
}

/**
 * Action - Individual action button within Actions row
 *
 * Supports tooltips for better UX and accessibility
 */
export type ActionProps = React.ComponentProps<typeof Button> & {
  /**
   * Tooltip text shown on hover
   */
  tooltip?: string;
  /**
   * Accessible label for screen readers
   * Also used as fallback if tooltip is not provided
   */
  label?: string;
};

export function Action({
  children,
  className,
  tooltip,
  label,
  ...props
}: ActionProps) {
  // If tooltip or label provided, wrap in Tooltip
  if (tooltip || label) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'h-7 w-7 p-0 rounded-full text-muted-foreground hover:text-foreground',
              className,
            )}
            aria-label={label}
            {...props}
          >
            {children}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltip || label}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        'h-7 w-7 p-0 rounded-full text-muted-foreground hover:text-foreground',
        className,
      )}
      aria-label={label}
      {...props}
    >
      {children}
    </Button>
  );
}
