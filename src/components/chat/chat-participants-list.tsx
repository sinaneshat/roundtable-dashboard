'use client';

import type { UIMessage } from 'ai';
import { Bot, Check, GripVertical, Plus, Trash2 } from 'lucide-react';
import { motion, Reorder, useDragControls } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ============================================================================
// Types - ✅ Inferred from Backend Schema (Zero Hardcoding)
// ============================================================================
import type { ChatCustomRole } from '@/api/routes/chat/schema';
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
import type { SubscriptionTier } from '@/db/tables/usage';
import { useCreateCustomRoleMutation, useDeleteCustomRoleMutation } from '@/hooks/mutations/chat-mutations';
import { useCustomRolesQuery } from '@/hooks/queries/chat-roles';
import { useUsageStatsQuery } from '@/hooks/queries/usage';
import type { MessageMetadata } from '@/lib/ai/message-helpers';
import type { AIModel } from '@/lib/ai/models-config';
import { AI_MODELS, canAccessModel, DEFAULT_ROLES, getModelById, getTierDisplayName } from '@/lib/ai/models-config';
import type { ParticipantConfig } from '@/lib/schemas/chat-forms';
import { toastManager } from '@/lib/toast/toast-manager';
import { cn } from '@/lib/ui/cn';
import { getApiErrorMessage } from '@/lib/utils/error-handling';

