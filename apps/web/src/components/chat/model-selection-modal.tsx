import type { ChatMode, ModelCapabilityTag, ModelSelectionTab, SubscriptionTier } from '@roundtable/shared';
import {
  ChatModes,
  DEFAULT_MODEL_SELECTION_TAB,
  MODEL_CAPABILITY_TAG_LABELS,
  MODEL_CAPABILITY_TAGS,
  ModelCapabilityTags,
  ModelSelectionTabs,
  PlanTypes,
  PREDEFINED_ROLE_TEMPLATES,
  SubscriptionTiers,
} from '@roundtable/shared';
import { AnimatePresence, motion, Reorder } from 'motion/react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Icons } from '@/components/icons';
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
import { useBoolean } from '@/hooks/utils';
import { Link, useTranslations } from '@/lib/compat';
import { canAccessPreset, createRoleSystemPrompt, MODEL_PRESETS } from '@/lib/config';
import type { ModelPreset, PresetSelectionResult } from '@/lib/config/model-presets';
import { MIN_PARTICIPANTS_REQUIRED } from '@/lib/config/participant-limits';
import type { OrderedModel } from '@/lib/schemas/model-schemas';
import { toastManager } from '@/lib/toast';
import { cn } from '@/lib/ui/cn';
import { getApiErrorMessage } from '@/lib/utils';
import { modelHasTag } from '@/lib/utils/model-tags';

import { CustomRoleForm } from './custom-role-form';
import { ModelItem } from './model-item';
import { ModelPresetCard } from './model-preset-card';
import { PresetNameForm } from './preset-name-form';
import { RoleColorBadge } from './role-color-badge';

type CustomRole = {
  id: string;
  name: string;
  description?: string | null;
  systemPrompt?: string | null;
};

