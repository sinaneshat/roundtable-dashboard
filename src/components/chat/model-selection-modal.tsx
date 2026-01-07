'use client';

import { AnimatePresence, motion, Reorder } from 'motion/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ModelSelectionTab, SubscriptionTier } from '@/api/core/enums';
import { ChatModes, DEFAULT_MODEL_SELECTION_TAB, ModelSelectionTabs, PlanTypes, PREDEFINED_ROLE_TEMPLATES, SubscriptionTiers } from '@/api/core/enums';
// Direct import to avoid barrel export pulling in server-only slug-generator.service.ts
import { createRoleSystemPrompt } from '@/api/services/prompts/prompts.service';
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
import type { useCustomRolesQuery } from '@/hooks/queries';
import { useUsageStatsQuery, useUserPresetsQuery } from '@/hooks/queries';
import { useBoolean } from '@/hooks/utils';
import type { ModelPreset, PresetSelectionResult } from '@/lib/config/model-presets';
import { MODEL_PRESETS } from '@/lib/config/model-presets';
import type { OrderedModel } from '@/lib/schemas/model-schemas';
import { toastManager } from '@/lib/toast';
import { cn } from '@/lib/ui/cn';
import { getApiErrorMessage } from '@/lib/utils';

import { CustomRoleForm } from './custom-role-form';
import { ModelItem } from './model-item';
import { ModelPresetCard } from './model-preset-card';
import { PresetNameForm } from './preset-name-form';
import { RoleColorBadge } from './role-color-badge';