type ChatParticipantsListProps = {
  participants: ParticipantConfig[];
  onParticipantsChange: (participants: ParticipantConfig[]) => void;
  className?: string;
  isStreaming?: boolean; // Disable queries during streaming to prevent excessive refetches
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
  customRoles: ChatCustomRole[]; // ✅ Using backend schema type
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
        // Success is obvious from the role appearing in the list - no toast needed
      }
    } catch (error) {
      const errorMessage = getApiErrorMessage(error, 'Failed to create custom role');
      toastManager.error('Failed to create role', errorMessage);
    }
  };

  const handleDeleteRole = async (roleId: string, roleName: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent selecting the role when clicking delete

    try {
      const result = await deleteRoleMutation.mutateAsync(roleId);

      if (result.success) {
        // If the deleted role was the currently selected role, clear it
        if (participant.customRoleId === roleId || participant.role === roleName) {
          onClearRole();
        }
        // Success is obvious from the role disappearing - no toast needed
        // Mutation auto-invalidates query - no manual refetch needed
      }
    } catch (error) {
      const errorMessage = getApiErrorMessage(error, 'Failed to delete custom role');
      toastManager.error('Failed to delete role', errorMessage);
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
              className="h-6 text-xs px-2 text-muted-foreground hover:text-foreground rounded-lg"
            >
              + Role
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[calc(100vw-2rem)] max-w-[320px] sm:w-64 p-0" align="start" side="bottom" sideOffset={4}>
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
                            className="ml-2 opacity-60 sm:opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-sm hover:bg-destructive/10 hover:text-destructive disabled:opacity-50 flex-shrink-0"
                            aria-label="Delete custom role"
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
            className="h-6 text-xs px-2 pr-1 rounded-lg gap-1 hover:bg-secondary"
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
        <PopoverContent className="w-[calc(100vw-2rem)] max-w-[320px] sm:w-64 p-0" align="start" side="bottom" sideOffset={4}>
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
                          className="ml-2 opacity-60 sm:opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-sm hover:bg-destructive/10 hover:text-destructive disabled:opacity-50 flex-shrink-0"
                          aria-label="Delete custom role"
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
  isLastParticipant,
  userTier,
}: {
  orderedModel: OrderedModel;
  customRoles: ChatCustomRole[]; // ✅ Using backend schema type
  onToggle: () => void;
  onRoleChange: (role: string, customRoleId?: string) => void;
  onClearRole: () => void;
  isLastParticipant: boolean;
  userTier: SubscriptionTier;
}) {
  const controls = useDragControls();
  const { model, participant } = orderedModel;
  const isSelected = participant !== null;
  const isAccessible = canAccessModel(userTier, model.modelId);
  const isDisabledDueToTier = !isAccessible;
  const isDisabledDueToLastParticipant = isSelected && isLastParticipant;
  const isDisabled = isDisabledDueToTier || isDisabledDueToLastParticipant;

  // Create upgrade tooltip content
  const upgradeTooltipContent = isDisabledDueToTier
    ? `Upgrade to ${getTierDisplayName(model.minTier)} to access this model`
    : undefined;

  return (
    <Reorder.Item
      value={orderedModel}
      dragListener={false}
      dragControls={controls}
      className="relative"
    >
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'px-2 py-2 border-b last:border-0 transition-colors',
              !isDisabledDueToTier && 'hover:bg-accent/50',
              isDisabledDueToTier && 'opacity-50 cursor-not-allowed',
            )}
          >
            <div className="flex items-center gap-2">
              {/* Drag Handle - Always visible, but only interactive when enabled */}
              <div
                className={cn(
                  'flex-shrink-0 text-muted-foreground p-0.5',
                  !isDisabledDueToTier && 'cursor-grab active:cursor-grabbing hover:text-foreground touch-none',
                  isDisabledDueToTier && 'cursor-not-allowed opacity-30',
                )}
                onPointerDown={isDisabledDueToTier ? undefined : e => controls.start(e)}
                style={isDisabledDueToTier ? undefined : { touchAction: 'none' }}
                aria-label={isDisabledDueToTier ? 'Drag disabled - upgrade required' : 'Drag to reorder'}
                onClick={e => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (!isDisabledDueToTier && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                  }
                }}
                role="button"
                tabIndex={isDisabledDueToTier ? -1 : 0}
              >
                <GripVertical className="size-4" />
              </div>

              {/* Checkbox for Selection */}
              <Checkbox
                checked={isSelected}
                onCheckedChange={isDisabled ? undefined : onToggle}
                disabled={isDisabled}
                className="size-4 flex-shrink-0"
                onClick={e => e.stopPropagation()}
                title={isDisabledDueToLastParticipant ? 'At least one participant is required' : undefined}
              />

              {/* Clickable Row Content - triggers checkbox toggle */}
              <div
                role="button"
                tabIndex={isDisabledDueToTier ? -1 : 0}
                className={cn(
                  'flex items-center gap-2 flex-1 min-w-0',
                  !isDisabledDueToTier && 'cursor-pointer',
                  isDisabledDueToTier && 'cursor-not-allowed',
                )}
                onClick={isDisabledDueToTier ? undefined : () => onToggle()}
                onKeyDown={
                  isDisabledDueToTier
                    ? undefined
                    : (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onToggle();
                        }
                      }
                }
              >
                {/* Model Avatar and Name */}
                <Avatar className="size-8 flex-shrink-0">
                  <AvatarImage src={model.metadata.icon} alt={model.name} />
                  <AvatarFallback className="text-xs">
                    {model.name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate flex items-center gap-2">
                    {model.name}
                    {isDisabledDueToTier && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                        {getTierDisplayName(model.minTier)}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {model.description}
                  </div>
                </div>
              </div>

              {/* Role Selector - shown only for selected models */}
              {isSelected && participant && !isDisabledDueToTier && (
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
        </TooltipTrigger>
        {upgradeTooltipContent && (
          <TooltipContent side="right" className="max-w-xs">
            <p className="text-sm font-medium">{upgradeTooltipContent}</p>
            <p className="text-xs text-muted-foreground mt-1">
              View pricing plans to upgrade your account
            </p>
          </TooltipContent>
        )}
      </Tooltip>
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
  isStreaming = false,
}: ChatParticipantsListProps) {
  const [open, setOpen] = useState(false);
  const [modelSearchQuery, setModelSearchQuery] = useState('');

  // Only fetch when popover is open (not on page load)
  const { data: customRolesData } = useCustomRolesQuery(open && !isStreaming);
  const { data: usageData } = useUsageStatsQuery();

  const customRoles = customRolesData?.pages.flatMap(page =>
    (page?.success && page.data?.items) ? page.data.items : [],
  ) || [];

  // Get user's subscription tier for filtering models
  const userTier = (usageData?.success ? usageData.data.subscription.tier : 'free') as SubscriptionTier;

  // Get ALL enabled models (not just accessible ones) - memoized to prevent infinite loops
  const allEnabledModels = useMemo(() => AI_MODELS.filter(m => m.isEnabled), []);

  // Create a unified list of all models with their order
  // Selected models maintain their participant order, unselected go to the end
  // Now showing ALL models (both accessible and inaccessible)
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
    const unselectedModels: OrderedModel[] = allEnabledModels
      .filter(m => !selectedIds.has(m.modelId))
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
  // OFFICIAL AI SDK PATTERN: Only update state when data actually changes (not just reference)
  // CRITICAL FIX: Check for changes BEFORE creating new objects to prevent infinite re-renders
  useEffect(() => {
    const participantMap = new Map(participants.map(p => [p.modelId, p]));

    setOrderedModels((currentOrder) => {
      // STEP 1: Check if any participant references changed (efficient check first)
      let hasParticipantChanges = false;
      for (const om of currentOrder) {
        const newParticipant = participantMap.get(om.model.modelId) || null;
        if (om.participant !== newParticipant) {
          hasParticipantChanges = true;
          break;
        }
      }

      // STEP 2: Check for new models that need to be added
      const existingIds = new Set(currentOrder.map(om => om.model.modelId));
      const hasNewModels = allEnabledModels.some(m => !existingIds.has(m.modelId));

      // STEP 3: If nothing changed, return same reference (prevents re-render)
      if (!hasParticipantChanges && !hasNewModels) {
        return currentOrder;
      }

      // STEP 4: Only now create new objects since we know something changed
      const updatedModels = currentOrder.map(om => ({
        ...om,
        participant: participantMap.get(om.model.modelId) || null,
      }));

      // STEP 5: Add new models if any exist
      if (!hasNewModels) {
        return updatedModels;
      }

      const newModels = allEnabledModels
        .filter(m => !existingIds.has(m.modelId))
        .map((m, index) => ({
          model: m,
          participant: participantMap.get(m.modelId) || null,
          order: updatedModels.length + index,
        }));

      return [...updatedModels, ...newModels];
    });
  }, [participants, allEnabledModels]);

  // Toggle model selection
  const handleToggleModel = (modelId: string) => {
    const orderedModel = orderedModels.find(om => om.model.modelId === modelId);
    if (!orderedModel)
      return;

    // Check if user has access to this model (only for selection, allow deselection)
    if (!orderedModel.participant && !canAccessModel(userTier, modelId)) {
      // Prevent selection of models user doesn't have access to
      return;
    }

    if (orderedModel.participant) {
      // Deselect - remove from participants (but prevent removing the last one)
      if (participants.length <= 1) {
        return; // Must have at least one participant
      }
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
                  className="h-8 sm:h-9 rounded-lg gap-1.5 sm:gap-2 text-xs relative px-3 sm:px-4"
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
                      // Use getModelById which handles both full modelId and short id formats
                      const model = getModelById(participant.modelId);
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

          <PopoverContent className="p-0 w-[calc(100vw-2rem)] sm:w-[420px] lg:w-[480px]" align="start">
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
                        isLastParticipant={orderedModel.participant !== null && participants.length === 1}
                        userTier={userTier}
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
  chatMessages?: UIMessage[];
}) {
  // Track which participants just completed streaming (for flash animation)
  const [justCompletedSet, setJustCompletedSet] = useState<Set<string>>(() => new Set());
  const previousStreamingRef = useRef(isStreaming);
  const previousParticipantIndexRef = useRef(currentParticipantIndex);
  const timeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Handle just completed participant
  const handleJustCompleted = useCallback((participantId: string) => {
    setJustCompletedSet(prev => new Set(prev).add(participantId));

    // Clear any existing timeout for this participant
    const existingTimeout = timeoutsRef.current.get(participantId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Auto-remove from "just completed" after animation duration (1.5s)
    const timeoutId = setTimeout(() => {
      setJustCompletedSet((prev) => {
        const next = new Set(prev);
        next.delete(participantId);
        return next;
      });
      timeoutsRef.current.delete(participantId);
    }, 1500);

    timeoutsRef.current.set(participantId, timeoutId);
  }, []);

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
        handleJustCompleted(completedParticipant.id);
      }
    }
  }, [isStreaming, currentParticipantIndex, participants, handleJustCompleted]);

  // Cleanup all timeouts on unmount
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(timeout => clearTimeout(timeout));
      timeoutsRef.current.clear();
    };
  }, []);

  if (participants.length === 0) {
    return null;
  }

  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <div className="flex items-center gap-2 pb-2">
        {participants
          .sort((a, b) => a.order - b.order)
          .map((participant, index) => {
            // Use getModelById which handles both full modelId and short id formats
            const model = getModelById(participant.modelId);
            if (!model)
              return null;

            // Check if this model has any messages in the chat
            // participantId is stored in metadata by the message helper
            const hasMessages = chatMessages?.some((msg) => {
              const metadata = msg.metadata as MessageMetadata | undefined;
              return metadata?.participantId === participant.id;
            }) ?? false;

            // Determine participant status during streaming - sequential turn-taking
            const isCurrentlyStreaming = isStreaming && currentParticipantIndex === index;
            const isNextInQueue = isStreaming && currentParticipantIndex !== undefined && index === currentParticipantIndex + 1;
            const isWaitingInQueue = isStreaming && currentParticipantIndex !== undefined && index > currentParticipantIndex;
            const isJustCompleted = justCompletedSet.has(participant.id);

            return (
              <motion.div
                key={participant.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  duration: 0.3,
                  ease: [0.25, 0.1, 0.25, 1],
                }}
                className={cn(
                  'relative flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1 sm:py-1.5 shrink-0',
                  'backdrop-blur-md border rounded-lg shadow-md overflow-hidden',
                  // Default state
                  'bg-background/10 border-white/30 dark:border-white/20',
                  // Waiting states
                  isNextInQueue && 'border-primary/40',
                  isWaitingInQueue && 'opacity-60',
                  // Normal completed state
                  !isCurrentlyStreaming && !isNextInQueue && !isWaitingInQueue && !isJustCompleted && hasMessages && 'bg-background/10',
                )}
              >
                {/* Streaming background gradient animation - more subtle */}
                {isCurrentlyStreaming && (
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-br from-primary/15 via-primary/8 to-primary/3"
                    animate={{
                      opacity: [0.4, 0.7, 0.4],
                    }}
                    transition={{
                      duration: 2.5,
                      repeat: Number.POSITIVE_INFINITY,
                      ease: 'easeInOut',
                    }}
                  />
                )}

                {/* Completed flash - subtle green gradient pulse */}
                {isJustCompleted && (
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-br from-green-500/20 via-green-500/12 to-green-500/5"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 0.8, 0] }}
                    transition={{
                      duration: 1,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  />
                )}
                {/* Content layer (above background animations) */}
                <div className="relative z-10 flex items-center gap-1.5 sm:gap-2 w-full">
                  <Avatar className="size-4 sm:size-5 shrink-0">
                    <AvatarImage src={model.metadata.icon} alt={model.name} />
                    <AvatarFallback className="text-[8px] sm:text-[10px]">
                      {model.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <span className="text-[10px] sm:text-xs font-medium truncate whitespace-nowrap text-foreground/90">{model.name}</span>
                    </div>
                    {participant.role && (
                      <span className="text-[9px] sm:text-[10px] text-muted-foreground/70 truncate whitespace-nowrap">{participant.role}</span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
      </div>
    </div>
  );
}
