'use client';

import type { ComponentProps, ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/ui/cn';

/**
 * Actions - Message action buttons component
 *
 * Provides action buttons for messages (copy, regenerate, etc.)
 * following the AI Elements pattern from the chatbot example.
 */

// ============================================================================
// Actions Container
// ============================================================================

type ActionsProps = ComponentProps<'div'>;

export function Actions({
  className,
  children,
  ...props
}: ActionsProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-1',
        className,
      )}
      {...props}
    >
      <TooltipProvider delayDuration={300}>
        {children}
      </TooltipProvider>
    </div>
  );
}

// ============================================================================
// Action Button
// ============================================================================

type ActionProps = ComponentProps<typeof Button> & {
  /**
   * Label for the tooltip
   */
  label: string;
  /**
   * Icon or content to display in the button
   */
  children: ReactNode;
};

export function Action({
  label,
  children,
  className,
  ...props
}: ActionProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'size-7 text-muted-foreground hover:text-foreground',
            className,
          )}
          {...props}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p className="text-xs">{label}</p>
      </TooltipContent>
    </Tooltip>
  );
}