export type ModelSelectionModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderedModels: OrderedModel[];
  onReorder: (reordered: OrderedModel[]) => void;
  customRoles: CustomRole[];
  onToggle: (modelId: string) => void;
  onRoleChange: (modelId: string, role: string, customRoleId?: string) => void;
  onClearRole: (modelId: string) => void;
  onPresetSelect?: (preset: ModelPreset) => void;
  selectedCount: number;
  maxModels: number;
  userTierInfo?: {
    tier_name: string;
    max_models: number;
    current_tier: SubscriptionTier;
    can_upgrade: boolean;
  };
  className?: string;
  children?: ReactNode;
  enableDrag?: boolean;
  visionIncompatibleModelIds?: Set<string>;
  fileIncompatibleModelIds?: Set<string>;
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
  visionIncompatibleModelIds,
  fileIncompatibleModelIds,
}: ModelSelectionModalProps) {
  const t = useTranslations();
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState(DEFAULT_MODEL_SELECTION_TAB);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const shouldApplyPresetRef = useRef(false);
  const [selectedModelForRole, setSelectedModelForRole] = useState<string | null>(null);
  const [pendingRoles, setPendingRoles] = useState<Record<string, { role: string; customRoleId?: string }>>({});
  const [selectedTags, setSelectedTags] = useState<Set<ModelCapabilityTag>>(() => new Set());

  const toggleTag = useCallback((tag: ModelCapabilityTag) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  }, []);

  const {
    data: userPresetsData,
    isLoading: isLoadingUserPresets,
  } = useUserPresetsQuery(open);

  const userPresets = useMemo(() => {
    if (!userPresetsData?.pages) {
      return [];
    }
    return userPresetsData.pages.flatMap((page) => {
      if ((page as any)?.success && (page as any).data?.items) {
        return (page as any).data.items;
      }
      return [];
    });
  }, [userPresetsData]);

  const isSavingPreset = useBoolean(false);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [newlyCreatedPresetId, setNewlyCreatedPresetId] = useState<string | null>(null);

  const createRoleMutation = useCreateCustomRoleMutation();
  const deleteRoleMutation = useDeleteCustomRoleMutation();

  const createPresetMutation = useCreateUserPresetMutation();
  const updatePresetMutation = useUpdateUserPresetMutation();
  const deletePresetMutation = useDeleteUserPresetMutation();

  const { data: usageData } = useUsageStatsQuery();
  const isPaidUser = usageData?.success && typeof usageData.data === 'object' && usageData.data !== null && 'plan' in usageData.data
    ? (usageData.data.plan as { type?: string })?.type === PlanTypes.PAID
    : false;
  const canCreateCustomRoles = isPaidUser;

  const isSearching = searchQuery.trim().length > 0;
  const isTagFiltering = selectedTags.size > 0;
  const isFiltering = isSearching || isTagFiltering;

  const filteredModels = useMemo(() => {
    let filtered = orderedModels;

    // Filter by search query
    if (isSearching) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((om) => {
        const model = om.model;
        return (
          model.name.toLowerCase().includes(query)
          || model.description?.toLowerCase().includes(query)
          || model.provider.toLowerCase().includes(query)
          || model.id.toLowerCase().includes(query)
        );
      });
    }

    // Filter by selected tags (model must have ALL selected tags)
    if (isTagFiltering) {
      filtered = filtered.filter((om) => {
        for (const tag of selectedTags) {
          if (!modelHasTag(om.model, tag)) {
            return false;
          }
        }
        return true;
      });
    }

    return filtered;
  }, [orderedModels, searchQuery, isSearching, isTagFiltering, selectedTags]);

  const handleReorder = useCallback((reorderedItems: typeof orderedModels) => {
    if (isFiltering) {
      return;
    }
    onReorder(reorderedItems);
  }, [isFiltering, onReorder]);

  const selectedModelData = useMemo(() => {
    if (!selectedModelForRole)
      return null;
    return orderedModels.find(om => om.model.id === selectedModelForRole);
  }, [selectedModelForRole, orderedModels]);

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
        // Model is not toggled on - auto-select it and apply role
        // First toggle the model ON
        onToggle(selectedModelForRole);
        // Then apply the role after toggle completes (needs setTimeout for state update)
        const modelId = selectedModelForRole;
        setTimeout(() => {
          onRoleChange(modelId, roleName, customRoleId);
        }, 0);
      }
      handleBackToModelList();
    }
  }, [selectedModelForRole, orderedModels, onRoleChange, onToggle, handleBackToModelList]);

  const handleCustomRoleCreate = useCallback(async (roleName: string) => {
    const trimmedRole = roleName.trim();
    if (!trimmedRole)
      return;

    if (!canCreateCustomRoles) {
      toastManager.error(
        t('upgradeRequired'),
        t('customRolesUpgradeMessage'),
      );
      return;
    }

    try {
      const result = await createRoleMutation.mutateAsync({
        json: {
          name: trimmedRole,
          description: null,
          systemPrompt: createRoleSystemPrompt(trimmedRole),
        },
      });

      if (result && typeof result === 'object' && 'success' in result) {
        const typedResult = result as { success: boolean; data?: unknown };
        if (typedResult.success && typedResult.data && typeof typedResult.data === 'object' && 'customRole' in typedResult.data) {
          const customRole = (typedResult.data as { customRole?: { name: string; id: string } | null }).customRole;
          if (customRole) {
            handleRoleSelect(customRole.name, customRole.id);
          }
        }
      }
    } catch (error) {
      const errorMessage = getApiErrorMessage(error, t('failedToCreateRole'));
      toastManager.error(t('failedToCreateRole'), errorMessage);
    }
  }, [createRoleMutation, handleRoleSelect, canCreateCustomRoles, t]);

  const handleDeleteCustomRole = useCallback(async (roleId: string, roleName: string) => {
    try {
      await deleteRoleMutation.mutateAsync({ param: { id: roleId } });
      toastManager.success(t('roleDeleted'), t('roleDeletedMessage', { name: roleName }));
    } catch (error) {
      const errorMessage = getApiErrorMessage(error, t('failedToDeleteRole'));
      toastManager.error(t('failedToDeleteRole'), errorMessage);
    }
  }, [deleteRoleMutation, t]);

  const handleClearRoleInternal = useCallback((modelId: string) => {
    const modelData = orderedModels.find(om => om.model.id === modelId);
    if (modelData?.participant) {
      onClearRole(modelId);
    } else {
      setPendingRoles((prev) => {
        const next = { ...prev };
        delete next[modelId];
        return next;
      });
    }
  }, [orderedModels, onClearRole]);

  const handleToggleWithPendingRole = useCallback((modelId: string) => {
    const modelData = orderedModels.find(om => om.model.id === modelId);
    const pendingRole = pendingRoles[modelId];

    if (!modelData?.participant && pendingRole) {
      onToggle(modelId);
      setTimeout(() => {
        onRoleChange(modelId, pendingRole.role, pendingRole.customRoleId);
        setPendingRoles((prev) => {
          const next = { ...prev };
          delete next[modelId];
          return next;
        });
      }, 0);
    } else {
      onToggle(modelId);
    }
  }, [orderedModels, pendingRoles, onToggle, onRoleChange]);

  const handlePresetCardClick = useCallback((result: PresetSelectionResult) => {
    if (selectedPresetId === result.preset.id) {
      setSelectedPresetId(null);
    } else {
      setSelectedPresetId(result.preset.id);
    }
  }, [selectedPresetId]);

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

  const handleSaveAsPreset = useCallback(async (presetName: string) => {
    const trimmedName = presetName.trim();
    if (!trimmedName)
      return;

    const selectedModels = orderedModels.filter(om => om.participant !== null);
    if (selectedModels.length === 0) {
      toastManager.error(t('chat.models.presets.cannotSave'), t('selectAtLeastOneModel'));
      return;
    }

    const modelRoles = selectedModels.map(om => ({
      modelId: om.model.id,
      role: om.participant?.role || null,
    }));

    try {
      const result = await createPresetMutation.mutateAsync({
        json: {
          name: trimmedName,
          modelRoles,
          mode: ChatModes.ANALYZING,
        },
      });

      isSavingPreset.onFalse();

      if (result && typeof result === 'object' && 'success' in result) {
        const typedResult = result as { success: boolean; data?: unknown };
        if (typedResult.success && typedResult.data && typeof typedResult.data === 'object' && 'preset' in typedResult.data) {
          const preset = (typedResult.data as { preset?: { id?: string } | null }).preset;
          if (preset?.id) {
            setNewlyCreatedPresetId(preset.id);
            setActiveTab(ModelSelectionTabs.PRESETS);
            setTimeout(() => setNewlyCreatedPresetId(null), 2000);
          }
        }
      }

      toastManager.success(t('chat.models.presets.presetSaved'), t('chat.models.presets.presetSavedMessage', { name: trimmedName }));
    } catch (error) {
      const errorMessage = getApiErrorMessage(error, t('chat.models.presets.failedToSave'));
      toastManager.error(t('chat.models.presets.failedToSave'), errorMessage);
    }
  }, [orderedModels, createPresetMutation, t, isSavingPreset]);

  const handleUpdatePreset = useCallback(async () => {
    if (!editingPresetId)
      return;

    const selectedModels = orderedModels.filter(om => om.participant !== null);
    if (selectedModels.length === 0) {
      toastManager.error(t('chat.models.presets.cannotSave'), t('selectAtLeastOneModelUpdate'));
      return;
    }

    const modelRoles = selectedModels.map(om => ({
      modelId: om.model.id,
      role: om.participant?.role || null,
    }));

    const existingPreset = userPresets.find((p) => {
      if (typeof p === 'object' && p !== null && 'id' in p) {
        return (p as { id: string }).id === editingPresetId;
      }
      return false;
    });
    const presetName = existingPreset && typeof existingPreset === 'object' && 'name' in existingPreset
      ? (existingPreset as { name: string }).name
      : 'Preset';

    try {
      await updatePresetMutation.mutateAsync({
        param: { id: editingPresetId },
        json: { modelRoles },
      });

      setEditingPresetId(null);

      toastManager.success(t('chat.models.presets.presetUpdated'), t('chat.models.presets.presetUpdatedMessage', { name: presetName }));
    } catch (error) {
      const errorMessage = getApiErrorMessage(error, t('chat.models.presets.failedToUpdate'));
      toastManager.error(t('chat.models.presets.failedToUpdate'), errorMessage);
    }
  }, [editingPresetId, orderedModels, userPresets, updatePresetMutation, t]);

  const handleDeleteUserPreset = useCallback(async (presetId: string) => {
    try {
      await deletePresetMutation.mutateAsync({ param: { id: presetId } });
      toastManager.success(t('chat.models.presets.presetDeleted'), t('chat.models.presets.presetDeletedMessage'));
    } catch (error) {
      const errorMessage = getApiErrorMessage(error, t('chat.models.presets.failedToDelete'));
      toastManager.error(t('chat.models.presets.failedToDelete'), errorMessage);
    }
  }, [deletePresetMutation, t]);

  const allModels = useMemo(() => {
    return orderedModels.map(om => om.model);
  }, [orderedModels]);

  // User has Pro access if EITHER source confirms it
  // This handles race conditions where one query loads before the other
  const userTier = (isPaidUser || userTierInfo?.current_tier === SubscriptionTiers.PRO)
    ? SubscriptionTiers.PRO
    : SubscriptionTiers.FREE;

  const hasLockedPresets = useMemo(() => {
    return MODEL_PRESETS.some(preset => !canAccessPreset(preset, userTier));
  }, [userTier]);

  // Sort presets: accessible (FREE) first, then locked (PRO)
  const sortedPresets = useMemo(() => {
    return [...MODEL_PRESETS].sort((a, b) => {
      const aAccessible = canAccessPreset(a, userTier);
      const bAccessible = canAccessPreset(b, userTier);
      if (aAccessible && !bAccessible)
        return -1;
      if (!aAccessible && bAccessible)
        return 1;
      return a.order - b.order;
    });
  }, [userTier]);

  const selectedPreset = useMemo((): ModelPreset | null => {
    if (!selectedPresetId)
      return null;
    const systemPreset = MODEL_PRESETS.find(p => p.id === selectedPresetId);
    if (systemPreset)
      return systemPreset;
    const userPreset = userPresets.find((p) => {
      if (typeof p === 'object' && p !== null && 'id' in p) {
        return (p as { id: string }).id === selectedPresetId;
      }
      return false;
    });
    if (userPreset && typeof userPreset === 'object' && 'id' in userPreset && 'name' in userPreset && 'modelRoles' in userPreset && 'mode' in userPreset) {
      const preset = userPreset as { id: string; name: string; modelRoles: Array<{ modelId: string; role: string | null }>; mode: ChatMode };
      return {
        id: preset.id,
        name: preset.name,
        description: `${preset.modelRoles.length} models`,
        icon: Icons.sparkles,
        requiredTier: SubscriptionTiers.FREE,
        order: 0,
        mode: preset.mode,
        searchEnabled: false,
        modelRoles: preset.modelRoles,
      };
    }
    return null;
  }, [selectedPresetId, userPresets]);

  const selectedPresetModelIds = useMemo(() => {
    if (!selectedPreset)
      return [];
    return selectedPreset.modelRoles.map(mr => mr.modelId);
  }, [selectedPreset]);

  const combinedIncompatibleModelIds = useMemo(() => {
    const combined = new Set<string>();
    if (visionIncompatibleModelIds) {
      for (const id of visionIncompatibleModelIds) {
        combined.add(id);
      }
    }
    if (fileIncompatibleModelIds) {
      for (const id of fileIncompatibleModelIds) {
        combined.add(id);
      }
    }
    return combined;
  }, [visionIncompatibleModelIds, fileIncompatibleModelIds]);

  const presetValidation = useMemo(() => {
    const selectedModels = orderedModels.filter(om => om.participant !== null);

    return {
      hasSelectedModels: selectedModels.length > 0,
      canSave: selectedModels.length > 0,
      errorMessage: selectedModels.length === 0
        ? t('chat.models.modal.selectAtLeastOneModel')
        : null,
    };
  }, [orderedModels, t]);

  useEffect(() => {
    if (shouldApplyPresetRef.current && selectedPreset && onPresetSelect) {
      onPresetSelect(selectedPreset);
      shouldApplyPresetRef.current = false;
    }
  }, [selectedPreset, onPresetSelect]);

  const handleTabChange = useCallback((tab: ModelSelectionTab) => {
    if (activeTab === ModelSelectionTabs.PRESETS && tab === ModelSelectionTabs.CUSTOM && selectedPresetId) {
      shouldApplyPresetRef.current = true;
      setSelectedPresetId(null);
    }
    setActiveTab(tab);
  }, [activeTab, selectedPresetId]);

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

  const handleApplyPreset = useCallback(() => {
    if (!selectedPreset || !onPresetSelect)
      return;

    const incompatibleCount = selectedPresetModelIds.filter(id =>
      combinedIncompatibleModelIds.has(id),
    ).length;

    if (incompatibleCount > 0 && incompatibleCount < selectedPresetModelIds.length) {
      toastManager.warning(
        t('chat.models.presetModelsExcluded'),
        t('chat.models.presetModelsExcludedDescription', { count: incompatibleCount }),
      );
    }

    if (incompatibleCount < selectedPresetModelIds.length) {
      onPresetSelect(selectedPreset);
      onOpenChange(false);
    }
  }, [selectedPreset, selectedPresetModelIds, onPresetSelect, onOpenChange, combinedIncompatibleModelIds, t]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn('!max-w-4xl w-[calc(100%-1.5rem)] sm:w-full gap-0', className)}
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
                    <Icons.arrowLeft className="h-5 w-5" />
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
                    <ScrollArea className="h-[min(420px,50vh)]">
                      <div className="flex flex-col">
                        {PREDEFINED_ROLE_TEMPLATES.map((role) => {
                          const Icon = Icons[role.iconName];
                          const currentRole = selectedModelData?.participant?.role
                            ?? (selectedModelForRole ? pendingRoles[selectedModelForRole]?.role : undefined);
                          const isSelected = currentRole === role.name;

                          return (
                            <button
                              type="button"
                              key={role.name}
                              onClick={() => {
                                if (isSelected) {
                                  handleClearRoleInternal(selectedModelForRole!);
                                  handleBackToModelList();
                                } else {
                                  handleRoleSelect(role.name);
                                }
                              }}
                              className={cn(
                                'w-full p-3 transition-all text-left rounded-lg',
                                'hover:bg-white/[0.07]',
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
                                    className="shrink-0 p-1 rounded-full hover:bg-white/[0.07] transition-colors"
                                  >
                                    <Icons.x className="h-4 w-4 text-muted-foreground" />
                                  </button>
                                )}
                              </div>
                            </button>
                          );
                        })}

                        {customRoles.map((role: CustomRole) => {
                          const currentRole = selectedModelData?.participant?.role
                            ?? (selectedModelForRole ? pendingRoles[selectedModelForRole]?.role : undefined);
                          const isSelected = currentRole === role.name;

                          return (
                            <button
                              type="button"
                              key={role.id}
                              onClick={() => {
                                if (isSelected) {
                                  handleClearRoleInternal(selectedModelForRole!);
                                  handleBackToModelList();
                                } else {
                                  handleRoleSelect(role.name, role.id);
                                }
                              }}
                              className={cn(
                                'group w-full p-3 transition-all text-left rounded-lg',
                                'hover:bg-white/[0.07]',
                                isSelected && 'bg-white/10',
                              )}
                            >
                              <div className="flex items-center gap-3">
                                <RoleColorBadge roleName={role.name} />
                                <div className="flex-1 min-w-0">
                                  <h4 className="text-base font-normal truncate">{role.name}</h4>
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteCustomRole(role.id, role.name);
                                  }}
                                  className="shrink-0 p-1 rounded-full opacity-0 group-hover:opacity-100 hover:bg-destructive/20 transition-all"
                                  aria-label={t('chat.roles.deleteCustomRole')}
                                >
                                  <Icons.trash className="h-4 w-4 text-destructive" />
                                </button>
                                {isSelected && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleClearRoleInternal(selectedModelForRole!);
                                      handleBackToModelList();
                                    }}
                                    className="shrink-0 p-1 rounded-full hover:bg-white/[0.07] transition-colors"
                                  >
                                    <Icons.x className="h-4 w-4 text-muted-foreground" />
                                  </button>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </ScrollArea>

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
                              <Icons.alertCircle className="size-3 shrink-0" />
                              <span className="flex-1">{t('customRolesPaidOnly')}</span>
                              <Button
                                variant="default"
                                size="sm"
                                className="h-6 rounded-full text-[10px] font-medium shrink-0"
                                asChild
                              >
                                <Link href="/chat/pricing">
                                  {t('upgrade')}
                                </Link>
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
                  <div
                    key="model-list"
                    className="flex flex-col pt-4 pb-0 min-h-0"
                  >
                    <Tabs
                      value={activeTab}
                      onValueChange={(v) => {
                        if (v === ModelSelectionTabs.PRESETS || v === ModelSelectionTabs.CUSTOM) {
                          handleTabChange(v);
                        }
                      }}
                      className="w-full"
                    >
                      <TabsList className="grid w-full grid-cols-2 mb-4">
                        <TabsTrigger value={ModelSelectionTabs.PRESETS}>
                          {t('chat.models.presets.title')}
                        </TabsTrigger>
                        <TabsTrigger value={ModelSelectionTabs.CUSTOM}>
                          {t('chat.models.buildCustom.title')}
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value={ModelSelectionTabs.PRESETS} className="mt-0 h-[min(520px,55vh)] flex flex-col">
                        <ScrollArea className="flex-1 -mr-3">
                          <div className="pr-3 pb-4 space-y-4">
                            {isLoadingUserPresets && (
                              <div>
                                <h4 className="text-xs font-medium text-muted-foreground mb-2 px-1">
                                  {t('chat.models.presets.myPresets')}
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <PresetCardSkeleton />
                                  <PresetCardSkeleton />
                                </div>
                              </div>
                            )}

                            {!isLoadingUserPresets && userPresets.length > 0 && (
                              <div>
                                <h4 className="text-xs font-medium text-muted-foreground mb-2 px-1">
                                  {t('chat.models.presets.myPresets')}
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <AnimatePresence initial={false}>
                                    {userPresets.map((userPreset) => {
                                      if (typeof userPreset !== 'object' || userPreset === null || !('id' in userPreset) || !('name' in userPreset) || !('modelRoles' in userPreset) || !('mode' in userPreset)) {
                                        return null;
                                      }
                                      const preset = userPreset as { id: string; name: string; modelRoles: Array<{ modelId: string; role: string | null }>; mode: ChatMode };
                                      const presetForCard: ModelPreset = {
                                        id: preset.id,
                                        name: preset.name,
                                        description: `${preset.modelRoles.length} models`,
                                        icon: Icons.sparkles,
                                        requiredTier: SubscriptionTiers.FREE,
                                        order: 0,
                                        mode: preset.mode,
                                        searchEnabled: false,
                                        modelRoles: preset.modelRoles,
                                      };
                                      const isNewlyCreated = newlyCreatedPresetId === preset.id;
                                      return (
                                        <motion.div
                                          key={preset.id}
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
                                            isSelected={selectedPresetId === preset.id}
                                            incompatibleModelIds={combinedIncompatibleModelIds}
                                            onCustomize={result => handleCustomizePreset(result, true)}
                                            isUserPreset
                                            onDelete={() => handleDeleteUserPreset(preset.id)}
                                          />
                                        </motion.div>
                                      );
                                    })}
                                  </AnimatePresence>
                                </div>
                              </div>
                            )}

                            <div>
                              {(userPresets.length > 0 || isLoadingUserPresets) && (
                                <h4 className="text-xs font-medium text-muted-foreground mb-2 px-1">
                                  {t('chat.models.presets.systemPresets')}
                                </h4>
                              )}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {sortedPresets.map(preset => (
                                  <ModelPresetCard
                                    key={preset.id}
                                    preset={preset}
                                    allModels={allModels}
                                    userTier={userTier}
                                    onSelect={handlePresetCardClick}
                                    isSelected={selectedPresetId === preset.id}
                                    incompatibleModelIds={combinedIncompatibleModelIds}
                                    onCustomize={handleCustomizePreset}
                                  />
                                ))}
                              </div>
                            </div>
                          </div>
                        </ScrollArea>

                      </TabsContent>

                      <TabsContent value={ModelSelectionTabs.CUSTOM} className="mt-0 h-[min(520px,55vh)] flex flex-col">
                        <div className="shrink-0 space-y-3 mb-4">
                          <Input
                            ref={searchInputRef}
                            type="text"
                            placeholder={t('searchPlaceholder')}
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            startIcon={<Icons.search />}
                            endIcon={searchQuery
                              ? (
                                  <Icons.x
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

                          {/* Capability tag filters - inline scrollable */}
                          <div className="flex items-center justify-center gap-2">
                            <ScrollArea orientation="horizontal" className="flex-1 -mx-1">
                              <div className="flex items-center gap-1.5 px-1 pb-1">
                                {MODEL_CAPABILITY_TAGS.map((tag) => {
                                  const isSelected = selectedTags.has(tag);
                                  const TagIcon = tag === ModelCapabilityTags.FAST
                                    ? Icons.zap
                                    : tag === ModelCapabilityTags.VISION
                                      ? Icons.eye
                                      : tag === ModelCapabilityTags.REASONING
                                        ? Icons.brain
                                        : Icons.fileText; // PDF

                                  return (
                                    <button
                                      key={tag}
                                      type="button"
                                      onClick={() => toggleTag(tag)}
                                      className={cn(
                                        'inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium transition-all shrink-0',
                                        'border whitespace-nowrap active:scale-95',
                                        isSelected
                                          ? 'bg-primary/20 border-primary/40 text-primary shadow-sm'
                                          : 'bg-muted/40 border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground hover:border-border/50',
                                      )}
                                    >
                                      <TagIcon className="size-3.5" />
                                      {MODEL_CAPABILITY_TAG_LABELS[tag]}
                                    </button>
                                  );
                                })}
                              </div>
                            </ScrollArea>
                            {/* Clear button - sticky on right, vertically centered */}
                            {selectedTags.size > 0 && (
                              <button
                                type="button"
                                onClick={() => setSelectedTags(new Set())}
                                className={cn(
                                  'shrink-0 inline-flex items-center justify-center',
                                  'size-8 rounded-full',
                                  'bg-muted/60 hover:bg-destructive/20',
                                  'text-muted-foreground hover:text-destructive',
                                  'border border-transparent hover:border-destructive/30',
                                  'transition-all active:scale-95',
                                )}
                                title={t('chat.models.clearFilters')}
                              >
                                <Icons.x className="size-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {selectedCount < MIN_PARTICIPANTS_REQUIRED && (
                          <div
                            className={cn(
                              'flex items-center gap-2 px-3 py-2 rounded-xl mb-2',
                              'bg-destructive/10 border border-destructive/20',
                              'text-xs text-destructive',
                            )}
                          >
                            <Icons.alertCircle className="size-3.5 shrink-0" />
                            <span>{t('chat.models.minimumRequired.description', { count: MIN_PARTICIPANTS_REQUIRED })}</span>
                          </div>
                        )}

                        <div className="flex-1 min-h-0 -mr-3">
                          {sortedFilteredModels.length === 0
                            ? (
                                <div className="flex flex-col items-center justify-center py-12 h-full pr-3">
                                  <p className="text-sm text-muted-foreground">{t('chat.models.noModelsFound')}</p>
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
                                          isVisionIncompatible={visionIncompatibleModelIds?.has(orderedModel.model.id)}
                                          isFileIncompatible={fileIncompatibleModelIds?.has(orderedModel.model.id)}
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
                                          isVisionIncompatible={visionIncompatibleModelIds?.has(orderedModel.model.id)}
                                          isFileIncompatible={fileIncompatibleModelIds?.has(orderedModel.model.id)}
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

        {!selectedModelForRole && (
          <div className="-mx-6 -mb-6 border-t border-border">
            <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4">
              <div className="flex items-center gap-2 min-w-0">
                {activeTab === ModelSelectionTabs.CUSTOM && (
                  editingPresetId
                    ? (
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleUpdatePreset}
                            loading={updatePresetMutation.isPending}
                            className="text-xs sm:text-sm shrink-0"
                          >
                            <span className="truncate max-w-[100px] sm:max-w-none">
                              {t('chat.models.presets.update')}
                            </span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (!presetValidation.canSave) {
                                toastManager.error(t('chat.models.presets.cannotSave'), presetValidation.errorMessage ?? '');
                                return;
                              }
                              setEditingPresetId(null);
                              isSavingPreset.onTrue();
                            }}
                            disabled={updatePresetMutation.isPending}
                            className="text-xs sm:text-sm shrink-0"
                          >
                            {t('chat.models.presets.saveAsNew')}
                          </Button>
                        </div>
                      )
                    : isSavingPreset.value
                      ? (
                          <PresetNameForm
                            onSubmit={handleSaveAsPreset}
                            onCancel={isSavingPreset.onFalse}
                            isPending={createPresetMutation.isPending}
                          />
                        )
                      : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (!presetValidation.canSave) {
                                toastManager.error(t('chat.models.presets.cannotSave'), presetValidation.errorMessage ?? '');
                                return;
                              }
                              isSavingPreset.onTrue();
                            }}
                            className="text-xs sm:text-sm"
                          >
                            {t('chat.models.presets.saveAsPreset')}
                          </Button>
                        )
                )}
              </div>

              <div className="flex items-center gap-2">
                {hasLockedPresets && !isPaidUser && (
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="text-xs sm:text-sm border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                  >
                    <Link href="/chat/pricing" className="flex items-center gap-1.5">
                      <Icons.lockOpen className="size-3.5" />
                      {t('chat.models.unlockAllModels')}
                    </Link>
                  </Button>
                )}
                <Button
                  onClick={activeTab === ModelSelectionTabs.PRESETS ? handleApplyPreset : () => onOpenChange(false)}
                  disabled={activeTab === ModelSelectionTabs.PRESETS && !selectedPreset}
                  variant="white"
                  size="sm"
                  className="shrink-0 text-xs sm:text-sm"
                >
                  {activeTab === ModelSelectionTabs.PRESETS ? t('chat.models.presets.save') : t('chat.models.presets.done')}
                </Button>
              </div>
            </div>
          </div>
        )}

        {children}
      </DialogContent>
    </Dialog>
  );
}
