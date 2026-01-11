import type { ComponentProps, HTMLAttributes } from 'react';

import { ComponentSizes, ComponentVariants } from '@/api/core/enums';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/ui/cn';

type ActionsProps = HTMLAttributes<HTMLDivElement>;

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

type ActionProps = ComponentProps<typeof Button> & {
  tooltip?: string;
  label?: string;
};

export function Action({
  children,
  className,
  tooltip,
  label,
  ...props
}: ActionProps) {
  if (tooltip || label) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={ComponentVariants.GHOST}
            size={ComponentSizes.ICON}
            className={cn(
              'rounded-full text-muted-foreground hover:text-foreground',
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
      variant={ComponentVariants.GHOST}
      size={ComponentSizes.ICON}
      className={cn(
        'rounded-full text-muted-foreground hover:text-foreground',
        className,
      )}
      aria-label={label}
      {...props}
    >
      {children}
    </Button>
  );
}
