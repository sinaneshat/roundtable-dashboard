'use client';

import { ArrowDownIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { useCallback } from 'react';
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/ui/cn';

export type ConversationProps = ComponentProps<typeof StickToBottom>;

export function Conversation({ className, ...props }: ConversationProps) {
  return (
    <StickToBottom
      className={cn('relative flex-1 overflow-y-auto', className)}
      initial="smooth"
      resize="smooth"
      role="log"
      {...props}
    />
  );
}

export type ConversationContentProps = ComponentProps<
  typeof StickToBottom.Content
>;

export function ConversationContent({
  className,
  ...props
}: ConversationContentProps) {
  return <StickToBottom.Content className={cn('p-4', className)} {...props} />;
}

export type ConversationEmptyStateProps = ComponentProps<'div'> & {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
};

export function ConversationEmptyState({
  className,
  title = 'No messages yet',
  description = 'Start a conversation to see messages here',
  icon,
  children,
  ...props
}: ConversationEmptyStateProps) {
  return (
    <div
      className={cn(
        'flex size-full flex-col items-center justify-center gap-3 p-8 text-center',
        className,
      )}
      {...props}
    >
      {children ?? (
        <>
          {icon && <div className="text-muted-foreground">{icon}</div>}
          <div className="space-y-1">
            <h3 className="font-medium text-sm">{title}</h3>
            {description && (
              <p className="text-muted-foreground text-sm">{description}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export type ConversationScrollButtonProps = ComponentProps<typeof Button> & {
  /**
   * Placement of the scroll button
   * - 'bottom': Default position at the bottom center of the scroll area
   * - 'header': Fixed position in the header area (top-right)
   */
  placement?: 'bottom' | 'header';
};

export function ConversationScrollButton({
  className,
  placement = 'bottom',
  ...props
}: ConversationScrollButtonProps) {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  const handleScrollToBottom = useCallback(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  // Don't render if at bottom
  if (isAtBottom) {
    return null;
  }

  return (
    <Button
      className={cn(
        'rounded-full shadow-lg',
        placement === 'bottom' && 'absolute bottom-4 left-[50%] translate-x-[-50%]',
        placement === 'header' && 'flex-shrink-0',
        className,
      )}
      onClick={handleScrollToBottom}
      size="icon"
      type="button"
      variant="outline"
      {...props}
    >
      <ArrowDownIcon className="size-4" />
    </Button>
  );
}
