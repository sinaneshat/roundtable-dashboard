'use client';

import { GripVertical, Plus, Settings2, Sparkles, X } from 'lucide-react';
import { useMemo, useState } from 'react';

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
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { SubscriptionTier } from '@/db/tables/usage';
import { useMemoriesQuery } from '@/hooks/queries/chat-memories';
import { useCustomRolesQuery } from '@/hooks/queries/chat-roles';
import { useUsageStatsQuery } from '@/hooks/queries/usage';
import type { AIModel } from '@/lib/ai/models-config';
import { AI_MODELS, DEFAULT_ROLES, getAccessibleModels } from '@/lib/ai/models-config';
import { cn } from '@/lib/ui/cn';

// ============================================================================
// Types
// ============================================================================

/**
 * Participant configuration for chat threads
 * Used when configuring or displaying participant information
 */
export type ParticipantConfig = {
  id: string;
  modelId: string;
  role: string;
  customRoleId?: string;
  order: number;
};

type ChatConfigSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  participants: ParticipantConfig[];
  onParticipantsChange: (participants: ParticipantConfig[]) => void;
  selectedMemoryIds: string[];
  onMemoryIdsChange: (memoryIds: string[]) => void;
};

// ============================================================================
// Component
// ============================================================================

/**
 * Advanced Chat Configuration Sheet
 *
 * Features:
 * - Model participant selection and management
 * - Role assignment (default or custom)
 * - Memory attachment
 * - Participant reordering
 *
 * Following shadcn patterns for complex forms
 */
