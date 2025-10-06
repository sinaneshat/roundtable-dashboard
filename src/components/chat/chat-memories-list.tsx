'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import RHFSelect from '@/components/forms/rhf-select';
import RHFTextField from '@/components/forms/rhf-text-field';
import RHFTextarea from '@/components/forms/rhf-textarea';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useCreateMemoryMutation, useDeleteMemoryMutation } from '@/hooks/mutations/chat-mutations';
import { useMemoriesQuery } from '@/hooks/queries/chat-memories';
import { toastManager } from '@/lib/toast/toast-manager';
import { cn } from '@/lib/ui/cn';
import { getApiErrorMessage } from '@/lib/utils/error-handling';

// ============================================================================
// Types & Schema - Reusing Backend Validation
// ============================================================================

type ChatMemoriesListProps = {
  selectedMemoryIds: string[];
  onMemoryIdsChange: (memoryIds: string[]) => void;
  className?: string;
  isStreaming?: boolean; // Disable queries during streaming to prevent excessive refetches
};

/**
 * Memory creation form data
 * Uses a stricter schema than the backend to ensure all fields are filled in the form
 */
const CreateMemoryFormSchema = z.object({
  type: z.enum(['personal', 'topic', 'instruction', 'fact']),
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  description: z.string().max(500).optional(),
  threadId: z.string().optional(),
  isGlobal: z.boolean(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

type CreateMemoryFormData = z.infer<typeof CreateMemoryFormSchema>;

// ============================================================================
// Component
// ============================================================================

/**
 * ChatMemoriesList - Memory attachment selector with inline creation
 *
 * Features:
 * - Multi-select memories with checkmarks
 * - Inline memory creation (conditional CommandItem pattern)
 * - Search and filter memories
 * - Shows selected count
 *
 * Following shadcn MCP combobox + command patterns
 * Matches role selector UI/UX patterns
 */
export function ChatMemoriesList({
  selectedMemoryIds,
  onMemoryIdsChange,
  className,
  isStreaming = false,
}: ChatMemoriesListProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Disable queries during streaming to prevent excessive refetches and flashing
  const { data: memoriesData } = useMemoriesQuery(!isStreaming);
  const createMemoryMutation = useCreateMemoryMutation();
  const deleteMemoryMutation = useDeleteMemoryMutation();

  // Initialize RHF form for creating memories
  const form = useForm<CreateMemoryFormData>({
    resolver: zodResolver(CreateMemoryFormSchema),
    defaultValues: {
      title: '',
      content: '',
      type: 'topic',
      description: '',
      isGlobal: false,
    },
  });

  // Flatten memories from pages with defensive checks
  const memories = memoriesData?.pages.flatMap(page =>
    (page?.success && page.data?.items) ? page.data.items : [],
  ) || [];

  // Check if the search query is a new memory title
  const existingTitles = memories.map(m => m.title.toLowerCase());
  const isNewMemory = searchQuery.trim()
    && !existingTitles.includes(searchQuery.trim().toLowerCase());

  // ============================================================================
  // Handlers
  // ============================================================================

  const handleToggleMemory = (memoryId: string) => {
    const newSelectedIds = selectedMemoryIds.includes(memoryId)
      ? selectedMemoryIds.filter(id => id !== memoryId)
      : [...selectedMemoryIds, memoryId];

    onMemoryIdsChange(newSelectedIds);
  };

  // Open dialog with pre-filled content
  const handleOpenCreateDialog = (initialContent?: string) => {
    if (initialContent) {
      form.setValue('title', initialContent);
      form.setValue('content', initialContent);
    }
    setOpen(false);
    setCreateDialogOpen(true);
  };

  // Full create from dialog form
  const handleCreateMemoryFromForm = async (data: CreateMemoryFormData) => {
    try {
      const result = await createMemoryMutation.mutateAsync({
        json: {
          title: data.title,
          content: data.content,
          type: data.type,
          description: data.description || undefined,
        },
      });

      if (result.success && result.data?.memory) {
        // Auto-select the newly created memory (mutation auto-invalidates query)
        onMemoryIdsChange([...selectedMemoryIds, result.data.memory.id]);

        // Close dialog and reset form
        setCreateDialogOpen(false);
        form.reset();
        // Success is obvious from the memory appearing in the list - no toast needed
      }
    } catch (error) {
      console.error('Failed to create memory:', error);
      const errorMessage = getApiErrorMessage(error, 'Failed to create memory');
      toastManager.error('Failed to create memory', errorMessage);
    }
  };

  const handleDeleteMemory = async (memoryId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent toggling selection when clicking delete

    try {
      const result = await deleteMemoryMutation.mutateAsync(memoryId);

      if (result.success) {
        // If the deleted memory was selected, remove it from selection
        if (selectedMemoryIds.includes(memoryId)) {
          onMemoryIdsChange(selectedMemoryIds.filter(id => id !== memoryId));
        }
        // Success is obvious from the memory disappearing - no toast needed
        // Mutation auto-invalidates query - no manual refetch needed
      }
    } catch (error) {
      console.error('Failed to delete memory:', error);
      const errorMessage = getApiErrorMessage(error, 'Failed to delete memory');
      toastManager.error('Failed to delete memory', errorMessage);
    }
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
            className="h-8 sm:h-9 rounded-full gap-1.5 sm:gap-2 text-xs relative px-3 sm:px-4"
          >
            <Sparkles className="size-3.5 sm:size-4" />
            <span className="hidden xs:inline sm:inline">{selectedCount > 0 ? 'Memories' : 'Add Memory'}</span>
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
              {/* Always show Create Memory button at the top */}
              <CommandGroup>
                <CommandItem
                  onSelect={() => handleOpenCreateDialog()}
                  className="gap-2 text-primary font-medium"
                >
                  <Plus className="size-4" />
                  <span>Create New Memory</span>
                </CommandItem>
              </CommandGroup>

              {/* Empty State */}
              {memories.length === 0 && !searchQuery && (
                <div className="p-6 text-center space-y-3">
                  <Sparkles className="mx-auto size-12 text-muted-foreground/50" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">No memories yet</p>
                    <p className="text-xs text-muted-foreground">
                      Click &quot;Create New Memory&quot; above to get started
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
                <>
                  <CommandSeparator />
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
                            className="gap-2 group"
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
                            <button
                              type="button"
                              onClick={e => handleDeleteMemory(memory.id, e)}
                              disabled={deleteMemoryMutation.isPending}
                              className="ml-2 opacity-60 sm:opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-sm hover:bg-destructive/10 hover:text-destructive disabled:opacity-50 flex-shrink-0"
                              aria-label="Delete memory"
                            >
                              {deleteMemoryMutation.isPending
                                ? (
                                    <div className="size-3.5 animate-spin rounded-full border-2 border-destructive border-t-transparent" />
                                  )
                                : (
                                    <Trash2 className="size-3.5" />
                                  )}
                            </button>
                          </CommandItem>
                        );
                      })}
                  </CommandGroup>
                </>
              )}

              {/* Typed new memory - show option to create with pre-filled data */}
              {isNewMemory && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Quick Create">
                    <CommandItem
                      value={searchQuery}
                      onSelect={() => handleOpenCreateDialog(searchQuery.trim())}
                      className="gap-2 text-primary"
                    >
                      <Plus className="size-4" />
                      <span>
                        Create &quot;
                        {searchQuery.trim()}
                        &quot;
                      </span>
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Create Memory Dialog - RHF Form */}
      <Dialog
        open={createDialogOpen}
        onOpenChange={(isOpen) => {
          setCreateDialogOpen(isOpen);
          if (!isOpen) {
            form.reset();
            setSearchQuery('');
          }
        }}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create New Memory</DialogTitle>
            <DialogDescription>
              Add a new memory to help AI assistants remember important context and information.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleCreateMemoryFromForm)} className="space-y-4">
              <RHFTextField
                name="title"
                title="Title"
                placeholder="e.g., Project Requirements"
                required
                disabled={createMemoryMutation.isPending}
              />

              <RHFSelect
                name="type"
                title="Type"
                placeholder="Select memory type"
                options={[
                  { label: 'Topic', value: 'topic' },
                  { label: 'Personal', value: 'personal' },
                  { label: 'Instruction', value: 'instruction' },
                  { label: 'Fact', value: 'fact' },
                ]}
                required
                disabled={createMemoryMutation.isPending}
              />

              <RHFTextarea
                name="content"
                title="Content"
                placeholder="Describe what you want the AI to remember..."
                rows={4}
                required
                disabled={createMemoryMutation.isPending}
              />

              <RHFTextarea
                name="description"
                title="Description (Optional)"
                placeholder="Additional context or notes..."
                rows={2}
                disabled={createMemoryMutation.isPending}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setCreateDialogOpen(false);
                    form.reset();
                    setSearchQuery('');
                  }}
                  disabled={createMemoryMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  loading={createMemoryMutation.isPending}
                  disabled={createMemoryMutation.isPending}
                >
                  Create Memory
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
