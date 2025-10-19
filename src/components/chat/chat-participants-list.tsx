'use client';

import type { UIMessage } from 'ai';
import { Bot, Check, GripVertical, Lock, Plus, Trash2 } from 'lucide-react';
import { motion, Reorder, useDragControls } from 'motion/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo, useRef, useState } from 'react';

// ✅ ZOD-INFERRED TYPE: Import from schema (no hardcoded interfaces)
// EnhancedModelResponse includes tier access fields (is_accessible_to_user, required_tier, required_tier_name)
import type { EnhancedModelResponse } from '@/api/routes/models/schema';
import type { SubscriptionTier } from '@/api/services/product-logic.service';
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
import { useFuzzySearch } from '@/hooks/utils/use-fuzzy-search';
import { toastManager } from '@/lib/toast/toast-manager';
import type { ParticipantConfig } from '@/lib/types/participant-config';
import { cn } from '@/lib/ui/cn';
import { DEFAULT_ROLES, getProviderIcon } from '@/lib/utils/ai-display';
import { getApiErrorMessage } from '@/lib/utils/error-handling';
// ============================================================================
// Types - ✅ Inferred from Backend Schema (Zero Hardcoding)
// ============================================================================
/**
 * ✅ RPC-INFERRED TYPES: Import runtime types from service layer
 * These types automatically have correct runtime representation (dates as ISO strings)
 */
import type { ListCustomRolesResponse } from '@/services/api/chat-roles';

// ✅ RPC-INFERRED TYPE: Extract CustomRole from service response
type CustomRole = NonNullable<Extract<ListCustomRolesResponse, { success: true }>['data']>['items'][number];

type ChatParticipantsListProps = {
  participants: ParticipantConfig[];
  onParticipantsChange: (participants: ParticipantConfig[]) => void;
  className?: string;
  isStreaming?: boolean; // Disable queries during streaming to prevent excessive refetches
};