type CustomRolesInfiniteQuery = ReturnType<typeof useCustomRolesQuery>;
type CustomRolesQueryData = NonNullable<CustomRolesInfiniteQuery['data']>;
type CustomRolesPage = CustomRolesQueryData['pages'][number];
type CustomRolesSuccessPage = Extract<CustomRolesPage, { success: true }>;
type CustomRole = NonNullable<CustomRolesSuccessPage['data']>['items'][number];

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
  const tRoles = useTranslations('chat.roles');
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState(DEFAULT_MODEL_SELECTION_TAB);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const shouldApplyPresetRef = useRef(false);
  const [selectedModelForRole, setSelectedModelForRole] = useState<string | null>(null);
  const [pendingRoles, setPendingRoles] = useState<Record<string, { role: string; customRoleId?: string }>>({});

  const {
    data: userPresetsData,
    isLoading: isLoadingUserPresets,
  } = useUserPresetsQuery(open);

  const userPresets = useMemo(() => {
    if (!userPresetsData?.pages) {
      return [];
    }
    return userPresetsData.pages.flatMap((page) => {
      if (page.success && page.data?.items) {
        return page.data.items;
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
  const isPaidUser = usageData?.data?.plan?.type === PlanTypes.PAID;
  const canCreateCustomRoles = isPaidUser;

  const isFiltering = searchQuery.trim().length > 0;

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

      if (result.success && result.data?.customRole) {
        handleRoleSelect(result.data.customRole.name, result.data.customRole.id);
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
      toastManager.error(tModels('presets.cannotSave'), t('selectAtLeastOneModel'));
      return;
    }

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

      isSavingPreset.onFalse();

      if (result.success && result.data?.preset?.id) {
        setNewlyCreatedPresetId(result.data.preset.id);
        setActiveTab(ModelSelectionTabs.PRESETS);
        setTimeout(() => setNewlyCreatedPresetId(null), 2000);
      }

      toastManager.success(tModels('presets.presetSaved'), tModels('presets.presetSavedMessage', { name: trimmedName }));
    } catch (error) {
      const errorMessage = getApiErrorMessage(error, tModels('presets.failedToSave'));
      toastManager.error(tModels('presets.failedToSave'), errorMessage);
    }
  }, [orderedModels, createPresetMutation, tModels, t, isSavingPreset]);

  const handleUpdatePreset = useCallback(async () => {
    if (!editingPresetId)
      return;

    const selectedModels = orderedModels.filter(om => om.participant !== null);
    if (selectedModels.length === 0) {
      toastManager.error(tModels('presets.cannotSave'), t('selectAtLeastOneModelUpdate'));
      return;
    }

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

    const existingPreset = userPresets.find(p => p.id === editingPresetId);
    const presetName = existingPreset?.name ?? 'Preset';

    try {
      await updatePresetMutation.mutateAsync({
        param: { id: editingPresetId },
        json: { modelRoles },
      });

      setEditingPresetId(null);

      toastManager.success(tModels('presets.presetUpdated'), tModels('presets.presetUpdatedMessage', { name: presetName }));
    } catch (error) {
      const errorMessage = getApiErrorMessage(error, tModels('presets.failedToUpdate'));
      toastManager.error(tModels('presets.failedToUpdate'), errorMessage);
    }
  }, [editingPresetId, orderedModels, userPresets, updatePresetMutation, tModels, t]);

  const handleDeleteUserPreset = useCallback(async (presetId: string) => {
    try {
      await deletePresetMutation.mutateAsync({ param: { id: presetId } });
      toastManager.success(tModels('presets.presetDeleted'), tModels('presets.presetDeletedMessage'));
    } catch (error) {
      const errorMessage = getApiErrorMessage(error, tModels('presets.failedToDelete'));
      toastManager.error(tModels('presets.failedToDelete'), errorMessage);
    }
  }, [deletePresetMutation, tModels]);

  const allModels = useMemo(() => {
    return orderedModels.map(om => om.model);
  }, [orderedModels]);

  const userTier = userTierInfo?.current_tier ?? SubscriptionTiers.FREE;

  const selectedPreset = useMemo((): ModelPreset | null => {
    if (!selectedPresetId)
      return null;
    const systemPreset = MODEL_PRESETS.find(p => p.id === selectedPresetId);
    if (systemPreset)
      return systemPreset;
    const userPreset = userPresets.find(p => p.id === selectedPresetId);
    if (userPreset) {
      return {
        id: userPreset.id,
        name: userPreset.name,
        description: `${userPreset.modelRoles.length} models`,
        icon: Icons.sparkles,
        requiredTier: SubscriptionTiers.FREE,
        order: 0,
        mode: userPreset.mode,
        searchEnabled: false,
        modelRoles: userPreset.modelRoles,
      };
    }
    return null;
  }, [selectedPresetId, userPresets]);

  const selectedPresetModelIds = useMemo(() => {
    if (!selectedPreset)
      return [];
    return selectedPreset.modelRoles.map(mr => mr.modelId);
  }, [selectedPreset]);

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

    const incompatibleCount = incompatibleModelIds
      ? selectedPresetModelIds.filter(id => incompatibleModelIds.has(id)).length
      : 0;

    if (incompatibleCount > 0 && incompatibleCount < selectedPresetModelIds.length) {
      toastManager.warning(
        tModels('presetModelsExcluded'),
        tModels('presetModelsExcludedDescription', { count: incompatibleCount }),
      );
    }

    if (incompatibleCount < selectedPresetModelIds.length) {
      onPresetSelect(selectedPreset);
      onOpenChange(false);
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

                        {customRoles.map((role) => {
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
                                  aria-label={tRoles('deleteCustomRole')}
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
                          {tModels('presets.title')}
                        </TabsTrigger>
                        <TabsTrigger value={ModelSelectionTabs.CUSTOM}>
                          {tModels('buildCustom.title')}
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value={ModelSelectionTabs.PRESETS} className="mt-0 h-[min(520px,55vh)] flex flex-col">
                        <ScrollArea className="flex-1 -mr-3">
                          <div className="pr-3 pb-4 space-y-4">
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

                            {!isLoadingUserPresets && userPresets.length > 0 && (
                              <div>
                                <h4 className="text-xs font-medium text-muted-foreground mb-2 px-1">
                                  {tModels('presets.myPresets')}
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <AnimatePresence initial={false}>
                                    {userPresets.map((userPreset) => {
                                      const presetForCard: ModelPreset = {
                                        id: userPreset.id,
                                        name: userPreset.name,
                                        description: `${userPreset.modelRoles.length} models`,
                                        icon: Icons.sparkles,
                                        requiredTier: SubscriptionTiers.FREE,
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

                      <TabsContent value={ModelSelectionTabs.CUSTOM} className="mt-0 h-[min(520px,55vh)] flex flex-col">
                        <div className="shrink-0 mb-4">
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
                        </div>

                        {selectedCount === 0 && (
                          <div
                            className={cn(
                              'flex items-center gap-2 px-3 py-2 rounded-xl mb-2',
                              'bg-destructive/10 border border-destructive/20',
                              'text-xs text-destructive',
                            )}
                          >
                            <Icons.alertCircle className="size-3.5 shrink-0" />
                            <span>{tModels('minimumRequired.description', { count: 1 })}</span>
                          </div>
                        )}

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
                              isSavingPreset.onTrue();
                            }}
                            disabled={updatePresetMutation.isPending}
                            className="text-xs sm:text-sm shrink-0"
                          >
                            {tModels('presets.saveAsNew')}
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
                                toastManager.error(tModels('presets.cannotSave'), presetValidation.errorMessage ?? '');
                                return;
                              }
                              isSavingPreset.onTrue();
                            }}
                            className="text-xs sm:text-sm"
                          >
                            {tModels('presets.saveAsPreset')}
                          </Button>
                        )
                )}
              </div>

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
