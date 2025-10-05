'use client';

import { Bot, Check, GripVertical, Plus, Trash2 } from 'lucide-react';
import { motion, Reorder, useDragControls } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

import type { ParticipantConfig } from '@/components/chat/chat-config-sheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useCreateCustomRoleMutation, useDeleteCustomRoleMutation } from '@/hooks/mutations/chat-mutations';
import { useCustomRolesQuery } from '@/hooks/queries/chat-roles';
import type { AIModel } from '@/lib/ai/models-config';
import { AI_MODELS, DEFAULT_ROLES } from '@/lib/ai/models-config';
import { cn } from '@/lib/ui/cn';
import { chatGlass } from '@/lib/ui/glassmorphism';

// ============================================================================
// Types
// ============================================================================

type ChatParticipantsListProps = {
  participants: ParticipantConfig[];
  onParticipantsChange: (participants: ParticipantConfig[]) => void;
  className?: string;
};

// Extended model type to track order in the unified list
type OrderedModel = {
  model: AIModel;
  participant: ParticipantConfig | null;
  order: number;
};

// ============================================================================
// Role Selector Popover with Custom Role Creation
// ============================================================================

function RoleSelector({
  participant,
  customRoles,
  onRoleChange,
  onClearRole,
}: {
  participant: ParticipantConfig;
  customRoles: Array<{ id: string; name: string; description: string | null }>;
  onRoleChange: (role: string, customRoleId?: string) => void;
  onClearRole: () => void;
}) {
  const [rolePopoverOpen, setRolePopoverOpen] = useState(false);
  const [roleSearchQuery, setRoleSearchQuery] = useState('');

  const createRoleMutation = useCreateCustomRoleMutation();
  const deleteRoleMutation = useDeleteCustomRoleMutation();
  const hasRole = Boolean(participant.role);

  // Combine all existing roles for checking duplicates
  const allRoles = [
    ...DEFAULT_ROLES,
    ...customRoles.map(r => r.name),
  ];

  // Check if the search query is a new role name
  const isNewRole = roleSearchQuery.trim()
    && !allRoles.some(role => role.toLowerCase() === roleSearchQuery.trim().toLowerCase());

  const handleSelectRole = (roleName: string, customRoleId?: string) => {
    onRoleChange(roleName, customRoleId);
    setRolePopoverOpen(false);
    setRoleSearchQuery('');
  };

  const handleCreateRole = async (roleName: string) => {
    try {
      const result = await createRoleMutation.mutateAsync({
        json: {
          name: roleName,
          systemPrompt: `You are a ${roleName} assistant.`,
        },
      });

      if (result.success && result.data?.customRole) {
        // Auto-select the newly created role (mutation auto-invalidates query)
        handleSelectRole(result.data.customRole.name, result.data.customRole.id);

        // Clear search query
        setRoleSearchQuery('');
      }
    } catch (error) {
      console.error('Failed to create custom role:', error);
    }
  };

  const handleDeleteRole = async (roleId: string, roleName: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent selecting the role when clicking delete

    try {
      await deleteRoleMutation.mutateAsync(roleId);

      // If the deleted role was the currently selected role, clear it
      if (participant.customRoleId === roleId || participant.role === roleName) {
        onClearRole();
      }
      // Mutation auto-invalidates query - no manual refetch needed
    } catch (error) {
      console.error('Failed to delete custom role:', error);
    }
  };

  // If no role assigned, show "+ Role" button
  if (!hasRole) {
    return (
      <>
        <Popover open={rolePopoverOpen} onOpenChange={setRolePopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs px-2 text-muted-foreground hover:text-foreground"
            >
              + Role
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0" align="end" side="right">
            <Command>
              <CommandInput
                placeholder="Search or create role..."
                className="h-9"
                value={roleSearchQuery}
                onValueChange={setRoleSearchQuery}
              />
              <CommandList>
                {/* Default Roles */}
                <CommandGroup heading="Default Roles">
                  {DEFAULT_ROLES.map(role => (
                    <CommandItem
                      key={role}
                      value={role}
                      onSelect={() => handleSelectRole(role, undefined)}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          participant.role === role ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      {role}
                    </CommandItem>
                  ))}
                </CommandGroup>

                {/* Custom Roles */}
                {customRoles.length > 0 && (
                  <>
                    <CommandSeparator />
                    <CommandGroup heading="Custom Roles">
                      {customRoles.map(role => (
                        <CommandItem
                          key={role.id}
                          value={role.name}
                          onSelect={() => handleSelectRole(role.name, role.id)}
                          className="group"
                        >
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4 flex-shrink-0',
                              participant.customRoleId === role.id ? 'opacity-100' : 'opacity-0',
                            )}
                          />
                          <div className="flex flex-col flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium">{role.name}</span>
                              <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">Custom</Badge>
                            </div>
                            {role.description && (
                              <span className="text-xs text-muted-foreground line-clamp-1">
                                {role.description}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={e => handleDeleteRole(role.id, role.name, e)}
                            disabled={deleteRoleMutation.isPending}
                            className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-sm hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                          >
                            {deleteRoleMutation.isPending
                              ? (
                                  <div className="size-3.5 animate-spin rounded-full border-2 border-destructive border-t-transparent" />
                                )
                              : (
                                  <Trash2 className="size-3.5" />
                                )}
                          </button>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </>
                )}

                {/* Create New Role Option - Conditional */}
                {isNewRole && (
                  <>
                    <CommandSeparator />
                    <CommandGroup heading="Create">
                      <CommandItem
                        value={roleSearchQuery}
                        onSelect={() => handleCreateRole(roleSearchQuery.trim())}
                        className="gap-2 text-primary"
                        disabled={createRoleMutation.isPending}
                      >
                        {createRoleMutation.isPending
                          ? (
                              <>
                                <div className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                <span>Creating...</span>
                              </>
                            )
                          : (
                              <>
                                <Plus className="size-4" />
                                <span>
                                  Create "
                                  {roleSearchQuery.trim()}
                                  "
                                </span>
                              </>
                            )}
                      </CommandItem>
                    </CommandGroup>
                  </>
                )}

                <CommandEmpty>No roles found.</CommandEmpty>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </>
    );
  }

  // If role is assigned, show role as chip with integrated X button
  return (
    <div className="flex items-center gap-1">
      <Popover open={rolePopoverOpen} onOpenChange={setRolePopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="secondary"
            size="sm"
            className="h-6 text-xs px-2 pr-1 rounded-full gap-1 hover:bg-secondary"
          >
            <span>{participant.role}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClearRole();
              }}
              className="ml-0.5 rounded-full hover:bg-destructive/10 hover:text-destructive p-0.5 transition-colors"
            >
              <Plus className="size-3 rotate-45" />
            </button>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="end" side="right">
          <Command>
            <CommandInput
              placeholder="Search or create role..."
              className="h-9"
              value={roleSearchQuery}
              onValueChange={setRoleSearchQuery}
            />
            <CommandList>
              {/* Default Roles */}
              <CommandGroup heading="Default Roles">
                {DEFAULT_ROLES.map(role => (
                  <CommandItem
                    key={role}
                    value={role}
                    onSelect={() => handleSelectRole(role, undefined)}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        participant.role === role ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    {role}
                  </CommandItem>
                ))}
              </CommandGroup>

              {/* Custom Roles */}
              {customRoles.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Custom Roles">
                    {customRoles.map(role => (
                      <CommandItem
                        key={role.id}
                        value={role.name}
                        onSelect={() => handleSelectRole(role.name, role.id)}
                        className="group"
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4 flex-shrink-0',
                            participant.customRoleId === role.id ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        <div className="flex flex-col flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium">{role.name}</span>
                            <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">Custom</Badge>
                          </div>
                          {role.description && (
                            <span className="text-xs text-muted-foreground line-clamp-1">
                              {role.description}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={e => handleDeleteRole(role.id, role.name, e)}
                          disabled={deleteRoleMutation.isPending}
                          className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-sm hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                        >
                          {deleteRoleMutation.isPending
                            ? (
                                <div className="size-3.5 animate-spin rounded-full border-2 border-destructive border-t-transparent" />
                              )
                            : (
                                <Trash2 className="size-3.5" />
                              )}
                        </button>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}

              {/* Create New Role Option - Conditional */}
              {isNewRole && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Create">
                    <CommandItem
                      value={roleSearchQuery}
                      onSelect={() => handleCreateRole(roleSearchQuery.trim())}
                      className="gap-2 text-primary"
                      disabled={createRoleMutation.isPending}
                    >
                      {createRoleMutation.isPending
                        ? (
                            <>
                              <div className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                              <span>Creating...</span>
                            </>
                          )
                        : (
                            <>
                              <Plus className="size-4" />
                              <span>
                                Create "
                                {roleSearchQuery.trim()}
                                "
                              </span>
                            </>
                          )}
                    </CommandItem>
                  </CommandGroup>
                </>
              )}

              <CommandEmpty>No roles found.</CommandEmpty>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ============================================================================
// Unified Model Item (Reorderable and Selectable)
// ============================================================================

function ModelItem({
  orderedModel,
  customRoles,
  onToggle,
  onRoleChange,
  onClearRole,
}: {
  orderedModel: OrderedModel;
  customRoles: Array<{ id: string; name: string; description: string | null }>;
  onToggle: () => void;
  onRoleChange: (role: string, customRoleId?: string) => void;
  onClearRole: () => void;
}) {
  const controls = useDragControls();
  const { model, participant } = orderedModel;
  const isSelected = participant !== null;

  return (
    <Reorder.Item
      value={orderedModel}
      dragListener={false}
      dragControls={controls}
      className="relative"
    >
      <div className="px-2 py-2 border-b last:border-0 hover:bg-accent/50 transition-colors">
        <div className="flex items-center gap-2">
          {/* Drag Handle */}
          <button
            type="button"
            className="cursor-grab active:cursor-grabbing touch-none flex-shrink-0 text-muted-foreground hover:text-foreground p-0.5"
            onPointerDown={e => controls.start(e)}
            style={{ touchAction: 'none' }}
            aria-label="Drag to reorder"
            onClick={e => e.stopPropagation()}
          >
            <GripVertical className="size-4" />
          </button>

          {/* Checkbox for Selection */}
          <Checkbox
            checked={isSelected}
            onCheckedChange={onToggle}
            className="size-4 flex-shrink-0"
            onClick={e => e.stopPropagation()}
          />

          {/* Clickable Row Content - triggers checkbox toggle */}
          <div
            role="button"
            tabIndex={0}
            className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"
            onClick={() => onToggle()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onToggle();
              }
            }}
          >
            {/* Model Avatar and Name */}
            <Avatar className="size-8 flex-shrink-0">
              <AvatarImage src={model.metadata.icon} alt={model.name} />
              <AvatarFallback className="text-xs">
                {model.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{model.name}</div>
              <div className="text-xs text-muted-foreground truncate">
                {model.description}
              </div>
            </div>
          </div>

          {/* Role Selector - shown only for selected models */}
          {isSelected && participant && (
            <div
              role="presentation"
              onClick={e => e.stopPropagation()}
            >
              <RoleSelector
                participant={participant}
                customRoles={customRoles}
                onRoleChange={onRoleChange}
                onClearRole={onClearRole}
              />
            </div>
          )}
        </div>
      </div>
    </Reorder.Item>
  );
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * ChatParticipantsList - Simplified AI model participant selector
 *
 * Features:
 * - Single unified list with ALL models
 * - Checkboxes for selection
 * - All items are reorderable (selected and unselected)
 * - Inline role assignment for selected models only
 * - Simplified UI with no separate groups
 *
 * Following shadcn MCP pattern with ultra-simplified design
 */
export function ChatParticipantsList({
  participants,
  onParticipantsChange,
  className,
}: ChatParticipantsListProps) {
  const [open, setOpen] = useState(false);
  const [modelSearchQuery, setModelSearchQuery] = useState('');

  // Fetch custom roles - always enabled when authenticated for real-time updates
  const { data: customRolesData } = useCustomRolesQuery();

  const customRoles = customRolesData?.pages.flatMap(page =>
    (page?.success && page.data?.items) ? page.data.items : [],
  ) || [];

  // Create a unified list of all models with their order
  // Selected models maintain their participant order, unselected go to the end
  const [orderedModels, setOrderedModels] = useState<OrderedModel[]>(() => {
    const selectedModels: OrderedModel[] = participants
      .sort((a, b) => a.order - b.order)
      .map((p, index) => ({
        model: AI_MODELS.find(m => m.modelId === p.modelId)!,
        participant: p,
        order: index,
      }))
      .filter(om => om.model);

    const selectedIds = new Set(participants.map(p => p.modelId));
    const unselectedModels: OrderedModel[] = AI_MODELS
      .filter(m => m.isEnabled && !selectedIds.has(m.modelId))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((m, index) => ({
        model: m,
        participant: null,
        order: selectedModels.length + index,
      }));

    return [...selectedModels, ...unselectedModels];
  });

  // Sync orderedModels when participants change externally
  // Preserve existing order to allow dragging unselected models
  useEffect(() => {
    setOrderedModels((currentOrder) => {
      const participantMap = new Map(participants.map(p => [p.modelId, p]));

      // Update existing models with new participant references
      const updatedModels = currentOrder.map(om => ({
        ...om,
        participant: participantMap.get(om.model.modelId) || null,
      }));

      // Find any new models that aren't in currentOrder yet
      const existingIds = new Set(updatedModels.map(om => om.model.modelId));
      const newModels = AI_MODELS
        .filter(m => m.isEnabled && !existingIds.has(m.modelId))
        .map(m => ({
          model: m,
          participant: participantMap.get(m.modelId) || null,
          order: updatedModels.length,
        }));

      return [...updatedModels, ...newModels];
    });
  }, [participants]);

  // Toggle model selection
  const handleToggleModel = (modelId: string) => {
    const orderedModel = orderedModels.find(om => om.model.modelId === modelId);
    if (!orderedModel)
      return;

    if (orderedModel.participant) {
      // Deselect - remove from participants
      const filtered = participants.filter(p => p.id !== orderedModel.participant!.id);
      const reindexed = filtered.map((p, index) => ({ ...p, order: index }));
      onParticipantsChange(reindexed);
    } else {
      // Select - add to participants without role by default
      const newParticipant: ParticipantConfig = {
        id: `participant-${Date.now()}`,
        modelId,
        role: '', // No role by default
        order: participants.length,
      };
      onParticipantsChange([...participants, newParticipant]);
    }
  };

  // Update role for a participant
  const handleRoleChange = (modelId: string, role: string, customRoleId?: string) => {
    onParticipantsChange(
      participants.map(p =>
        p.modelId === modelId ? { ...p, role, customRoleId } : p,
      ),
    );
  };

  // Clear role for a participant
  const handleClearRole = (modelId: string) => {
    onParticipantsChange(
      participants.map(p =>
        p.modelId === modelId ? { ...p, role: '', customRoleId: undefined } : p,
      ),
    );
  };

  // Handle reordering of the unified list
  const handleReorder = (newOrder: OrderedModel[]) => {
    setOrderedModels(newOrder);

    // Extract selected participants and update their order
    const selectedParticipants = newOrder
      .filter(om => om.participant !== null)
      .map((om, index) => ({
        ...om.participant!,
        order: index,
      }));

    onParticipantsChange(selectedParticipants);
  };

  // Filter models based on search query
  const filteredModels = orderedModels.filter(om =>
    om.model.name.toLowerCase().includes(modelSearchQuery.toLowerCase())
    || om.model.description.toLowerCase().includes(modelSearchQuery.toLowerCase())
    || om.model.metadata.category.toLowerCase().includes(modelSearchQuery.toLowerCase()),
  );

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {/* Add AI Button with Count Badge */}
      <TooltipProvider>
        <Popover open={open} onOpenChange={setOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 sm:h-9 rounded-full gap-1.5 sm:gap-2 text-xs relative px-3 sm:px-4"
                >
                  <Bot className="size-3.5 sm:size-4" />
                  <span className="hidden xs:inline sm:inline">AI Models</span>
                  {participants.length > 0 && (
                    <Badge variant="default" className="ml-1 sm:ml-1.5 size-5 sm:size-6 flex items-center justify-center p-0 text-[10px] sm:text-xs">
                      {participants.length}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>

            {/* Tooltip showing participant details */}
            {participants.length > 0 && (
              <TooltipContent side="top" className="max-w-xs">
                <div className="space-y-1">
                  <div className="font-semibold text-xs">Selected Models:</div>
                  {participants
                    .sort((a, b) => a.order - b.order)
                    .map((participant) => {
                      const model = AI_MODELS.find(m => m.modelId === participant.modelId);
                      if (!model)
                        return null;

                      return (
                        <div key={participant.id} className="flex items-center gap-2 text-xs">
                          <Avatar className="size-4">
                            <AvatarImage src={model.metadata.icon} alt={model.name} />
                          </Avatar>
                          <span className="font-medium">{model.name}</span>
                          {participant.role && (
                            <span className="text-muted-foreground">
                              •
                              {' '}
                              {participant.role}
                            </span>
                          )}
                        </div>
                      );
                    })}
                </div>
              </TooltipContent>
            )}
          </Tooltip>

          <PopoverContent className="p-0 w-[480px]" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Search AI models..."
                className="h-9"
                value={modelSearchQuery}
                onValueChange={setModelSearchQuery}
              />
              <CommandList>
                {filteredModels.length === 0 && (
                  <CommandEmpty>No models found.</CommandEmpty>
                )}

                {/* Unified Reorderable List - All Models */}
                {filteredModels.length > 0 && (
                  <Reorder.Group
                    axis="y"
                    values={filteredModels}
                    onReorder={handleReorder}
                    className="space-y-0"
                    as="div"
                  >
                    {filteredModels.map(orderedModel => (
                      <ModelItem
                        key={orderedModel.model.id}
                        orderedModel={orderedModel}
                        customRoles={customRoles}
                        onToggle={() => handleToggleModel(orderedModel.model.modelId)}
                        onRoleChange={(role, customRoleId) => handleRoleChange(orderedModel.model.modelId, role, customRoleId)}
                        onClearRole={() => handleClearRole(orderedModel.model.modelId)}
                      />
                    ))}
                  </Reorder.Group>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </TooltipProvider>
    </div>
  );
}

// ============================================================================
// Participants Preview (External - above chat box)
// ============================================================================

export function ParticipantsPreview({
  participants,
  isStreaming,
  currentParticipantIndex,
  className,
  chatMessages,
}: {
  participants: ParticipantConfig[];
  isStreaming?: boolean;
  currentParticipantIndex?: number;
  className?: string;
  chatMessages?: Array<{ participantId?: string | null; [key: string]: unknown }>;
}) {
  // Track which participants just completed streaming (for flash animation)
  const [justCompletedSet, setJustCompletedSet] = useState<Set<string>>(() => new Set());
  const previousStreamingRef = useRef(isStreaming);
  const previousParticipantIndexRef = useRef(currentParticipantIndex);

  // Detect when a participant just finished streaming
  useEffect(() => {
    const wasStreaming = previousStreamingRef.current;
    const previousIndex = previousParticipantIndexRef.current;

    // Update refs for next comparison
    previousStreamingRef.current = isStreaming;
    previousParticipantIndexRef.current = currentParticipantIndex;

    // Streaming just stopped - mark the last streaming participant as "just completed"
    if (wasStreaming && !isStreaming && previousIndex !== undefined) {
      const completedParticipant = participants[previousIndex];
      if (completedParticipant) {
        setJustCompletedSet(prev => new Set(prev).add(completedParticipant.id));

        // Auto-remove from "just completed" after animation duration (1.5s)
        const timeoutId = setTimeout(() => {
          setJustCompletedSet((prev) => {
            const next = new Set(prev);
            next.delete(completedParticipant.id);
            return next;
          });
        }, 1500);

        return () => clearTimeout(timeoutId);
      }
    }

    return undefined;
  }, [isStreaming, currentParticipantIndex, participants]);

  if (participants.length === 0) {
    return null;
  }

  return (
    <div className={cn('flex items-center gap-2 flex-wrap', className)}>
      {participants
        .sort((a, b) => a.order - b.order)
        .map((participant, index) => {
          const model = AI_MODELS.find(m => m.modelId === participant.modelId);
          if (!model)
            return null;

          // Check if this model has any messages in the chat
          const hasMessages = chatMessages?.some(msg => msg.participantId === participant.id) ?? false;

          // Determine participant status during streaming - sequential turn-taking
          const isCurrentlyStreaming = isStreaming && currentParticipantIndex === index;
          const isNextInQueue = isStreaming && currentParticipantIndex !== undefined && index === currentParticipantIndex + 1;
          const isWaitingInQueue = isStreaming && currentParticipantIndex !== undefined && index > currentParticipantIndex;
          const isJustCompleted = justCompletedSet.has(participant.id);

          return (
            <motion.div
              key={participant.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{
                opacity: 1,
                scale: 1,
                // Smooth pulsing animation for currently streaming badge
                ...(isCurrentlyStreaming && {
                  boxShadow: [
                    '0 0 0 0px rgba(var(--primary-rgb, 59, 130, 246), 0.4)',
                    '0 0 0 8px rgba(var(--primary-rgb, 59, 130, 246), 0)',
                    '0 0 0 0px rgba(var(--primary-rgb, 59, 130, 246), 0)',
                  ],
                }),
                // Green flash animation for just completed
                ...(isJustCompleted && {
                  boxShadow: [
                    '0 0 0 0px rgba(34, 197, 94, 0.4)',
                    '0 0 0 6px rgba(34, 197, 94, 0)',
                  ],
                }),
              }}
              transition={{
                duration: 0.3,
                ease: [0.25, 0.1, 0.25, 1],
                ...(isCurrentlyStreaming && {
                  boxShadow: {
                    duration: 2,
                    repeat: Number.POSITIVE_INFINITY,
                    ease: 'easeInOut',
                  },
                }),
                ...(isJustCompleted && {
                  boxShadow: {
                    duration: 1,
                    ease: 'easeOut',
                  },
                }),
              }}
              className={cn(
                chatGlass.participantBadge,
                'flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1 sm:py-1.5 transition-colors duration-300 max-w-full',
                isCurrentlyStreaming && 'bg-primary/10 border-primary ring-1 ring-primary/30',
                isNextInQueue && 'bg-primary/5 border-primary/50',
                isWaitingInQueue && 'bg-background/10 opacity-60',
                isJustCompleted && 'bg-green-500/10 border-green-500 ring-1 ring-green-500/30',
                // Normal state when not streaming and has messages (no special styling)
                !isCurrentlyStreaming && !isNextInQueue && !isWaitingInQueue && !isJustCompleted && hasMessages && 'bg-background/10',
              )}
            >
              <Avatar className="size-5 sm:size-6 shrink-0">
                <AvatarImage src={model.metadata.icon} alt={model.name} />
                <AvatarFallback className="text-[10px]">
                  {model.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <span className="text-xs sm:text-sm font-medium truncate">{model.name}</span>

                  {/* Currently Streaming Indicator - Smooth pulsing dot */}
                  {isCurrentlyStreaming && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{
                        opacity: [0.5, 1, 0.5],
                        scale: [0.9, 1, 0.9],
                      }}
                      transition={{
                        duration: 1.5,
                        repeat: Number.POSITIVE_INFINITY,
                        ease: 'easeInOut',
                      }}
                      className="flex items-center gap-1 shrink-0"
                    >
                      <motion.div
                        animate={{
                          opacity: [0.6, 1, 0.6],
                        }}
                        transition={{
                          duration: 1.2,
                          repeat: Number.POSITIVE_INFINITY,
                          ease: 'easeInOut',
                        }}
                        className="size-1.5 sm:size-2 rounded-full bg-primary"
                      />
                      <span className="text-[10px] sm:text-xs text-primary font-medium whitespace-nowrap hidden sm:inline">Streaming</span>
                    </motion.div>
                  )}

                  {/* Next in Queue Indicator */}
                  {isNextInQueue && (
                    <motion.div
                      initial={{ opacity: 0, x: -5 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3 }}
                      className="flex items-center gap-1 shrink-0"
                    >
                      <motion.div
                        animate={{
                          opacity: [0.3, 0.7, 0.3],
                        }}
                        transition={{
                          duration: 2,
                          repeat: Number.POSITIVE_INFINITY,
                          ease: 'easeInOut',
                        }}
                        className="size-1.5 sm:size-2 rounded-full bg-primary/70"
                      />
                      <span className="text-[10px] sm:text-xs text-primary/70 font-medium whitespace-nowrap hidden sm:inline">Next</span>
                    </motion.div>
                  )}

                  {/* Waiting in Queue Indicator */}
                  {isWaitingInQueue && !isNextInQueue && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3 }}
                      className="text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap hidden sm:inline"
                    >
                      Waiting
                    </motion.span>
                  )}

                  {/* Just Completed Flash Animation - Brief green checkmark */}
                  {isJustCompleted && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0 }}
                      transition={{ duration: 0.3, ease: 'backOut' }}
                      className="flex items-center gap-1 shrink-0"
                    >
                      <Check className="size-3 sm:size-3.5 text-green-500" />
                      <span className="text-[10px] sm:text-xs text-green-500 font-medium whitespace-nowrap hidden sm:inline">Complete</span>
                    </motion.div>
                  )}
                </div>
                {participant.role && (
                  <span className="text-[10px] sm:text-xs text-muted-foreground truncate">{participant.role}</span>
                )}
              </div>
            </motion.div>
          );
        })}
    </div>
  );
}