// ✅ ZERO TRANSFORMATION: Use RPC types directly
type OrderedModel = {
  model: EnhancedModelResponse; // ✅ Direct RPC type - no wrapper
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
  customRoles: CustomRole[]; // ✅ Using RPC-inferred type from service
  onRoleChange: (role: string, customRoleId?: string) => void;
  onClearRole: () => void;
  onRequestSelection?: () => void; // Called when model needs to be selected first
}) {
  const t = useTranslations('chat.roles');
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
          description: null,
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
      const result = await deleteRoleMutation.mutateAsync({ param: { id: roleId } });

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
              {t('addRole')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[calc(100vw-2rem)] max-w-[320px] sm:w-64 p-0" align="start" side="bottom" sideOffset={4}>
            <Command>
              <CommandInput
                placeholder={t('searchOrCreateRole')}
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
                    <span>{t('createCustomRole')}</span>
                  </CommandItem>
                </CommandGroup>

                <CommandSeparator />

                {/* Default Roles */}
                <CommandGroup heading={t('defaultRoles')}>
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
                    <CommandGroup heading={t('customRoles')}>
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
                            aria-label={t('deleteCustomRole')}
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
                    <CommandGroup heading={t('create')}>
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
                                <span>{t('creating')}</span>
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

                <CommandEmpty>{t('noRolesFound')}</CommandEmpty>
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
          <div
            className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 h-6 text-xs px-2 pr-1 rounded-lg gap-1 cursor-pointer"
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
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-[calc(100vw-2rem)] max-w-[320px] sm:w-64 p-0" align="start" side="bottom" sideOffset={4}>
          <Command>
            <CommandInput
              placeholder={t('searchOrCreateRole')}
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
                  <span>{t('createCustomRole')}</span>
                </CommandItem>
              </CommandGroup>

              <CommandSeparator />

              {/* Default Roles */}
              <CommandGroup heading={t('defaultRoles')}>
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
                  <CommandGroup heading={t('customRoles')}>
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
                          aria-label={t('deleteCustomRole')}
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
                  <CommandGroup heading={t('create')}>
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
                              <span>{t('creating')}</span>
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

              <CommandEmpty>{t('noRolesFound')}</CommandEmpty>
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
  customRoles: CustomRole[]; // ✅ Using RPC-inferred type from service
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
  const tModels = useTranslations('chat.models');
  const { model, participant } = orderedModel;
  const isSelected = participant !== null;

  // ✅ BACKEND-COMPUTED ACCESS CONTROL: Use is_accessible_to_user flag from RPC type
  const isAccessible = model.is_accessible_to_user ?? isSelected;

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

  // Create upgrade tooltip content with proper messaging (using backend tier names)
  let upgradeTooltipContent: string | undefined;
  if (isDisabledDueToTier) {
    // ✅ USE BACKEND DATA: required_tier_name comes from RPC type
    const requiredTierName = model.required_tier_name || model.required_tier || 'free';
    upgradeTooltipContent = `Upgrade to ${requiredTierName} to unlock this model`;
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
                aria-label={isDisabled ? tModels('dragDisabled') : tModels('dragToReorder')}
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
              title={isDisabledDueToLastParticipant ? tModels('minimumRequired') : undefined}
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
                <AvatarImage src={getProviderIcon(model.provider)} alt={model.name} />
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
                        {model.required_tier_name || model.required_tier || 'free'}
                        {' '}
                        Required
                      </Badge>
                    </>
                  )}
                  {isDisabledDueToLimit && !isDisabledDueToTier && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-warning/50 text-warning">
                      {tModels('limitReached')}
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
                  <span className="truncate">{model.description}</span>
                  {model.pricing_display && (
                    <span className="text-[10px] shrink-0">
                      •
                      {' '}
                      {model.pricing_display.input}
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
                {isDisabledDueToTier ? (model.required_tier_name || model.required_tier || 'free') : 'a higher tier'}
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
  const tModels = useTranslations('chat.models');
  const [open, setOpen] = useState(false);
  const [modelSearchQuery, setModelSearchQuery] = useState('');

  // ✅ Counter for generating unique participant IDs (avoids Date.now() which is impure)
  const participantIdCounterRef = useRef(0);

  // Only fetch when popover is open (not on page load)
  const { data: customRolesData } = useCustomRolesQuery(open && !isStreaming);
  const { data: modelsData } = useModelsQuery(); // Fetch ALL models with tier groups

  const customRoles = customRolesData?.pages.flatMap(page =>
    (page?.success && page.data?.items) ? page.data.items : [],
  ) || [];

  // ✅ BACKEND TIER CONFIG: Get ALL tier data from backend (max_models, tier_name, etc.)
  const userTierConfig = modelsData?.data?.user_tier_config || {
    tier: 'free' as SubscriptionTier,
    tier_name: 'Free',
    max_models: 2,
    can_upgrade: true,
  };

  const maxModels = userTierConfig.max_models;
  const tierName = userTierConfig.tier_name;
  const userTier = userTierConfig.tier;

  // ✅ ZERO TRANSFORMATION: Use RPC types directly from backend
  // ✅ REACT 19: Memoize to prevent unnecessary recalculations in dependent useMemos
  const allEnabledModels: EnhancedModelResponse[] = useMemo(
    () => modelsData?.data?.items || [],
    [modelsData?.data?.items],
  );

  // ✅ REACT 19 PATTERN: Derive state using useMemo instead of useEffect
  // This eliminates extra render passes and prevents potential infinite loops
  // Reference: React docs - "Calculate what you can during rendering"
  const orderedModels = useMemo<OrderedModel[]>(() => {
    // Wait for models to load before computing
    if (allEnabledModels.length === 0)
      return [];

    // Selected models maintain their participant order
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

    // Unselected models go to the end, sorted alphabetically
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
    const orderedModel = orderedModels.find(om => om.model.id === modelId);
    if (!orderedModel)
      return;

    // ✅ BACKEND-COMPUTED ACCESS CONTROL: Use backend's is_accessible_to_user flag
    if (!orderedModel.participant) {
      // Check backend-computed accessibility flag
      const openRouterModel = modelsData?.data?.items.find(m => m.id === modelId);
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
      // ✅ Generate unique ID for new participant using counter ref (avoids impure Date.now())
      participantIdCounterRef.current += 1;
      const newParticipant: ParticipantConfig = {
        id: `participant-${participantIdCounterRef.current}`,
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

  // ✅ BACKEND DATA: Single source of truth
  const tierGroups = modelsData?.data?.tier_groups || [];
  const flagshipModels = modelsData?.data?.flagship_models || [];
  const selectedModelIds = useMemo(
    () => new Set(participants.map(p => p.modelId)),
    [participants],
  );

  // ✅ SEARCH: Apply fuzzy search to all enabled models
  const searchFilteredModels = useFuzzySearch(
    allEnabledModels,
    modelSearchQuery,
    {
      keys: ['name', 'description', 'provider', 'id'],
      threshold: 0.3,
      ignoreLocation: true,
      minMatchCharLength: 1,
    },
  );

  // ✅ SEARCH FILTER SET: Efficient lookup for search-filtered models
  const searchFilteredIds = useMemo(() => {
    if (!modelSearchQuery)
      return null; // No search = show all
    return new Set(searchFilteredModels.map(m => m.id));
  }, [searchFilteredModels, modelSearchQuery]);

  // ✅ SELECTED MODELS: Filter search results from ordered models
  const selectedModels = useMemo(() => {
    return orderedModels
      .filter(om =>
        om.participant !== null
        && (!searchFilteredIds || searchFilteredIds.has(om.model.id)),
      )
      .sort((a, b) => a.participant!.order - b.participant!.order);
  }, [orderedModels, searchFilteredIds]);

  // ✅ FLAT UNSELECTED LIST: When searching, show all unselected models in flat list
  const flatUnselectedModels = useMemo(() => {
    if (!modelSearchQuery || !searchFilteredIds)
      return [];

    // Combine flagship + tier models into flat list
    const allUnselected: EnhancedModelResponse[] = [];

    // Add flagship models first
    flagshipModels.forEach((model) => {
      if (!selectedModelIds.has(model.id) && searchFilteredIds.has(model.id)) {
        allUnselected.push(model);
      }
    });

    // Add tier models (excluding flagships to avoid duplication)
    const flagshipIds = new Set(flagshipModels.map(m => m.id));
    tierGroups.forEach((tierGroup) => {
      tierGroup.models.forEach((model) => {
        if (
          !selectedModelIds.has(model.id)
          && searchFilteredIds.has(model.id)
          && !flagshipIds.has(model.id) // Avoid duplication
        ) {
          allUnselected.push(model);
        }
      });
    });

    return allUnselected;
  }, [modelSearchQuery, searchFilteredIds, flagshipModels, tierGroups, selectedModelIds]);

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
                  <span className="hidden xs:inline sm:inline">{tModels('aiModels')}</span>
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
                  <div className="font-semibold text-xs">{tModels('selectedModelsLabel')}</div>
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
                            <AvatarImage src={getProviderIcon(model.provider)} alt={model.name} />
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
                placeholder={tModels('searchModels')}
                className="h-9"
                value={modelSearchQuery}
                onValueChange={setModelSearchQuery}
              />

              <CommandList>
                {(() => {
                  // ✅ SEARCH RESULTS: Check if any models match search query
                  const hasResults = searchFilteredIds
                    ? searchFilteredIds.size > 0
                    : allEnabledModels.length > 0;
                  return !hasResults && (
                    <CommandEmpty>{tModels('noModelsFound')}</CommandEmpty>
                  );
                })()}

                {/* ✅ CONDITIONAL RENDERING: Search mode (flat list) vs Grouped mode (with headers) */}
                {/* eslint-disable-next-line style/multiline-ternary */}
                {modelSearchQuery ? (
                  <>
                    {/* SEARCH MODE: Flat list without headers */}
                    {selectedModels.length > 0 && (
                      <div className="border-b">
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
                              onToggle={() => handleToggleModel(orderedModel.model.id)}
                              onRoleChange={(role, customRoleId) => handleRoleChange(orderedModel.model.id, role, customRoleId)}
                              onClearRole={() => handleClearRole(orderedModel.model.id)}
                              isLastParticipant={selectedModels.length === 1}
                              selectedCount={participants.length}
                              maxModels={maxModels}
                              userTierInfo={userTierInfo}
                            />
                          ))}
                        </Reorder.Group>
                      </div>
                    )}

                    {/* Unselected - Flat list without headers */}
                    {flatUnselectedModels.length > 0 && (
                      <div className="space-y-0">
                        {flatUnselectedModels.map((model, index) => (
                          <ModelItem
                            key={`search-${model.id}`}
                            orderedModel={{ model, participant: null, order: index }}
                            customRoles={customRoles}
                            onToggle={() => handleToggleModel(model.id)}
                            onRoleChange={(role, customRoleId) => handleRoleChange(model.id, role, customRoleId)}
                            onClearRole={() => handleClearRole(model.id)}
                            isLastParticipant={false}
                            selectedCount={participants.length}
                            maxModels={maxModels}
                            enableDrag={false}
                            userTierInfo={userTierInfo}
                          />
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {/* GROUPED MODE: Show headers and tier groups */}

                    {/* Selected Models Section - Draggable for reordering */}
                    {selectedModels.length > 0 && (
                      <div className="border-b">
                        <div className="px-3 py-2 text-xs font-semibold text-foreground bg-primary/10 border-b border-primary/20 sticky top-0 z-20 backdrop-blur-sm" style={{ boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)' }}>
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-2">
                              {tModels('selectedModels')}
                              <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4">
                                {selectedModels.length}
                                /
                                {maxModels}
                              </Badge>
                            </span>
                            <span className="text-[10px] opacity-70">{tModels('dragToReorder')}</span>
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
                              onToggle={() => handleToggleModel(orderedModel.model.id)}
                              onRoleChange={(role, customRoleId) => handleRoleChange(orderedModel.model.id, role, customRoleId)}
                              onClearRole={() => handleClearRole(orderedModel.model.id)}
                              isLastParticipant={selectedModels.length === 1}
                              selectedCount={participants.length}
                              maxModels={maxModels}
                              userTierInfo={userTierInfo}
                            />
                          ))}
                        </Reorder.Group>
                      </div>
                    )}

                    {/* ✅ MOST POPULAR MODELS - Backend filtered, frontend renders */}
                    {flagshipModels.length > 0 && (() => {
                      const unselectedFlagships = flagshipModels.filter(m =>
                        !selectedModelIds.has(m.id)
                        && (!searchFilteredIds || searchFilteredIds.has(m.id)),
                      );
                      return unselectedFlagships.length > 0 && (
                        <div className="space-y-0">
                          <div
                            className={cn(
                              'px-3 py-2.5 text-xs font-medium border-b',
                              'sticky top-0 z-20 backdrop-blur-sm',
                              'bg-accent/50 text-accent-foreground border-accent',
                            )}
                            style={{ boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)' }}
                          >
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-2">
                                <span className="font-semibold">{tModels('mostPopular')}</span>
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                                  {tModels('topModels')}
                                </Badge>
                              </span>
                              <span className="text-[10px] opacity-80">
                                {unselectedFlagships.length}
                                {' '}
                                {unselectedFlagships.length === 1 ? tModels('model') : tModels('models')}
                              </span>
                            </div>
                          </div>
                          <div className="space-y-0">
                            {unselectedFlagships.map((model, index) => (
                              <ModelItem
                                key={`flagship-${model.id}`}
                                orderedModel={{ model, participant: null, order: index }}
                                customRoles={customRoles}
                                onToggle={() => handleToggleModel(model.id)}
                                onRoleChange={(role, customRoleId) => handleRoleChange(model.id, role, customRoleId)}
                                onClearRole={() => handleClearRole(model.id)}
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
                    })()}

                    {/* ✅ TIER GROUPS - Backend grouped, frontend renders */}
                    {tierGroups.length > 0 && (
                      <div className="space-y-0">
                        {tierGroups.map((tierGroup, tierIndex) => {
                          const unselectedTierModels = tierGroup.models.filter(m =>
                            !selectedModelIds.has(m.id)
                            && (!searchFilteredIds || searchFilteredIds.has(m.id)),
                          );
                          if (unselectedTierModels.length === 0)
                            return null;

                          // ✅ USE BACKEND DATA: Tier ordering from backend tier_groups array
                          const isUserTier = tierGroup.is_user_tier;
                          const userTierIndex = tierGroups.findIndex(g => g.is_user_tier);
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
                                        {tModels('yourPlan')}
                                      </Badge>
                                    )}
                                    {isHigherTier && (
                                      <Lock className="size-3 opacity-70" />
                                    )}
                                  </span>
                                  <span className="text-[10px] opacity-80">
                                    {unselectedTierModels.length}
                                    {' '}
                                    {unselectedTierModels.length === 1 ? tModels('model') : tModels('models')}
                                  </span>
                                </div>
                                {isHigherTier && (
                                  <div className="text-[10px] opacity-70 mt-1">
                                    {tModels('upgradeToUnlock')}
                                  </div>
                                )}
                              </div>

                              {/* ✅ MODELS - Direct render from backend */}
                              <div className="space-y-0">
                                {unselectedTierModels.map((model, index) => (
                                  <ModelItem
                                    key={`tier-${tierGroup.tier}-${model.id}`}
                                    orderedModel={{ model, participant: null, order: index }}
                                    customRoles={customRoles}
                                    onToggle={() => handleToggleModel(model.id)}
                                    onRoleChange={(role, customRoleId) => handleRoleChange(model.id, role, customRoleId)}
                                    onClearRole={() => handleClearRole(model.id)}
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
                  </>
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
  // ✅ ZERO TRANSFORMATION: Use RPC types directly from backend
  const { data: modelsData } = useModelsQuery();
  const allModels: EnhancedModelResponse[] = modelsData?.data?.items || [];

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
                    <AvatarImage src={getProviderIcon(model.provider)} alt={model.name} />
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
