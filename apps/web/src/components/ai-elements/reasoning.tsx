import type { ReasoningState } from '@roundtable/shared';
import { ReasoningStates } from '@roundtable/shared';
import type { ComponentProps, ReactNode } from 'react';
import { createContext, use, useCallback, useMemo, useState } from 'react';

import { Icons } from '@/components/icons';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useElapsedTime } from '@/hooks/utils';
import { cn } from '@/lib/ui/cn';

import { TextShimmer } from './shimmer';

// ============================================================================
// Context
// ============================================================================

type ReasoningContextValue = {
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
  readonly state: ReasoningState;
  readonly elapsedSeconds: number;
  readonly finalDuration: number | undefined;
};

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

function useReasoningContext() {
  const context = use(ReasoningContext);
  if (!context) {
    throw new Error('Reasoning components must be used within Reasoning');
  }
  return context;
}

// ============================================================================
// Root Component
// ============================================================================

type ReasoningProps = {
  readonly isStreaming?: boolean;
  readonly initialContentLength?: number;
  readonly storedDuration?: number;
  readonly className?: string;
  readonly children?: ReactNode;
  /** Controlled open state - if provided, component becomes controlled */
  readonly open?: boolean;
  /** Callback when open state changes - required when using controlled mode */
  readonly onOpenChange?: (open: boolean) => void;
  /** Default open state for uncontrolled mode */
  readonly defaultOpen?: boolean;
} & Omit<ComponentProps<typeof Collapsible>, 'open' | 'onOpenChange' | 'className' | 'children' | 'defaultOpen'>;

export function Reasoning({
  isStreaming: isStreamingProp = false,
  initialContentLength = 0,
  storedDuration,
  className,
  children,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  defaultOpen = false,
  ...props
}: ReasoningProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const { elapsedSeconds, finalDuration: calculatedDuration } = useElapsedTime(isStreamingProp);

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;

  const state: ReasoningState = useMemo(() => {
    if (storedDuration !== undefined)
      return ReasoningStates.COMPLETE;
    if (isStreamingProp)
      return ReasoningStates.THINKING;
    if (calculatedDuration !== undefined)
      return ReasoningStates.COMPLETE;
    if (initialContentLength > 0)
      return ReasoningStates.COMPLETE;
    return ReasoningStates.IDLE;
  }, [isStreamingProp, storedDuration, calculatedDuration, initialContentLength]);

  const finalDuration = storedDuration ?? calculatedDuration;

  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (isControlled) {
      controlledOnOpenChange?.(newOpen);
    } else {
      setInternalOpen(newOpen);
    }
  }, [isControlled, controlledOnOpenChange]);

  const contextValue = useMemo(
    () => ({
      open: isOpen,
      setOpen: handleOpenChange,
      state,
      elapsedSeconds,
      finalDuration,
    }),
    [isOpen, handleOpenChange, state, elapsedSeconds, finalDuration],
  );

  return (
    <ReasoningContext value={contextValue}>
      <Collapsible open={isOpen} onOpenChange={handleOpenChange} className={cn('not-prose w-full mb-4', className)} {...props}>
        {children}
      </Collapsible>
    </ReasoningContext>
  );
}

// ============================================================================
// Trigger
// ============================================================================

type ReasoningTriggerProps = {
  readonly title?: string;
  readonly className?: string;
} & Omit<ComponentProps<typeof CollapsibleTrigger>, 'className'>;

export function ReasoningTrigger({ title, className, ...props }: ReasoningTriggerProps) {
  const { open, state, elapsedSeconds, finalDuration } = useReasoningContext();

  const getMessage = (): string => {
    if (title)
      return title;

    if (state === ReasoningStates.THINKING) {
      return elapsedSeconds > 0 ? `Thinking... ${elapsedSeconds}s` : 'Thinking...';
    }

    if (state === ReasoningStates.COMPLETE) {
      if (finalDuration !== undefined && finalDuration > 0) {
        return `Thought for ${finalDuration} second${finalDuration === 1 ? '' : 's'}`;
      }
      return 'Thought for a moment';
    }

    return 'Reasoning';
  };

  const isThinking = state === ReasoningStates.THINKING;

  return (
    <CollapsibleTrigger className={cn('flex items-center gap-1.5 text-muted-foreground text-sm cursor-pointer hover:text-foreground transition-colors', className)} {...props}>
      <Icons.chevronRight className={cn('size-3.5 shrink-0 transition-transform duration-200', open && 'rotate-90')} />
      {isThinking ? <TextShimmer className="font-medium">{getMessage()}</TextShimmer> : <span className="font-medium">{getMessage()}</span>}
    </CollapsibleTrigger>
  );
}

// ============================================================================
// Content
// ============================================================================

type ReasoningContentProps = {
  readonly className?: string;
  readonly children?: ReactNode;
} & Omit<ComponentProps<typeof CollapsibleContent>, 'className' | 'children'>;

export function ReasoningContent({ className, children, ...props }: ReasoningContentProps) {
  return (
    <CollapsibleContent className={cn('mt-2 text-sm text-muted-foreground', className)} {...props}>
      <div className="whitespace-pre-wrap leading-relaxed pl-5">{children}</div>
    </CollapsibleContent>
  );
}