export function ChatConfigSheet({
  open,
  onOpenChange,
  participants,
  onParticipantsChange,
  selectedMemoryIds,
  onMemoryIdsChange,
}: ChatConfigSheetProps) {
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [memorySelectorOpen, setMemorySelectorOpen] = useState(false);

  // Only fetch data when sheet is open to prevent unnecessary API calls
  const { data: customRolesData } = useCustomRolesQuery(open);
  const { data: memoriesData } = useMemoriesQuery(open);
  const { data: usageData } = useUsageStatsQuery();

  // Get user's subscription tier for filtering models
  const userTier = (usageData?.success ? usageData.data.subscription.tier : 'free') as SubscriptionTier;

  // Filter models based on user's subscription tier - memoized to prevent infinite loops
  const accessibleModels = useMemo(() => getAccessibleModels(userTier), [userTier]);

  // Flatten custom roles from pages with defensive checks
  const customRoles = customRolesData?.pages.flatMap(page =>
    (page?.success && page.data?.items) ? page.data.items : [],
  ) || [];

  // Flatten memories from pages with defensive checks
  const memories = memoriesData?.pages.flatMap(page =>
    (page?.success && page.data?.items) ? page.data.items : [],
  ) || [];

  // Get selected memories details
  const selectedMemories = memories.filter(m => selectedMemoryIds.includes(m.id));

  // ============================================================================
  // Handlers
  // ============================================================================

  const handleAddParticipant = (model: AIModel) => {
    const newParticipant: ParticipantConfig = {
      id: `participant-${Date.now()}`,
      modelId: model.modelId,
      role: DEFAULT_ROLES[participants.length % DEFAULT_ROLES.length] || 'AI Assistant',
      order: participants.length,
    };
    onParticipantsChange([...participants, newParticipant]);
    setModelSelectorOpen(false);
  };

  const handleRemoveParticipant = (id: string) => {
    onParticipantsChange(participants.filter(p => p.id !== id));
  };

  const handleRoleChange = (participantId: string, role: string) => {
    onParticipantsChange(
      participants.map(p =>
        p.id === participantId ? { ...p, role } : p,
      ),
    );
  };

  const handleToggleMemory = (memoryId: string) => {
    if (selectedMemoryIds.includes(memoryId)) {
      onMemoryIdsChange(selectedMemoryIds.filter(id => id !== memoryId));
    } else {
      onMemoryIdsChange([...selectedMemoryIds, memoryId]);
    }
  };

  const getModelDetails = (modelId: string) => {
    return AI_MODELS.find(m => m.modelId === modelId);
  };

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="end" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Settings2 className="size-5" />
            Advanced Configuration
          </SheetTitle>
          <SheetDescription>
            Configure AI participants, assign roles, and attach memories
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-120px)] mt-6">
          <div className="space-y-6 pr-4">
            {/* Participants Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">
                  AI Participants (
                  {participants.length}
                  )
                </Label>
                <Popover open={modelSelectorOpen} onOpenChange={setModelSelectorOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <Plus className="size-4" />
                      Add Model
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-80" align="end">
                    <Command>
                      <CommandInput placeholder="Search models..." />
                      <CommandList>
                        <CommandEmpty>No models found.</CommandEmpty>
                        <CommandGroup heading="Available Models">
                          {accessibleModels.map(model => (
                            <CommandItem
                              key={model.id}
                              value={model.id}
                              onSelect={() => handleAddParticipant(model)}
                              className="gap-2"
                            >
                              <div className="flex-1">
                                <div className="font-medium">{model.name}</div>
                                <div className="text-xs text-muted-foreground line-clamp-1">
                                  {model.description}
                                </div>
                              </div>
                              <Badge variant="secondary" className="text-xs">
                                {model.metadata.category}
                              </Badge>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Participant List */}
              <div className="space-y-2">
                {participants.length === 0
                  ? (
                      <div className="text-sm text-muted-foreground text-center py-8 border rounded-md">
                        No participants added yet. Click "Add Model" to get started.
                      </div>
                    )
                  : (
                      participants.map((participant, index) => {
                        const model = getModelDetails(participant.modelId);
                        return (
                          <div
                            key={participant.id}
                            className="flex items-center gap-2 p-3 border rounded-lg bg-background"
                          >
                            <div className="cursor-grab">
                              <GripVertical className="size-4 text-muted-foreground" />
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-medium truncate">
                                  {model?.name || participant.modelId}
                                </span>
                                <Badge variant="outline" className="text-xs">
                                  #
                                  {index + 1}
                                </Badge>
                              </div>

                              <Select
                                value={participant.role}
                                onValueChange={value => handleRoleChange(participant.id, value)}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder="Select role" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectGroup>
                                    <SelectLabel>Default Roles</SelectLabel>
                                    {DEFAULT_ROLES.map(role => (
                                      <SelectItem key={role} value={role} className="text-xs">
                                        {role}
                                      </SelectItem>
                                    ))}
                                  </SelectGroup>
                                  {customRoles.length > 0 && (
                                    <SelectGroup>
                                      <SelectLabel>Custom Roles</SelectLabel>
                                      {customRoles.map(role => (
                                        <SelectItem key={role.id} value={role.name} className="text-xs">
                                          {role.name}
                                        </SelectItem>
                                      ))}
                                    </SelectGroup>
                                  )}
                                </SelectContent>
                              </Select>
                            </div>

                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              onClick={() => handleRemoveParticipant(participant.id)}
                            >
                              <X className="size-4" />
                            </Button>
                          </div>
                        );
                      })
                    )}
              </div>
            </div>

            {/* Memories Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">
                  Memories (
                  {selectedMemoryIds.length}
                  )
                </Label>
                <Popover open={memorySelectorOpen} onOpenChange={setMemorySelectorOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <Sparkles className="size-4" />
                      Attach Memory
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-80" align="end">
                    <Command>
                      <CommandInput placeholder="Search memories..." />
                      <CommandList>
                        <CommandEmpty>No memories found.</CommandEmpty>
                        <CommandGroup heading="Your Memories">
                          {memories.map(memory => (
                            <CommandItem
                              key={memory.id}
                              value={memory.id}
                              onSelect={() => {
                                handleToggleMemory(memory.id);
                                setMemorySelectorOpen(false);
                              }}
                              className={cn(
                                'gap-2',
                                selectedMemoryIds.includes(memory.id) && 'bg-accent',
                              )}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="font-medium truncate">{memory.title}</div>
                                {memory.description && (
                                  <div className="text-xs text-muted-foreground line-clamp-1">
                                    {memory.description}
                                  </div>
                                )}
                              </div>
                              <Badge variant="secondary" className="text-xs">
                                {memory.type}
                              </Badge>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Selected Memories */}
              {selectedMemories.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedMemories.map(memory => (
                    <Badge key={memory.id} variant="secondary" className="gap-1">
                      {memory.title}
                      <button
                        type="button"
                        onClick={() => handleToggleMemory(memory.id)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
