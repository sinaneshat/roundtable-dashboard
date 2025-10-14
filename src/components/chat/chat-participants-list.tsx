'use client';

import type { UIMessage } from 'ai';
import { Bot, Check, GripVertical, Lock, Plus, Trash2 } from 'lucide-react';
import { motion, Reorder, useDragControls } from 'motion/react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

// ============================================================================
// Types - ✅ Inferred from Backend Schema (Zero Hardcoding)
// ============================================================================
import type { ChatCustomRole } from '@/api/routes/chat/schema';
// ✅ ZOD-INFERRED TYPE: Import from schema (no hardcoded interfaces)
import type { BaseModelResponse } from '@/api/routes/models/schema';
import type { SubscriptionTier } from '@/api/services/product-logic.service';
import { getMaxModelsForTier, getTierName, getTiersInOrder, SUBSCRIPTION_TIER_NAMES } from '@/api/services/product-logic.service';
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
import { useModelsQuery } from '@/hooks/queries/models';
import { useUsageStatsQuery } from '@/hooks/queries/usage';
import { useFuzzySearch } from '@/hooks/utils/use-fuzzy-search';
import { DEFAULT_ROLES } from '@/lib/ai/models-config';
import { getProviderIcon } from '@/lib/ai/provider-icons';
import type { ParticipantConfig } from '@/lib/schemas/chat-forms';
import { toastManager } from '@/lib/toast/toast-manager';
import { cn } from '@/lib/ui/cn';
import { getApiErrorMessage } from '@/lib/utils/error-handling';

// UI Model Type: Backend type + UI-specific computed properties
type UIModel = BaseModelResponse & {
  modelId: string; // Alias for id
  minTier: SubscriptionTier; // ✅ SINGLE SOURCE: Alias for required_tier
  metadata: {
    icon: string;
    isAccessible: boolean;
    pricing: { input: string; output: string };
    category: string;
  };
};

type ChatParticipantsListProps = {
  participants: ParticipantConfig[];
  onParticipantsChange: (participants: ParticipantConfig[]) => void;
  className?: string;
  isStreaming?: boolean; // Disable queries during streaming to prevent excessive refetches
};

