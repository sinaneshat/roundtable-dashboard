'use client';

import { AlertCircle, ArrowLeft, Search, Sparkles, Trash2, X } from 'lucide-react';
import { AnimatePresence, motion, Reorder } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ModelSelectionTab, SubscriptionTier } from '@/api/core/enums';
import { ChatModes, DEFAULT_MODEL_SELECTION_TAB, ModelSelectionTabs, PREDEFINED_ROLE_TEMPLATES } from '@/api/core/enums';
import { createRoleSystemPrompt } from '@/api/services/prompts.service';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PresetCardSkeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useCreateCustomRoleMutation,
  useCreateUserPresetMutation,
  useDeleteCustomRoleMutation,
  useDeleteUserPresetMutation,
  useUpdateUserPresetMutation,
} from '@/hooks/mutations';
import { useUsageStatsQuery, useUserPresetsQuery } from '@/hooks/queries';
import type { ModelPreset, PresetSelectionResult } from '@/lib/config/model-presets';
import { MODEL_PRESETS } from '@/lib/config/model-presets';
import type { OrderedModel } from '@/lib/schemas/model-schemas';
import { toastManager } from '@/lib/toast';
import { cn } from '@/lib/ui/cn';
import { getApiErrorMessage } from '@/lib/utils';
import type { ListCustomRolesResponse } from '@/services/api';

import { CustomRoleForm } from './custom-role-form';
import { ModelItem } from './model-item';
import { ModelPresetCard } from './model-preset-card';
import { PresetNameForm } from './preset-name-form';
import { RoleColorBadge } from './role-color-badge';

/** Custom role item type - inferred from API response for JSON-safe dates */
type CustomRole = NonNullable<
  Extract<ListCustomRolesResponse, { success: true }>['data']
>['items'][number];

/**
 * ModelSelectionModal Component
 *
 * Reusable modal for selecting AI models with search and drag-reordering.
 * Follows established dialog patterns from ConversationModeModal and ChatDeleteDialog.
 *
 * Features:
 * - Multi-selection with visual feedback
 * - Search filtering
 * - Drag-to-reorder (optional)
 * - Role assignment per model
 * - Tier-based access control
 * - Full keyboard accessibility via Radix Dialog
 *
 * @example
 * ```tsx
 * <ModelSelectionModal
 *   open={isOpen}
 *   onOpenChange={setIsOpen}
 *   orderedModels={models}
 *   onReorder={handleReorder}
 *   onToggle={handleToggle}
 * />
 * ```
 */

export type ModelSelectionModalProps = {
  /** Controls dialog open/close state */
  open: boolean;
  /** Callback when dialog open state changes */
  onOpenChange: (open: boolean) => void;
  /** List of models with their order and participant config */
  orderedModels: OrderedModel[];
  /** Callback when models are reordered */
  onReorder: (reordered: OrderedModel[]) => void;
  /** Available custom roles */
  customRoles: CustomRole[];
  /** Callback when model is toggled */
  onToggle: (modelId: string) => void;
  /** Callback when role is changed for a model */
  onRoleChange: (modelId: string, role: string, customRoleId?: string) => void;
  /** Callback when role is cleared for a model */
  onClearRole: (modelId: string) => void;
  /** Callback when a preset is selected - replaces current selection with preset config */
  onPresetSelect?: (preset: ModelPreset) => void;
  /** Number of currently selected models */
  selectedCount: number;
  /** Maximum models allowed by user's plan */
  maxModels: number;
  /** User's tier information for access control */
  userTierInfo?: {
    tier_name: string;
    max_models: number;
    current_tier: SubscriptionTier;
    can_upgrade: boolean;
  };
  /** Optional className for dialog content */
  className?: string;
  /** Optional children to render below model list */
  children?: ReactNode;
  /** Enable drag-to-reorder (default: true) */
  enableDrag?: boolean;
  /** Set of model IDs that are incompatible with current file attachments */
  incompatibleModelIds?: Set<string>;
};

