'use client';

import { ChevronDown } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { createContext, use, useEffect, useMemo, useState } from 'react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/ui/cn';

/**
 * Reasoning - AI reasoning visualization component
 *
 * Provides a collapsible interface for displaying step-by-step AI reasoning
 * following the AI Elements pattern from the chatbot example.
 *
 * Based on AI SDK Elements design pattern for showing model thinking processes.
 */

// ============================================================================
// Context
// ============================================================================

type ReasoningContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  isStreaming: boolean;
};

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

function useReasoning() {
  const context = use(ReasoningContext);
  if (!context) {
    throw new Error('Reasoning components must be used within Reasoning');
  }
  return context;
}

// ============================================================================
// Root Component
// ============================================================================

type ReasoningProps = ComponentProps<'div'> & {
  /**
   * Whether the reasoning is currently being streamed
   * Shows a pulsing indicator when true
   * Automatically opens the component when streaming begins
   */
  isStreaming?: boolean;
  /**
   * Default open state
   * Defaults to true - reasoning is expanded by default
   */
  defaultOpen?: boolean;
};

export function Reasoning({
  isStreaming = false,
  defaultOpen = true,
  className,
  children,
  ...props
}: ReasoningProps) {
  const [open, setOpen] = useState(defaultOpen);

  // Automatically open when streaming begins
  useEffect(() => {
    if (isStreaming) {
      setOpen(true);
    }
  }, [isStreaming]);

  const contextValue = useMemo(
    () => ({ open, setOpen, isStreaming }),
    [open, setOpen, isStreaming],
  );

  return (
    <ReasoningContext value={contextValue}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <div
          className={cn(
            'rounded-lg border border-border bg-muted/30 overflow-hidden',
            className,
          )}
          {...props}
        >
          {children}
        </div>
      </Collapsible>
    </ReasoningContext>
  );
}

// ============================================================================
// Trigger
// ============================================================================

type ReasoningTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  children?: ReactNode;
};

export function ReasoningTrigger({
  children,
  className,
  ...props
}: ReasoningTriggerProps) {
  const { open, isStreaming } = useReasoning();

  return (
    <CollapsibleTrigger
      className={cn(
        'flex w-full items-center justify-between gap-2 px-3 py-2 text-sm',
        'text-muted-foreground hover:text-foreground transition-colors',
        'focus:outline-none',
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium">
          {children || 'Reasoning'}
        </span>
        {isStreaming && (
          <div className="size-1.5 rounded-full bg-primary/60 animate-pulse" />
        )}
      </div>
      <ChevronDown
        className={cn(
          'size-3.5 transition-transform duration-200',
          open && 'rotate-180',
        )}
      />
    </CollapsibleTrigger>
  );
}

// ============================================================================
// Content
// ============================================================================

type ReasoningContentProps = ComponentProps<typeof CollapsibleContent>;

export function ReasoningContent({
  className,
  children,
  ...props
}: ReasoningContentProps) {
  return (
    <CollapsibleContent
      className={cn(
        'px-3 pb-2.5 pt-1',
        className,
      )}
      {...props}
    >
      <div className="text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
        {children}
      </div>
    </CollapsibleContent>
  );
}