// Extended model type to track order in the unified list
type OrderedModel = {
  model: UIModel;
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
  onRequestSelection,
}: {
  participant: ParticipantConfig | null;
  customRoles: ChatCustomRole[]; // ✅ Using backend schema type
  onRoleChange: (role: string, customRoleId?: string) => void;
  onClearRole: () => void;
  onRequestSelection?: () => void; // Called when model needs to be selected first
}) {
  const [rolePopoverOpen, setRolePopoverOpen] = useState(false);
  const [roleSearchQuery, setRoleSearchQuery] = useState('');

  const createRoleMutation = useCreateCustomRoleMutation();
  const deleteRoleMutation = useDeleteCustomRoleMutation();
  const hasRole = Boolean(participant?.role);

  // Handle opening popover - select model first if needed
  const handleOpenChange = (open: boolean) => {
    if (open && !participant && onRequestSelection) {
      // Auto-select the model first
      onRequestSelection();
      // Wait a tick for the selection to complete, then open popover
      setTimeout(() => setRolePopoverOpen(true), 50);
      return;
    }
    setRolePopoverOpen(open);
  };

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
        if (participant?.customRoleId === roleId || participant?.role === roleName) {
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
        <Popover open={rolePopoverOpen} onOpenChange={handleOpenChange}>
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
                {/* Always show Create Custom Role button at the top */}
                <CommandGroup>
                  <CommandItem
                    onSelect={() => {
                      // Focus the search input to allow user to type the new role name
                      setRoleSearchQuery('');
                    }}
                    className="gap-2 text-primary font-medium"
                  >
                    <Plus className="size-4" />
                    <span>Create Custom Role</span>
                  </CommandItem>
                </CommandGroup>

                <CommandSeparator />

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
                          participant?.role === role ? 'opacity-100' : 'opacity-0',
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
                              participant?.customRoleId === role.id ? 'opacity-100' : 'opacity-0',
                            )}
                          />
                          <div className="flex flex-col flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium">{role.name}</span>
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
                                  <div className="size-4 animate-spin rounded-full border-2 border-destructive border-t-transparent" />
                                )
                              : (
                                  <Trash2 className="size-4" />
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
  // Safety check: participant should exist if hasRole is true, but TypeScript needs explicit check
  if (!participant) {
    return null;
  }

  return (
    <div className="flex items-center gap-1">
      <Popover open={rolePopoverOpen} onOpenChange={handleOpenChange}>
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
              {/* Always show Create Custom Role button at the top */}
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    // Focus the search input to allow user to type the new role name
                    setRoleSearchQuery('');
                  }}
                  className="gap-2 text-primary font-medium"
                >
                  <Plus className="size-4" />
                  <span>Create Custom Role</span>
                </CommandItem>
              </CommandGroup>

              <CommandSeparator />

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
                        participant?.role === role ? 'opacity-100' : 'opacity-0',
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
                                <div className="size-4 animate-spin rounded-full border-2 border-destructive border-t-transparent" />
                              )
                            : (
                                <Trash2 className="size-4" />
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
// Model Item (Static - No Reordering)
// ============================================================================

function ModelItem({
  orderedModel,
  customRoles,
  onToggle,
  onRoleChange,
  onClearRole,
  isLastParticipant,
  selectedCount,
  maxModels,
  enableDrag = true,
  userTierInfo,
}: {
  orderedModel: OrderedModel;
  customRoles: ChatCustomRole[]; // ✅ Using backend schema type
  onToggle: () => void;
  onRoleChange: (role: string, customRoleId?: string) => void;
  onClearRole: () => void;
  isLastParticipant: boolean;
  selectedCount: number;
  maxModels: number;
  enableDrag?: boolean;
  userTierInfo?: { tier_name: string; max_models: number; current_tier: SubscriptionTier; can_upgrade: boolean };
}) {
  const controls = useDragControls();
  const { model, participant } = orderedModel;
  const isSelected = participant !== null;

  // ✅ BACKEND-COMPUTED ACCESS CONTROL: Use isAccessible flag from backend
  const isAccessible = model.metadata.isAccessible ?? isSelected;

  // Disable reasons (checked in order of priority):
  // 1. Last participant - can't deselect if it's the only one
  // 2. Tier restriction - can't select if tier too low (but can deselect if already selected)
  // 3. Selection limit - can't select more when at limit (but can deselect)
  const isDisabledDueToLastParticipant = isSelected && isLastParticipant;
  const isDisabledDueToTier = !isSelected && !isAccessible; // Only block NEW selections
  const isDisabledDueToLimit = !isSelected && selectedCount >= maxModels; // Only block NEW selections

  // Selected models are NEVER disabled (except last participant rule)
  // Unselected models can be disabled by tier or limit
  const isDisabled = isDisabledDueToLastParticipant || isDisabledDueToTier || isDisabledDueToLimit;

  // Create upgrade tooltip content with proper messaging (using centralized getTierName)
  let upgradeTooltipContent: string | undefined;
  if (isDisabledDueToTier) {
    upgradeTooltipContent = `Upgrade to ${SUBSCRIPTION_TIER_NAMES[model.minTier]} to unlock this model`;
  } else if (isDisabledDueToLimit) {
    upgradeTooltipContent = `Your ${userTierInfo?.tier_name || 'current'} plan allows up to ${maxModels} models per conversation. Upgrade to select more models.`;
  }

  const itemContent = (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <div
          className={cn(
            'px-2 py-2 border-b last:border-0 transition-colors',
            !isDisabled && 'hover:bg-accent/50',
            isDisabled && 'opacity-50 cursor-not-allowed',
          )}
        >
          <div className="flex items-center gap-2">
            {/* Drag Handle - Only shown for selected models */}
            {enableDrag && (
              <div
                className={cn(
                  'flex-shrink-0 text-muted-foreground p-0.5',
                  !isDisabled && 'cursor-grab active:cursor-grabbing hover:text-foreground touch-none',
                  isDisabled && 'cursor-not-allowed opacity-30',
                )}
                onPointerDown={isDisabled ? undefined : e => controls.start(e)}
                style={isDisabled ? undefined : { touchAction: 'none' }}
                aria-label={isDisabled ? 'Drag disabled' : 'Drag to reorder'}
                onClick={e => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (!isDisabled && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                  }
                }}
                role="button"
                tabIndex={isDisabled ? -1 : 0}
              >
                <GripVertical className="size-4" />
              </div>
            )}

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
              tabIndex={isDisabled ? -1 : 0}
              className={cn(
                'flex items-center gap-2 flex-1 min-w-0',
                !isDisabled && 'cursor-pointer',
                isDisabled && 'cursor-not-allowed',
              )}
              onClick={isDisabled ? undefined : () => onToggle()}
              onKeyDown={
                isDisabled
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
                    <>
                      <Lock className="size-3 text-muted-foreground flex-shrink-0" />
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-medium bg-primary/10 text-primary border-primary/20">
                        {SUBSCRIPTION_TIER_NAMES[model.minTier]}
                        {' '}
                        Required
                      </Badge>
                    </>
                  )}
                  {isDisabledDueToLimit && !isDisabledDueToTier && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-warning/50 text-warning">
                      Limit Reached
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
                  <span className="truncate">{model.description}</span>
                  {model.metadata.pricing && (
                    <span className="text-[10px] shrink-0">
                      •
                      {' '}
                      {model.metadata.pricing.input}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Role Selector - only shown when enabled and model is selected or selectable */}
            {!isDisabled && (
              <RoleSelector
                participant={participant}
                customRoles={customRoles}
                onRoleChange={onRoleChange}
                onClearRole={onClearRole}
                onRequestSelection={!participant ? onToggle : undefined}
              />
            )}
          </div>
        </div>
      </TooltipTrigger>
      {upgradeTooltipContent && (
        <TooltipContent side="right" className="max-w-xs">
          <div className="flex items-start gap-2">
            <Lock className="size-4 text-primary flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">{upgradeTooltipContent}</p>
              <p className="text-xs text-muted-foreground">
                Upgrade to
                {' '}
                {isDisabledDueToTier ? SUBSCRIPTION_TIER_NAMES[model.minTier] : 'a higher tier'}
                {' '}
                to unlock this model
              </p>
              <Link
                href="/chat/pricing"
                className="text-xs text-primary font-medium mt-2 inline-block hover:underline"
              >
                View Pricing Plans →
              </Link>
            </div>
          </div>
        </TooltipContent>
      )}
    </Tooltip>
  );

  if (enableDrag) {
    return (
      <Reorder.Item
        value={orderedModel}
        dragListener={false}
        dragControls={controls}
        className="relative"
      >
        {itemContent}
      </Reorder.Item>
    );
  }

  return <div className="relative">{itemContent}</div>;
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * ChatParticipantsList - Tier-grouped AI model participant selector
 *
 * Features:
 * - Models grouped by subscription tier (Free, Starter, Pro, Power)
 * - Sticky tier headers that remain visible while scrolling
 * - Drag and drop to reorder models within each tier
 * - Checkboxes for selection with tier-based access control
 * - Inline role assignment for selected models
 * - Visual tier progression showing upgrade path
 * - Pricing indicators on each model
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
  const { data: modelsData } = useModelsQuery(); // Fetch ALL models with tier groups

  const customRoles = customRolesData?.pages.flatMap(page =>
    (page?.success && page.data?.items) ? page.data.items : [],
  ) || [];

  // ✅ USER TIER: Get from usage stats
  const { data: usageStatsData } = useUsageStatsQuery();
  const userTier = usageStatsData?.data?.subscription?.tier || 'free';

  // ✅ TIER CONFIG: Get max models from tier configuration (synchronous for UI)
  const maxModels = getMaxModelsForTier(userTier);
  const tierName = getTierName(userTier);

  // ✅ BACKEND MODELS + UI PROPERTIES: Add computed properties for component
  const allEnabledModels: UIModel[] = useMemo(() => {
    const models = modelsData?.data?.models || [];
    return models.map((model): UIModel => ({
      ...model,
      // UI aliases for backward compatibility
      modelId: model.id,
      minTier: model.required_tier || 'free',
      metadata: {
        icon: getProviderIcon(model.provider),
        isAccessible: model.is_accessible_to_user ?? true,
        pricing: {
          input: model.pricing_display.input,
          output: model.pricing_display.output,
        },
        category: model.category,
      },
    }));
  }, [modelsData?.data?.models]);

  // Create a unified list of all models with their order
  // Selected models maintain their participant order, unselected go to the end
  // Now showing ALL models (both accessible and inaccessible)
  const [orderedModels, setOrderedModels] = useState<OrderedModel[]>(() => {
    // Wait for models to load before initializing
    if (allEnabledModels.length === 0)
      return [];

    const selectedModels: OrderedModel[] = participants
      .sort((a, b) => a.order - b.order)
      .flatMap((p, index) => {
        // ✅ BACKEND DATA ONLY: Find model from backend response
        const model = allEnabledModels.find(m => m.id === p.modelId);
        return model
          ? [{
              model,
              participant: p,
              order: index,
            }]
          : [];
      });

    const selectedIds = new Set(participants.map(p => p.modelId));
    const unselectedModels: OrderedModel[] = allEnabledModels
      .filter(m => !selectedIds.has(m.id))
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

  // ✅ USER TIER INFO: Construct from computed values for backward compatibility
  const userTierInfo = {
    tier_name: tierName,
    max_models: maxModels,
    current_tier: userTier,
    can_upgrade: userTier !== 'power',
  };

  // Toggle model selection
  const handleToggleModel = (modelId: string) => {
    const orderedModel = orderedModels.find(om => om.model.modelId === modelId);
    if (!orderedModel)
      return;

    // ✅ BACKEND-COMPUTED ACCESS CONTROL: Use backend's is_accessible_to_user flag
    if (!orderedModel.participant) {
      // Check backend-computed accessibility flag
      const openRouterModel = modelsData?.data?.models.find(m => m.id === modelId);
      if (openRouterModel && !openRouterModel.is_accessible_to_user) {
        // Prevent selection of models user doesn't have access to
        toastManager.error(
          'Model not accessible',
          `Your ${userTierInfo?.tier_name || 'current'} plan does not include access to this model.`,
        );
        return;
      }
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

  // Handle reordering of selected models only
  const handleReorderSelected = (newOrder: OrderedModel[]) => {
    // Update participant order based on new drag position
    const reorderedParticipants = newOrder.map((om, index) => ({
      ...om.participant!,
      order: index,
    }));

    onParticipantsChange(reorderedParticipants);
  };

  // Filter models based on search query using fuzzy search
  const filteredModels = useFuzzySearch(
    orderedModels,
    modelSearchQuery,
    {
      keys: [
        'model.name',
        'model.description',
        'model.metadata.category',
        'model.provider',
      ],
      threshold: 0.3, // Lower = stricter matching, Higher = more lenient
      ignoreLocation: true,
      minMatchCharLength: 1,
    },
  );

  // Separate selected and unselected models for better drag-and-drop UX
  const selectedModels = useMemo(() => {
    return filteredModels
      .filter(om => om.participant !== null)
      .sort((a, b) => a.participant!.order - b.participant!.order);
  }, [filteredModels]);

  const unselectedModels = useMemo(() => {
    return filteredModels
      .filter(om => om.participant === null);
  }, [filteredModels]);

  // ✅ BACKEND TIER GROUPS: Use tier groups from backend response
  const tierGroups = modelsData?.data?.tier_groups || [];

  // ✅ Group unselected models by tier for display
  const unselectedModelsByTier = useMemo(() => {
    const grouped: Record<SubscriptionTier, OrderedModel[]> = {
      free: [],
      starter: [],
      pro: [],
      power: [],
    };

    unselectedModels.forEach((om) => {
      const tier = om.model.minTier;
      if (grouped[tier]) {
        grouped[tier]!.push(om);
      }
    });

    return grouped;
  }, [unselectedModels]);

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {/* Add AI Button with Count */}
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
                      // ✅ SINGLE SOURCE OF TRUTH: Find model from backend data
                      const model = allEnabledModels.find(m => m.id === participant.modelId);
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

                {/* Selected Models Section - Draggable for reordering */}
                {selectedModels.length > 0 && (
                  <div className="border-b">
                    <div className="px-3 py-2 text-xs font-semibold text-foreground bg-primary/10 border-b border-primary/20 sticky top-0 z-20 backdrop-blur-sm" style={{ boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)' }}>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          Selected Models
                          <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4">
                            {selectedModels.length}
                            /
                            {maxModels}
                          </Badge>
                        </span>
                        <span className="text-[10px] opacity-70">Drag to reorder</span>
                      </div>
                    </div>
                    <Reorder.Group
                      axis="y"
                      values={selectedModels}
                      onReorder={handleReorderSelected}
                      className="space-y-0"
                      as="div"
                    >
                      {selectedModels.map(orderedModel => (
                        <ModelItem
                          key={orderedModel.participant!.id}
                          orderedModel={orderedModel}
                          customRoles={customRoles}
                          onToggle={() => handleToggleModel(orderedModel.model.modelId)}
                          onRoleChange={(role, customRoleId) => handleRoleChange(orderedModel.model.modelId, role, customRoleId)}
                          onClearRole={() => handleClearRole(orderedModel.model.modelId)}
                          isLastParticipant={selectedModels.length === 1}
                          selectedCount={participants.length}
                          maxModels={maxModels}
                          userTierInfo={userTierInfo}
                        />
                      ))}
                    </Reorder.Group>
                  </div>
                )}

                {/* Available Models Section - Tier-grouped by backend */}
                {unselectedModels.length > 0 && tierGroups.length > 0 && (
                  <div className="space-y-0">
                    {tierGroups.map((tierGroup) => {
                      const tieredModels = unselectedModelsByTier[tierGroup.tier];
                      if (!tieredModels || tieredModels.length === 0)
                        return null;

                      // ✅ USE BACKEND FLAGS: is_user_tier from backend
                      const isUserTier = tierGroup.is_user_tier;
                      const tierOrder = getTiersInOrder();
                      const tierIndex = tierOrder.indexOf(tierGroup.tier);
                      const userTierIndex = tierOrder.indexOf(userTierInfo?.current_tier || 'free');
                      const isLowerTier = tierIndex < userTierIndex;
                      const isHigherTier = tierIndex > userTierIndex;

                      return (
                        <div key={tierGroup.tier}>
                          {/* Tier Header - Sticky header showing upgrade path */}
                          <div
                            className={cn(
                              'px-3 py-2.5 text-xs font-medium border-b',
                              'sticky top-0 z-20', // Sticky positioning with high z-index
                              'backdrop-blur-sm', // Subtle blur effect for better visibility
                              isUserTier && 'bg-primary/15 text-primary border-primary/20',
                              isLowerTier && 'bg-muted/50 text-muted-foreground',
                              isHigherTier && 'bg-muted/60 text-muted-foreground border-muted',
                            )}
                            style={{
                              // Ensure sticky header stays above content
                              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
                            }}
                          >
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-2">
                                <span className="font-semibold">{tierGroup.tier_name}</span>
                                {isUserTier && (
                                  <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4">
                                    Your Plan
                                  </Badge>
                                )}
                                {isHigherTier && (
                                  <Lock className="size-3 opacity-70" />
                                )}
                              </span>
                              <span className="text-[10px] opacity-80">
                                {tieredModels.length}
                                {' '}
                                {tieredModels.length === 1 ? 'model' : 'models'}
                              </span>
                            </div>
                            {isHigherTier && (
                              <div className="text-[10px] opacity-70 mt-1">
                                Upgrade to unlock these models
                              </div>
                            )}
                          </div>

                          {/* Models in this tier - No reordering needed for unselected */}
                          <div className="space-y-0">
                            {tieredModels.map((orderedModel: OrderedModel) => (
                              <ModelItem
                                key={`unselected-${orderedModel.model.id}`}
                                orderedModel={orderedModel}
                                customRoles={customRoles}
                                onToggle={() => handleToggleModel(orderedModel.model.modelId)}
                                onRoleChange={(role, customRoleId) => handleRoleChange(orderedModel.model.modelId, role, customRoleId)}
                                onClearRole={() => handleClearRole(orderedModel.model.modelId)}
                                isLastParticipant={false}
                                selectedCount={participants.length}
                                maxModels={maxModels}
                                enableDrag={false}
                                userTierInfo={userTierInfo}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
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
  chatMessages: _chatMessages, // Renamed to indicate intentionally unused (for future feature)
}: {
  participants: ParticipantConfig[];
  isStreaming?: boolean;
  currentParticipantIndex?: number;
  className?: string;
  chatMessages?: UIMessage[];
}) {
  // ✅ FETCH MODELS: Each component manages its own data
  const { data: modelsData } = useModelsQuery();
  const allModels: UIModel[] = useMemo(() => {
    const models = modelsData?.data?.models || [];
    return models.map((model): UIModel => ({
      ...model,
      modelId: model.id,
      minTier: model.required_tier || 'free',
      metadata: {
        icon: getProviderIcon(model.provider),
        isAccessible: model.is_accessible_to_user ?? true,
        pricing: {
          input: model.pricing_display.input,
          output: model.pricing_display.output,
        },
        category: model.category,
      },
    }));
  }, [modelsData?.data?.models]);

  if (participants.length === 0) {
    return null;
  }

  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <div className="flex items-center gap-2 pb-2">
        {participants
          .sort((a, b) => a.order - b.order)
          .map((participant, index) => {
            // ✅ SINGLE SOURCE OF TRUTH: Find model from backend data
            const model = allModels.find(m => m.id === participant.modelId);
            if (!model)
              return null;

            // Note: Participant message tracking removed for cleaner liquid glass UI

            // Determine participant status during streaming - simplified for minimalistic UI
            const isWaitingInQueue = isStreaming && currentParticipantIndex !== undefined && index > currentParticipantIndex;

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
                  'relative flex items-center gap-1.5 sm:gap-2 shrink-0',
                  // Simplified - no background effects, just content
                  isWaitingInQueue && 'opacity-60',
                )}
              >
                {/* Content - minimalistic display */}
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <Avatar className="size-6 sm:size-7 shrink-0">
                    <AvatarImage src={model.metadata.icon} alt={model.name} />
                    <AvatarFallback className="text-[10px] sm:text-xs">
                      {model.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs sm:text-sm font-medium text-foreground/90">{model.name}</span>
                </div>
              </motion.div>
            );
          })}
      </div>
    </div>
  );
}