export function ModelSelectionModal({
  open,
  onOpenChange,
  orderedModels,
  onReorder,
  customRoles,
  onToggle,
  onRoleChange,
  onClearRole,
  onPresetSelect,
  selectedCount,
  maxModels,
  userTierInfo,
  className,
  children,
  enableDrag = true,
  incompatibleModelIds,
}: ModelSelectionModalProps) {
  const t = useTranslations('chat.models.modal');
  const tModels = useTranslations('chat.models');
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState(DEFAULT_MODEL_SELECTION_TAB);

  // Selected preset state for presets tab
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);

  // Track if preset should be applied on next render
  const shouldApplyPresetRef = useRef(false);

  // Role selection state
  const [selectedModelForRole, setSelectedModelForRole] = useState<string | null>(null);

  // Pending roles for models that aren't toggled on yet
  // Allows assigning roles independently of selection state
  const [pendingRoles, setPendingRoles] = useState<Record<string, { role: string; customRoleId?: string }>>({});

  // User presets - fetched from API only when modal is open
  const {
    data: userPresetsData,
    isLoading: isLoadingUserPresets,
  } = useUserPresetsQuery(open);

  const userPresets = useMemo(() => {
    if (!userPresetsData?.pages)
      return [];
    return userPresetsData.pages.flatMap(page =>
      page.success && page.data?.items ? page.data.items : [],
    );
  }, [userPresetsData]);

  const [isSavingPreset, setIsSavingPreset] = useState(false);
  // Edit mode - tracks which user preset is being edited
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  // Track newly created preset for highlight animation
  const [newlyCreatedPresetId, setNewlyCreatedPresetId] = useState<string | null>(null);

  // Custom role mutations
  const createRoleMutation = useCreateCustomRoleMutation();
  const deleteRoleMutation = useDeleteCustomRoleMutation();

  // User preset mutations
  const createPresetMutation = useCreateUserPresetMutation();
  const updatePresetMutation = useUpdateUserPresetMutation();
  const deletePresetMutation = useDeleteUserPresetMutation();

  // Usage stats for custom role access
  const { data: usageData } = useUsageStatsQuery();
  // ✅ CREDITS-ONLY: Paid users can create custom roles, free users need to upgrade
  const isPaidUser = usageData?.data?.plan?.type === 'paid';
  const canCreateCustomRoles = isPaidUser;

  // Check if filtering is active - disable reorder when filtering to prevent corruption
  const isFiltering = searchQuery.trim().length > 0;

  // Filter models based on search query
  const filteredModels = useMemo(() => {
    if (!isFiltering) {
      return orderedModels;
    }

    const query = searchQuery.toLowerCase();
    return orderedModels.filter((om) => {
      const model = om.model;
      return (
        model.name.toLowerCase().includes(query)
        || model.description?.toLowerCase().includes(query)
        || model.provider.toLowerCase().includes(query)
        || model.id.toLowerCase().includes(query)
      );
    });
  }, [orderedModels, searchQuery, isFiltering]);

  // Stable reorder handler that preserves unfiltered items
  // CRITICAL: Only allow reorder when NOT filtering to prevent state corruption
  const handleReorder = useCallback((reorderedItems: typeof orderedModels) => {
    if (isFiltering) {
      // Should not happen since we disable drag when filtering, but safety check
      return;
    }
    onReorder(reorderedItems);
  }, [isFiltering, onReorder]);

  // Get selected model data
  const selectedModelData = useMemo(() => {
    if (!selectedModelForRole)
      return null;
    return orderedModels.find(om => om.model.id === selectedModelForRole);
  }, [selectedModelForRole, orderedModels]);

  // Handle role selection
  const handleOpenRoleSelection = useCallback((modelId: string) => {
    setSelectedModelForRole(modelId);
  }, []);

  const handleBackToModelList = useCallback(() => {
    setSelectedModelForRole(null);
  }, []);

  const handleRoleSelect = useCallback((roleName: string, customRoleId?: string) => {
    if (selectedModelForRole) {
      // Check if model is currently selected (has participant)
      const modelData = orderedModels.find(om => om.model.id === selectedModelForRole);
      if (modelData?.participant) {
        // Model is toggled on - update participant directly
        onRoleChange(selectedModelForRole, roleName, customRoleId);
      } else {
        // Model is not toggled on - store in pendingRoles
        setPendingRoles(prev => ({
          ...prev,
          [selectedModelForRole]: { role: roleName, customRoleId },
        }));
      }
      handleBackToModelList();
    }
  }, [selectedModelForRole, orderedModels, onRoleChange, handleBackToModelList]);

  const handleCustomRoleCreate = useCallback(async (roleName: string) => {
    const trimmedRole = roleName.trim();
    if (!trimmedRole)
      return;

    // Check if user can create custom roles (paid users only)
    if (!canCreateCustomRoles) {
      toastManager.error(
        t('upgradeRequired'),
        t('customRolesUpgradeMessage'),
      );
      return;
    }

    try {
      // Create the custom role via API
      const result = await createRoleMutation.mutateAsync({
        json: {
          name: trimmedRole,
          description: null,
          systemPrompt: createRoleSystemPrompt(trimmedRole),
        },
      });

      if (result.success && result.data?.customRole) {
        // Select the newly created role
        handleRoleSelect(result.data.customRole.name, result.data.customRole.id);
      }
    } catch (error) {
      const errorMessage = getApiErrorMessage(error, t('failedToCreateRole'));
      toastManager.error(t('failedToCreateRole'), errorMessage);
    }
  }, [createRoleMutation, handleRoleSelect, canCreateCustomRoles, t]);

  // Handle deleting a custom role
  const handleDeleteCustomRole = useCallback(async (roleId: string, roleName: string) => {
    try {
      await deleteRoleMutation.mutateAsync({ param: { id: roleId } });
      toastManager.success(t('roleDeleted'), t('roleDeletedMessage', { name: roleName }));
    } catch (error) {
      console.error('[ModelSelectionModal] Failed to delete custom role:', error);
      const errorMessage = getApiErrorMessage(error, t('failedToDeleteRole'));
      toastManager.error(t('failedToDeleteRole'), errorMessage);
    }
  }, [deleteRoleMutation, t]);

  // Handle clearing role - either from participant or pendingRoles
  const handleClearRoleInternal = useCallback((modelId: string) => {
    const modelData = orderedModels.find(om => om.model.id === modelId);
    if (modelData?.participant) {
      // Model is toggled on - clear from participant
      onClearRole(modelId);
    } else {
      // Model is not toggled on - clear from pendingRoles
      setPendingRoles((prev) => {
        const next = { ...prev };
        delete next[modelId];
        return next;
      });
    }
  }, [orderedModels, onClearRole]);

  // Handle toggle with pending role application
  const handleToggleWithPendingRole = useCallback((modelId: string) => {
    const modelData = orderedModels.find(om => om.model.id === modelId);
    const pendingRole = pendingRoles[modelId];

    // If toggling ON and there's a pending role, apply it after toggle
    if (!modelData?.participant && pendingRole) {
      // Toggle on first
      onToggle(modelId);
      // Then apply the pending role (will be handled by parent after participant is created)
      // Use setTimeout to ensure the participant is created first
      setTimeout(() => {
        onRoleChange(modelId, pendingRole.role, pendingRole.customRoleId);
        // Clear from pending roles
        setPendingRoles((prev) => {
          const next = { ...prev };
          delete next[modelId];
          return next;
        });
      }, 0);
    } else {
      // Normal toggle
      onToggle(modelId);
    }
  }, [orderedModels, pendingRoles, onToggle, onRoleChange]);

  // Handle preset card click - toggle selection
  const handlePresetCardClick = useCallback((result: PresetSelectionResult) => {
    // Toggle selection - clicking same preset deselects it
    if (selectedPresetId === result.preset.id) {
      setSelectedPresetId(null);
    } else {
      setSelectedPresetId(result.preset.id);
    }
  }, [selectedPresetId]);

  // Handle customize preset - apply preset and switch to Build Custom tab
  // If user preset, enter edit mode to allow updating
  const handleCustomizePreset = useCallback((result: PresetSelectionResult, isUserPreset?: boolean) => {
    if (onPresetSelect) {
      onPresetSelect(result.preset);
    }
    if (isUserPreset) {
      setEditingPresetId(result.preset.id);
    } else {
      setEditingPresetId(null);
    }
    setActiveTab(ModelSelectionTabs.CUSTOM);
  }, [onPresetSelect]);

  // Handle saving current configuration as a user preset
  const handleSaveAsPreset = useCallback(async (presetName: string) => {
    const trimmedName = presetName.trim();
    if (!trimmedName)
      return;

    // Get current selected models with their roles
    const selectedModels = orderedModels.filter(om => om.participant !== null);
    if (selectedModels.length === 0) {
      toastManager.error(tModels('presets.cannotSave'), t('selectAtLeastOneModel'));
      return;
    }

    // Check if any models are missing roles
    const modelsWithoutRoles = selectedModels.filter(om => !om.participant?.role?.trim());
    if (modelsWithoutRoles.length > 0) {
      toastManager.error(
        tModels('presets.cannotSave'),
        tModels('presets.rolesRequired', { count: modelsWithoutRoles.length }),
      );
      return;
    }

    const modelRoles = selectedModels.map(om => ({
      modelId: om.model.id,
      role: om.participant?.role ?? '',
    }));

    try {
      const result = await createPresetMutation.mutateAsync({
        json: {
          name: trimmedName,
          modelRoles,
          mode: ChatModes.ANALYZING,
        },
      });

      // Reset state
      setIsSavingPreset(false);

      // Switch to Presets tab and highlight the new preset
      if (result.success && result.data?.preset?.id) {
        setNewlyCreatedPresetId(result.data.preset.id);
        setActiveTab(ModelSelectionTabs.PRESETS);
        // Clear highlight after animation
        setTimeout(() => setNewlyCreatedPresetId(null), 2000);
      }

      toastManager.success(tModels('presets.presetSaved'), tModels('presets.presetSavedMessage', { name: trimmedName }));
    } catch (error) {
      const errorMessage = getApiErrorMessage(error, tModels('presets.failedToSave'));
      toastManager.error(tModels('presets.failedToSave'), errorMessage);
    }
  }, [orderedModels, createPresetMutation, tModels, t]);

  // Handle updating an existing user preset
  const handleUpdatePreset = useCallback(async () => {
    if (!editingPresetId)
      return;

    // Get current selected models with their roles
    const selectedModels = orderedModels.filter(om => om.participant !== null);
    if (selectedModels.length === 0) {
      toastManager.error(tModels('presets.cannotSave'), t('selectAtLeastOneModelUpdate'));
      return;
    }

    // Check if any models are missing roles
    const modelsWithoutRoles = selectedModels.filter(om => !om.participant?.role?.trim());
    if (modelsWithoutRoles.length > 0) {
      toastManager.error(
        tModels('presets.cannotSave'),
        tModels('presets.rolesRequired', { count: modelsWithoutRoles.length }),
      );
      return;
    }

    const modelRoles = selectedModels.map(om => ({
      modelId: om.model.id,
      role: om.participant?.role ?? '',
    }));

    // Find the preset name for the toast
    const existingPreset = userPresets.find(p => p.id === editingPresetId);
    const presetName = existingPreset?.name ?? 'Preset';

    try {
      await updatePresetMutation.mutateAsync({
        param: { id: editingPresetId },
        json: { modelRoles },
      });

      // Clear edit mode
      setEditingPresetId(null);

      toastManager.success(tModels('presets.presetUpdated'), tModels('presets.presetUpdatedMessage', { name: presetName }));
    } catch (error) {
      const errorMessage = getApiErrorMessage(error, tModels('presets.failedToUpdate'));
      toastManager.error(tModels('presets.failedToUpdate'), errorMessage);
    }
  }, [editingPresetId, orderedModels, userPresets, updatePresetMutation, tModels, t]);

  // Handle deleting a user preset
  const handleDeleteUserPreset = useCallback(async (presetId: string) => {
    try {
      await deletePresetMutation.mutateAsync({ param: { id: presetId } });
      toastManager.success(tModels('presets.presetDeleted'), tModels('presets.presetDeletedMessage'));
    } catch (error) {
      const errorMessage = getApiErrorMessage(error, tModels('presets.failedToDelete'));
      toastManager.error(tModels('presets.failedToDelete'), errorMessage);
    }
  }, [deletePresetMutation, tModels]);

  // Get all models for preset cards
  const allModels = useMemo(() => {
    return orderedModels.map(om => om.model);
  }, [orderedModels]);

  // Get user tier for preset access checks
  const userTier = userTierInfo?.current_tier ?? 'free';

  // Get selected preset for footer display - check both system and user presets
  const selectedPreset = useMemo((): ModelPreset | null => {
    if (!selectedPresetId)
      return null;
    // First check system presets
    const systemPreset = MODEL_PRESETS.find(p => p.id === selectedPresetId);
    if (systemPreset)
      return systemPreset;
    // Then check user presets
    const userPreset = userPresets.find(p => p.id === selectedPresetId);
    if (userPreset) {
      // Convert UserPreset to ModelPreset format
      return {
        id: userPreset.id,
        name: userPreset.name,
        description: `${userPreset.modelRoles.length} models`,
        icon: Sparkles,
        requiredTier: 'free',
        order: 0,
        mode: userPreset.mode,
        searchEnabled: false,
        modelRoles: userPreset.modelRoles,
      };
    }
    return null;
  }, [selectedPresetId, userPresets]);

  // Get model IDs from selected preset
  const selectedPresetModelIds = useMemo(() => {
    if (!selectedPreset)
      return [];
    return selectedPreset.modelRoles.map(mr => mr.modelId);
  }, [selectedPreset]);

  // Validate models have roles before allowing save as preset
  const presetValidation = useMemo(() => {
    const selectedModels = orderedModels.filter(om => om.participant !== null);
    const modelsWithoutRoles = selectedModels.filter(om => !om.participant?.role?.trim());

    return {
      hasSelectedModels: selectedModels.length > 0,
      modelsWithoutRoles,
      canSave: selectedModels.length > 0 && modelsWithoutRoles.length === 0,
      errorMessage: selectedModels.length === 0
        ? tModels('modal.selectAtLeastOneModel')
        : modelsWithoutRoles.length > 0
          ? tModels('presets.rolesRequired', { count: modelsWithoutRoles.length })
          : null,
    };
  }, [orderedModels, tModels]);

  // Apply preset when flag is set (triggered by tab change handler)
  useEffect(() => {
    if (shouldApplyPresetRef.current && selectedPreset && onPresetSelect) {
      // Apply the preset to populate Build Custom tab
      onPresetSelect(selectedPreset);
      shouldApplyPresetRef.current = false;
    }
  }, [selectedPreset, onPresetSelect]);

  // Handle tab changes - apply preset when switching to custom tab
  const handleTabChange = useCallback((tab: ModelSelectionTab) => {
    // If switching from presets to custom with a preset selected, mark for application
    if (activeTab === ModelSelectionTabs.PRESETS && tab === ModelSelectionTabs.CUSTOM && selectedPresetId) {
      shouldApplyPresetRef.current = true;
      // Clear preset selection immediately when changing tabs
      setSelectedPresetId(null);
    }
    setActiveTab(tab);
  }, [activeTab, selectedPresetId]);

  // Sort models: selected models first, then unselected
  const sortedFilteredModels = useMemo(() => {
    if (activeTab !== ModelSelectionTabs.CUSTOM)
      return filteredModels;

    return [...filteredModels].sort((a, b) => {
      const aSelected = a.participant !== undefined;
      const bSelected = b.participant !== undefined;

      if (aSelected && !bSelected)
        return -1;
      if (!aSelected && bSelected)
        return 1;
      return 0;
    });
  }, [filteredModels, activeTab]);

  // Apply selected preset when Save is clicked
  const handleApplyPreset = useCallback(() => {
    if (!selectedPreset || !onPresetSelect)
      return;

    // Check for models incompatible with vision files
    const incompatibleCount = incompatibleModelIds
      ? selectedPresetModelIds.filter(id => incompatibleModelIds.has(id)).length
      : 0;

    // Toast when models excluded from preset due to vision incompatibility
    if (incompatibleCount > 0 && incompatibleCount < selectedPresetModelIds.length) {
      toastManager.warning(
        tModels('presetModelsExcluded'),
        tModels('presetModelsExcludedDescription', { count: incompatibleCount }),
      );
    }

    // Only apply if at least one model is compatible
    if (incompatibleCount < selectedPresetModelIds.length) {
      onPresetSelect(selectedPreset);
      onOpenChange(false); // Close modal after selection
    }
  }, [selectedPreset, selectedPresetModelIds, onPresetSelect, onOpenChange, incompatibleModelIds, tModels]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn('!max-w-4xl w-full gap-0', className)}
      >
        <DialogHeader>
          {selectedModelForRole
            ? (
                <>
                  <button
                    type="button"
                    onClick={handleBackToModelList}
                    className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-4"
                  >
                    <ArrowLeft className="h-5 w-5" />
                    <span className="text-sm font-medium">{t('back')}</span>
                  </button>
                  <DialogTitle className="text-xl">
                    {t('setRoleFor', { modelName: selectedModelData?.model.name || '' })}
                  </DialogTitle>
                  <DialogDescription>{t('selectOrEnterRole')}</DialogDescription>
                </>
              )
            : (
                <>
                  <DialogTitle className="text-xl">{t('title')}</DialogTitle>
                  <DialogDescription>{t('subtitle')}</DialogDescription>
                </>
              )}
        </DialogHeader>

        <DialogBody className="flex flex-col py-0 max-h-[min(600px,70vh)] overflow-hidden">
          <AnimatePresence mode="wait">
            {/* Role Selection View */}
            {selectedModelForRole
              ? (
                  <motion.div
                    key="role-selection"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="flex flex-col flex-1 min-h-0"
                  >
                    {/* Scrollable role list - NO padding */}
                    <ScrollArea className="h-[min(420px,50vh)]">
                      <div className="flex flex-col">
                        {/* Predefined roles */}
                        {PREDEFINED_ROLE_TEMPLATES.map((role) => {
                          const Icon = role.icon;
                          // Check both participant role and pending role
                          const currentRole = selectedModelData?.participant?.role
                            ?? (selectedModelForRole ? pendingRoles[selectedModelForRole]?.role : undefined);
                          const isSelected = currentRole === role.name;

                          return (
                            <button
                              type="button"
                              key={role.name}
                              onClick={() => {
                              // Toggle: if already selected, clear it
                                if (isSelected) {
                                  handleClearRoleInternal(selectedModelForRole!);
                                  handleBackToModelList();
                                } else {
                                  handleRoleSelect(role.name);
                                }
                              }}
                              className={cn(
                                'w-full p-3 transition-all text-left rounded-lg',
                                'hover:bg-white/5 hover:backdrop-blur-sm',
                                isSelected && 'bg-white/10',
                              )}
                            >
                              <div className="flex items-center gap-3">
                                <RoleColorBadge roleName={role.name} icon={Icon} />
                                <div className="flex-1 min-w-0">
                                  <h4 className="text-base font-normal">{role.category}</h4>
                                </div>
                                {isSelected && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleClearRoleInternal(selectedModelForRole!);
                                      handleBackToModelList();
                                    }}
                                    className="shrink-0 p-1 rounded-full hover:bg-white/10 transition-colors"
                                  >
                                    <X className="h-4 w-4 text-muted-foreground" />
                                  </button>
                                )}
                              </div>
                            </button>
                          );
                        })}

                        {/* Custom roles */}
                        {customRoles.map((role) => {
                          // Check both participant role and pending role
                          const currentRole = selectedModelData?.participant?.role
                            ?? (selectedModelForRole ? pendingRoles[selectedModelForRole]?.role : undefined);
                          const isSelected = currentRole === role.name;

                          return (
                            <button
                              type="button"
                              key={role.id}
                              onClick={() => {
                                // Toggle: if already selected, clear it
                                if (isSelected) {
                                  handleClearRoleInternal(selectedModelForRole!);
                                  handleBackToModelList();
                                } else {
                                  handleRoleSelect(role.name, role.id);
                                }
                              }}
                              className={cn(
                                'group w-full p-3 transition-all text-left rounded-lg',
                                'hover:bg-white/5 hover:backdrop-blur-sm',
                                isSelected && 'bg-white/10',
                              )}
                            >
                              <div className="flex items-center gap-3">
                                <RoleColorBadge roleName={role.name} />
                                <div className="flex-1 min-w-0">
                                  <h4 className="text-base font-normal truncate">{role.name}</h4>
                                </div>
                                {/* Delete button - shows on hover */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteCustomRole(role.id, role.name);
                                  }}
                                  className="shrink-0 p-1 rounded-full opacity-0 group-hover:opacity-100 hover:bg-destructive/20 transition-all"
                                  aria-label="Delete custom role"
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </button>
                                {isSelected && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleClearRoleInternal(selectedModelForRole!);
                                      handleBackToModelList();
                                    }}
                                    className="shrink-0 p-1 rounded-full hover:bg-white/10 transition-colors"
                                  >
                                    <X className="h-4 w-4 text-muted-foreground" />
                                  </button>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </ScrollArea>

                    {/* Sticky Footer - Custom Role Input */}
                    <div className="shrink-0 py-3">
                      {!canCreateCustomRoles
                        ? (
                            <div
                              className={cn(
                                'flex items-center gap-2 px-3 py-2 rounded-xl',
                                'bg-destructive/10 border border-destructive/20',
                                'text-xs text-destructive',
                              )}
                            >
                              <AlertCircle className="size-3 shrink-0" />
                              <span className="flex-1">{t('customRolesPaidOnly')}</span>
                              <Button
                                variant="default"
                                size="sm"
                                className="h-6 rounded-full text-[10px] font-medium shrink-0"
                                onClick={() => router.push('/chat/pricing')}
                              >
                                {t('upgrade')}
                              </Button>
                            </div>
                          )
                        : (
                            <CustomRoleForm
                              onSubmit={handleCustomRoleCreate}
                              isPending={createRoleMutation.isPending}
                            />
                          )}
                    </div>
                  </motion.div>
                )
              : (
                  /* Model Selection View with Tabs */
                  <div
                    key="model-list"
                    className="flex flex-col pt-4 pb-0 min-h-0"
                  >
                    <Tabs
                      value={activeTab}
                      onValueChange={v => handleTabChange(v as ModelSelectionTab)}
                      className="w-full"
                    >
                      <TabsList className="grid w-full grid-cols-2 mb-4">
                        <TabsTrigger value={ModelSelectionTabs.PRESETS}>
                          {tModels('presets.title')}
                        </TabsTrigger>
                        <TabsTrigger value={ModelSelectionTabs.CUSTOM}>
                          {tModels('buildCustom.title')}
                        </TabsTrigger>
                      </TabsList>

                      {/* Presets Tab Content */}
                      <TabsContent value={ModelSelectionTabs.PRESETS} className="mt-0 h-[min(520px,55vh)] flex flex-col">
                        <ScrollArea className="flex-1 -mr-3">
                          <div className="pr-3 pb-4 space-y-4">
                            {/* My Presets Section - Loading State */}
                            {isLoadingUserPresets && (
                              <div>
                                <h4 className="text-xs font-medium text-muted-foreground mb-2 px-1">
                                  {tModels('presets.myPresets')}
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <PresetCardSkeleton />
                                  <PresetCardSkeleton />
                                </div>
                              </div>
                            )}

                            {/* My Presets Section */}
                            {!isLoadingUserPresets && userPresets.length > 0 && (
                              <div>
                                <h4 className="text-xs font-medium text-muted-foreground mb-2 px-1">
                                  {tModels('presets.myPresets')}
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <AnimatePresence initial={false}>
                                    {userPresets.map((userPreset) => {
                                      // Convert UserPreset to ModelPreset-like format for the card
                                      const presetForCard: ModelPreset = {
                                        id: userPreset.id,
                                        name: userPreset.name,
                                        description: `${userPreset.modelRoles.length} models`,
                                        icon: Sparkles,
                                        requiredTier: 'free',
                                        order: 0,
                                        mode: userPreset.mode,
                                        searchEnabled: false,
                                        modelRoles: userPreset.modelRoles,
                                      };
                                      const isNewlyCreated = newlyCreatedPresetId === userPreset.id;
                                      return (
                                        <motion.div
                                          key={userPreset.id}
                                          initial={isNewlyCreated ? { opacity: 0, scale: 0.9 } : { opacity: 1 }}
                                          animate={isNewlyCreated
                                            ? {
                                                opacity: 1,
                                                scale: 1,
                                                boxShadow: ['0 0 0 0 rgba(var(--primary), 0)', '0 0 0 4px rgba(var(--primary), 0.3)', '0 0 0 0 rgba(var(--primary), 0)'],
                                              }
                                            : { opacity: 1, scale: 1 }}
                                          exit={{
                                            opacity: 0,
                                            scale: 0.95,
                                            transition: { duration: 0.15, ease: 'easeOut' },
                                          }}
                                          transition={isNewlyCreated
                                            ? { duration: 0.5, boxShadow: { duration: 1.5, repeat: 1 } }
                                            : { duration: 0.15 }}
                                          className={cn(isNewlyCreated && 'ring-2 ring-primary ring-offset-2 ring-offset-background rounded-xl')}
                                        >
                                          <ModelPresetCard
                                            preset={presetForCard}
                                            allModels={allModels}
                                            userTier={userTier}
                                            onSelect={handlePresetCardClick}
                                            isSelected={selectedPresetId === userPreset.id}
                                            incompatibleModelIds={incompatibleModelIds}
                                            onCustomize={result => handleCustomizePreset(result, true)}
                                            isUserPreset
                                            onDelete={() => handleDeleteUserPreset(userPreset.id)}
                                          />
                                        </motion.div>
                                      );
                                    })}
                                  </AnimatePresence>
                                </div>
                              </div>
                            )}

                            {/* System Presets Section */}
                            <div>
                              {(userPresets.length > 0 || isLoadingUserPresets) && (
                                <h4 className="text-xs font-medium text-muted-foreground mb-2 px-1">
                                  {tModels('presets.systemPresets')}
                                </h4>
                              )}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {MODEL_PRESETS.map(preset => (
                                  <ModelPresetCard
                                    key={preset.id}
                                    preset={preset}
                                    allModels={allModels}
                                    userTier={userTier}
                                    onSelect={handlePresetCardClick}
                                    isSelected={selectedPresetId === preset.id}
                                    incompatibleModelIds={incompatibleModelIds}
                                    onCustomize={handleCustomizePreset}
                                  />
                                ))}
                              </div>
                            </div>
                          </div>
                        </ScrollArea>

                      </TabsContent>

                      {/* Build Custom Tab Content */}
                      <TabsContent value={ModelSelectionTabs.CUSTOM} className="mt-0 h-[min(520px,55vh)] flex flex-col">
                        {/* Search Input */}
                        <div className="shrink-0 mb-4">
                          <Input
                            ref={searchInputRef}
                            type="text"
                            placeholder={t('searchPlaceholder')}
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            startIcon={<Search />}
                            endIcon={searchQuery
                              ? (
                                  <X
                                    className="cursor-pointer"
                                    onClick={() => {
                                      setSearchQuery('');
                                      searchInputRef.current?.focus({ preventScroll: true });
                                    }}
                                  />
                                )
                              : undefined}
                            endIconClickable={!!searchQuery}
                          />
                        </div>

                        {/* Error: No models selected */}
                        {selectedCount === 0 && (
                          <div
                            className={cn(
                              'flex items-center gap-2 px-3 py-2 rounded-xl mb-2',
                              'bg-destructive/10 border border-destructive/20',
                              'text-xs text-destructive',
                            )}
                          >
                            <AlertCircle className="size-3.5 shrink-0" />
                            <span>{tModels('minimumRequired.description', { count: 1 })}</span>
                          </div>
                        )}

                        {/* Model List */}
                        <div className="flex-1 min-h-0 -mr-3">
                          {sortedFilteredModels.length === 0
                            ? (
                                <div className="flex flex-col items-center justify-center py-12 h-full pr-3">
                                  <p className="text-sm text-muted-foreground">{tModels('noModelsFound')}</p>
                                </div>
                              )
                            : enableDrag && !isFiltering
                              ? (
                                  <ScrollArea className="h-full">
                                    <Reorder.Group
                                      axis="y"
                                      values={sortedFilteredModels}
                                      onReorder={handleReorder}
                                      layoutScroll
                                      className="flex flex-col gap-2 pr-3 pb-4"
                                    >
                                      {sortedFilteredModels.map(orderedModel => (
                                        <ModelItem
                                          key={orderedModel.model.id}
                                          orderedModel={orderedModel}
                                          onToggle={() => handleToggleWithPendingRole(orderedModel.model.id)}
                                          onClearRole={() => handleClearRoleInternal(orderedModel.model.id)}
                                          selectedCount={selectedCount}
                                          maxModels={maxModels}
                                          enableDrag
                                          onOpenRolePanel={() => handleOpenRoleSelection(orderedModel.model.id)}
                                          isIncompatibleWithFiles={incompatibleModelIds?.has(orderedModel.model.id)}
                                          pendingRole={pendingRoles[orderedModel.model.id]}
                                        />
                                      ))}
                                    </Reorder.Group>
                                  </ScrollArea>
                                )
                              : (
                                  <ScrollArea className="h-full">
                                    <div className="flex flex-col gap-2 pr-3 pb-4">
                                      {sortedFilteredModels.map(orderedModel => (
                                        <ModelItem
                                          key={orderedModel.model.id}
                                          orderedModel={orderedModel}
                                          onToggle={() => handleToggleWithPendingRole(orderedModel.model.id)}
                                          onClearRole={() => handleClearRoleInternal(orderedModel.model.id)}
                                          selectedCount={selectedCount}
                                          maxModels={maxModels}
                                          enableDrag={false}
                                          onOpenRolePanel={() => handleOpenRoleSelection(orderedModel.model.id)}
                                          isIncompatibleWithFiles={incompatibleModelIds?.has(orderedModel.model.id)}
                                          pendingRole={pendingRoles[orderedModel.model.id]}
                                        />
                                      ))}
                                    </div>
                                  </ScrollArea>
                                )}
                        </div>

                      </TabsContent>
                    </Tabs>
                  </div>
                )}
          </AnimatePresence>
        </DialogBody>

        {/* Footer - outside DialogBody for full-width border */}
        {!selectedModelForRole && (
          <div className="-mx-6 -mb-6 border-t border-border">
            <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4">
              {/* Left side - Preset actions (Build Custom tab only) */}
              <div className="flex items-center gap-2 min-w-0">
                {activeTab === ModelSelectionTabs.CUSTOM && (
                  editingPresetId
                    ? (
                        // Edit mode - show Update and Save as New buttons
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleUpdatePreset}
                            loading={updatePresetMutation.isPending}
                            className="text-xs sm:text-sm shrink-0"
                          >
                            <span className="truncate max-w-[100px] sm:max-w-none">
                              {tModels('presets.update')}
                            </span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (!presetValidation.canSave) {
                                toastManager.error(tModels('presets.cannotSave'), presetValidation.errorMessage ?? '');
                                return;
                              }
                              setEditingPresetId(null);
                              setIsSavingPreset(true);
                            }}
                            disabled={updatePresetMutation.isPending}
                            className="text-xs sm:text-sm shrink-0"
                          >
                            {tModels('presets.saveAsNew')}
                          </Button>
                        </div>
                      )
                    : isSavingPreset
                      ? (
                          <PresetNameForm
                            onSubmit={handleSaveAsPreset}
                            onCancel={() => setIsSavingPreset(false)}
                            isPending={createPresetMutation.isPending}
                          />
                        )
                      : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (!presetValidation.canSave) {
                                toastManager.error(tModels('presets.cannotSave'), presetValidation.errorMessage ?? '');
                                return;
                              }
                              setIsSavingPreset(true);
                            }}
                            className="text-xs sm:text-sm"
                          >
                            {tModels('presets.saveAsPreset')}
                          </Button>
                        )
                )}
              </div>

              {/* Right side - Main action button */}
              <Button
                onClick={activeTab === ModelSelectionTabs.PRESETS ? handleApplyPreset : () => onOpenChange(false)}
                disabled={activeTab === ModelSelectionTabs.PRESETS && !selectedPreset}
                variant="white"
                size="sm"
                className="shrink-0 text-xs sm:text-sm"
              >
                {activeTab === ModelSelectionTabs.PRESETS ? tModels('presets.save') : tModels('presets.done')}
              </Button>
            </div>
          </div>
        )}

        {children}
      </DialogContent>
    </Dialog>
  );
}
