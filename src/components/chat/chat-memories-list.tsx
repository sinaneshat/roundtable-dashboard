'use client';

import { Check, Sparkles } from 'lucide-react';
import { useState } from 'react';

// ============================================================================
// Types & Schema
// ============================================================================
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useMemoriesQuery } from '@/hooks/queries/chat-memories';
import { cn } from '@/lib/ui/cn';

type ChatMemoriesListProps = {
  selectedMemoryIds: string[];
  onMemoryIdsChange: (memoryIds: string[]) => void;
  className?: string;
  isStreaming?: boolean; // Disable queries during streaming to prevent excessive refetches
};

// ============================================================================
// Component
// ============================================================================

/**
 * ChatMemoriesList - Memory attachment selector
 *
 * Features:
 * - Multi-select memories with checkmarks
 * - Search and filter memories
 * - Shows selected count
 *
 * Following shadcn MCP combobox + command patterns
 */
export function ChatMemoriesList({
  selectedMemoryIds,
  onMemoryIdsChange,
  className,
  isStreaming = false,
}: ChatMemoriesListProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Only fetch when popover is open (not on page load)
  const { data: memoriesData } = useMemoriesQuery(open && !isStreaming);

  // Flatten memories from pages with defensive checks
  const memories = memoriesData?.pages.flatMap(page =>
    (page?.success && page.data?.items) ? page.data.items : [],
  ) || [];

  // ============================================================================
  // Handlers
  // ============================================================================

  const handleToggleMemory = (memoryId: string) => {
    const newSelectedIds = selectedMemoryIds.includes(memoryId)
      ? selectedMemoryIds.filter(id => id !== memoryId)
      : [...selectedMemoryIds, memoryId];

    onMemoryIdsChange(newSelectedIds);
  };

  // ============================================================================
  // Render
  // ============================================================================

  const selectedCount = selectedMemoryIds.length;

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 sm:h-9 rounded-lg gap-1.5 sm:gap-2 text-xs relative px-3 sm:px-4"
          >
            <Sparkles className="size-3.5 sm:size-4" />
            <span className="hidden xs:inline sm:inline">Memories</span>
            {selectedCount > 0 && (
              <Badge variant="default" className="ml-1 sm:ml-1.5 size-5 sm:size-6 flex items-center justify-center p-0 text-[10px] sm:text-xs">
                {selectedCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-[calc(100vw-2rem)] sm:w-[320px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search memories..."
              value={searchQuery}
              onValueChange={setSearchQuery}
              className="h-9"
            />
            <CommandList>
              {/* Empty State */}
              {memories.length === 0 && !searchQuery && (
                <div className="p-6 text-center space-y-3">
                  <Sparkles className="mx-auto size-12 text-muted-foreground/50" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">No memories yet</p>
                    <p className="text-xs text-muted-foreground">
                      Create memories from your account settings
                    </p>
                  </div>
                </div>
              )}

              {/* No results for search */}
              {memories.length === 0 && searchQuery && (
                <CommandEmpty>No memories found.</CommandEmpty>
              )}

              {/* Existing Memories */}
              {memories.length > 0 && (
                <CommandGroup heading="Your Memories">
                  {memories
                    .filter(memory =>
                      memory.title.toLowerCase().includes(searchQuery.toLowerCase()),
                    )
                    .map((memory) => {
                      const isSelected = selectedMemoryIds.includes(memory.id);
                      return (
                        <CommandItem
                          key={memory.id}
                          value={memory.id}
                          onSelect={() => handleToggleMemory(memory.id)}
                          className="gap-2"
                        >
                          <Check
                            className={cn(
                              'size-4 flex-shrink-0',
                              isSelected ? 'opacity-100' : 'opacity-0',
                            )}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-medium truncate">
                                {memory.title}
                              </span>
                              <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 capitalize">
                                {memory.type}
                              </Badge>
                            </div>
                            {memory.content && (
                              <div className="text-xs text-muted-foreground truncate">
                                {memory.content}
                              </div>
                            )}
                          </div>
                        </CommandItem>
                      );
                    })}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
