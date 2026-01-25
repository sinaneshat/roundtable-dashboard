import { useState } from 'react';

import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/ui/cn';

// ============================================================================
// Types
// ============================================================================

export type CreatedMemory = {
  readonly id: string;
  readonly summary: string;
  readonly content: string;
};

type MemoryCreatedIndicatorProps = {
  readonly memories: CreatedMemory[];
  readonly onDelete?: (memoryId: string) => void;
  readonly defaultOpen?: boolean;
  readonly className?: string;
};

// ============================================================================
// Component
// ============================================================================

/**
 * Memory Created Indicator - Shows when AI has saved memories from a conversation
 *
 * Displays a collapsible indicator under user messages when memories are created.
 * Similar to the reasoning accordion pattern, but for memory extraction.
 *
 * Features:
 * - Collapsible display with memory count
 * - Shows summary and content for each memory
 * - Inline delete button for removing memories
 */
export function MemoryCreatedIndicator({
  memories,
  onDelete,
  defaultOpen = false,
  className,
}: MemoryCreatedIndicatorProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(() => new Set());

  if (memories.length === 0) {
    return null;
  }

  const handleDelete = async (memoryId: string) => {
    if (!onDelete)
      return;

    setDeletingIds(prev => new Set(prev).add(memoryId));
    try {
      await onDelete(memoryId);
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(memoryId);
        return next;
      });
    }
  };

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn('mt-2', className)}
    >
      <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
        <Icons.brain className="size-3" />
        <span>
          Memory saved (
          {memories.length}
          )
        </span>
        <Icons.chevronDown
          className={cn(
            'size-3 transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-2 space-y-2">
        {memories.map(memory => (
          <div
            key={memory.id}
            className="flex items-start justify-between gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm"
          >
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground truncate">
                {memory.summary}
              </p>
              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                {memory.content}
              </p>
            </div>
            {onDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="size-6 shrink-0 hover:bg-destructive/10 hover:text-destructive"
                onClick={() => handleDelete(memory.id)}
                disabled={deletingIds.has(memory.id)}
                loading={deletingIds.has(memory.id)}
              >
                <Icons.x className="size-3" />
              </Button>
            )}
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
