import type { ModelCapabilityTag, ModelSelectionTab, PredefinedRoleTemplate, SubscriptionTier } from '@roundtable/shared';
import {
  ChatModes,
  createRoleSystemPrompt,
  DEFAULT_MODEL_SELECTION_TAB,
  MODEL_CAPABILITY_TAG_LABELS,
  MODEL_CAPABILITY_TAGS,
  ModelCapabilityTags,
  ModelSelectionTabs,
  PlanTypes,
  PREDEFINED_ROLE_TEMPLATES,
  SubscriptionTiers,
} from '@roundtable/shared';
import { Link } from '@tanstack/react-router';
import { AnimatePresence, motion, Reorder } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Icon } from '@/components/icons';
import { Icons } from '@/components/icons';
import { PresetCardSkeleton } from '@/components/skeletons';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useCreateCustomRoleMutation,
  useCreateUserPresetMutation,
  useDeleteCustomRoleMutation,
  useDeleteUserPresetMutation,
  useUpdateUserPresetMutation,
} from '@/hooks/mutations';
import { useUsageStatsQuery, useUserPresetsQuery } from '@/hooks/queries';
import { useBoolean, useDragEdgeScroll } from '@/hooks/utils';
import { canAccessPreset, MODEL_PRESETS } from '@/lib/config';
import type { ModelPreset, PresetSelectionResult } from '@/lib/config/model-presets';
import { MIN_PARTICIPANTS_REQUIRED } from '@/lib/config/participant-limits';
import { useTranslations } from '@/lib/i18n';
import type { OrderedModel } from '@/lib/schemas/model-schemas';
import { toastManager } from '@/lib/toast';
import { cn } from '@/lib/ui/cn';
import { getApiErrorMessage } from '@/lib/utils';
import { modelHasTag } from '@/lib/utils/model-tags';
import type { CustomRole } from '@/services/api';

import { CustomRoleForm } from './custom-role-form';
import { ModelItem } from './model-item';
import { ModelPresetCard } from './model-preset-card';
import { PresetNameForm } from './preset-name-form';
import { RoleColorBadge } from './role-color-badge';

type IconsKey = keyof typeof Icons;

function isValidIconKey(key: string): key is IconsKey {
  return key in Icons;
}

function getRoleIcon(iconName: string): Icon {
  if (isValidIconKey(iconName)) {
    const icon = Icons[iconName];
    // Custom brand icons (reddit, twitter, instagram) won't be used as role icons
    // All role icons are standard Lucide icons which are compatible with Icon type
    return icon as Icon;
  }
  return Icons.lightbulb;
}

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
  enableDrag?: boolean;
  visionIncompatibleModelIds?: Set<string>;
  fileIncompatibleModelIds?: Set<string>;
};

export function ModelSelectionModal({
  className,
  customRoles,
  enableDrag = true,
  fileIncompatibleModelIds,
  maxModels,
  onClearRole,
  onOpenChange,
  onPresetSelect,
  onReorder,
  onRoleChange,
  onToggle,
  open,
  orderedModels,
  selectedCount,
  userTierInfo,
  visionIncompatibleModelIds,
}: ModelSelectionModalProps) {
  const t = useTranslations();
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollViewportRef = useRef<HTMLDivElement>(null);

  const [activeTab, setActiveTab] = useState(DEFAULT_MODEL_SELECTION_TAB);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const shouldApplyPresetRef = useRef(false);
  const [selectedModelForRole, setSelectedModelForRole] = useState<string | null>(null);
  const initialSortOrderRef = useRef<string[] | null>(null);
  const initialRoleSortOrderRef = useRef<{ predefined: string[]; custom: string[] } | null>(null);
  const prevSelectedModelForRoleRef = useRef<string | null>(null);

  // Refs to capture latest values for useEffect cleanup
  const orderedModelsRef = useRef(orderedModels);
  const onReorderRef = useRef(onReorder);
  orderedModelsRef.current = orderedModels;
  onReorderRef.current = onReorder;
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
      if (page?.success && page.data?.items) {
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
  const isPaidUser = usageData?.success === true && usageData.data.plan.type === PlanTypes.PAID;
  const canCreateCustomRoles = isPaidUser;

  const isSearching = searchQuery.trim().length > 0;
  const isTagFiltering = selectedTags.size > 0;
  const isFiltering = isSearching || isTagFiltering;

  const {
    onDrag: onEdgeDrag,
    onDragEnd: onEdgeDragEnd,
    onDragStart: onEdgeDragStart,
  } = useDragEdgeScroll({
    edgeThreshold: 60,
    enabled: enableDrag && !isFiltering,
    maxScrollSpeed: 3,
    scrollContainerRef: scrollViewportRef,
  });

  const filteredModels = useMemo(() => {
    let filtered = orderedModels;

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
    initialSortOrderRef.current = reorderedItems.map(om => om.model.id);
    onReorder(reorderedItems);
  }, [isFiltering, onReorder]);

  const selectedModelData = useMemo(() => {
    if (!selectedModelForRole) {
      return null;
    }
    return orderedModels.find(om => om.model.id === selectedModelForRole);
  }, [selectedModelForRole, orderedModels]);

  // Compute which roles are currently in use (for sorting)
  const rolesInUse = useMemo(() => {
    const inUse = new Set<string>();
    for (const om of orderedModels) {
      if (om.participant?.role) {
        inUse.add(om.participant.role);
      }
    }
    return inUse;
  }, [orderedModels]);

  // Capture initial role sort order when role selection opens
  // Must run during render (not in effect) so ref is available for useMemo
  if (selectedModelForRole && !prevSelectedModelForRoleRef.current) {
    const modelData = orderedModels.find(om => om.model.id === selectedModelForRole);
    const currentRole = modelData?.participant?.role;

    const sortRoles = <T extends { name: string }>(roles: readonly T[]): string[] => {
      return [...roles].sort((a, b) => {
        const aIsCurrent = currentRole === a.name;
        const bIsCurrent = currentRole === b.name;
        if (aIsCurrent && !bIsCurrent) {
          return -1;
        }
        if (!aIsCurrent && bIsCurrent) {
          return 1;
        }
        const aInUse = rolesInUse.has(a.name);
        const bInUse = rolesInUse.has(b.name);
        if (aInUse && !bInUse) {
          return -1;
        }
        if (!aInUse && bInUse) {
          return 1;
        }
        return 0;
      }).map(r => r.name);
    };

    initialRoleSortOrderRef.current = {
      custom: sortRoles(customRoles),
      predefined: sortRoles(PREDEFINED_ROLE_TEMPLATES),
    };
  }
  if (!selectedModelForRole) {
    initialRoleSortOrderRef.current = null;
  }
  prevSelectedModelForRoleRef.current = selectedModelForRole;

  // Sort predefined roles using initial order captured on open
  const sortedPredefinedRoles = useMemo(() => {
    if (!initialRoleSortOrderRef.current) {
      return PREDEFINED_ROLE_TEMPLATES;
    }

    const orderMap = new Map(initialRoleSortOrderRef.current.predefined.map((name, idx) => [name, idx]));
    return [...PREDEFINED_ROLE_TEMPLATES].sort((a, b) => {
      const aOrder = orderMap.get(a.name) ?? Number.MAX_SAFE_INTEGER;
      const bOrder = orderMap.get(b.name) ?? Number.MAX_SAFE_INTEGER;
      return aOrder - bOrder;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- triggers recompute when ref updates
  }, [selectedModelForRole]);

  // Sort custom roles using initial order captured on open
  const sortedCustomRoles = useMemo(() => {
    if (!initialRoleSortOrderRef.current) {
      return customRoles;
    }

    const orderMap = new Map(initialRoleSortOrderRef.current.custom.map((name, idx) => [name, idx]));
    return [...customRoles].sort((a, b) => {
      const aOrder = orderMap.get(a.name) ?? Number.MAX_SAFE_INTEGER;
      const bOrder = orderMap.get(b.name) ?? Number.MAX_SAFE_INTEGER;
      return aOrder - bOrder;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- triggers recompute when ref updates
  }, [customRoles, selectedModelForRole]);

  const handleOpenRoleSelection = useCallback((modelId: string) => {
    setSelectedModelForRole(modelId);
  }, []);

  const handleBackToModelList = useCallback(() => {
    setSelectedModelForRole(null);
  }, []);

  const handleRoleSelect = useCallback((roleName: string, customRoleId?: string) => {
    if (selectedModelForRole) {
      const modelData = orderedModels.find(om => om.model.id === selectedModelForRole);
      if (modelData?.participant) {
        onRoleChange(selectedModelForRole, roleName, customRoleId);
      } else {
        onToggle(selectedModelForRole);
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
    if (!trimmedRole) {
      return;
    }

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
          description: null,
          name: trimmedRole,
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
    if (!trimmedName) {
      return;
    }

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
          mode: ChatModes.ANALYZING,
          modelRoles,
          name: trimmedName,
        },
      });

      isSavingPreset.onFalse();

      if (result.success && result.data?.preset?.id) {
        setNewlyCreatedPresetId(result.data.preset.id);
        setActiveTab(ModelSelectionTabs.PRESETS);
        setTimeout(() => setNewlyCreatedPresetId(null), 2000);
      }

      toastManager.success(t('chat.models.presets.presetSaved'), t('chat.models.presets.presetSavedMessage', { name: trimmedName }));
    } catch (error) {
      const errorMessage = getApiErrorMessage(error, t('chat.models.presets.failedToSave'));
      toastManager.error(t('chat.models.presets.failedToSave'), errorMessage);
    }
  }, [orderedModels, createPresetMutation, t, isSavingPreset]);

  const handleUpdatePreset = useCallback(async () => {
    if (!editingPresetId) {
      return;
    }

    const selectedModels = orderedModels.filter(om => om.participant !== null);
    if (selectedModels.length === 0) {
      toastManager.error(t('chat.models.presets.cannotSave'), t('selectAtLeastOneModelUpdate'));
      return;
    }

    const modelRoles = selectedModels.map(om => ({
      modelId: om.model.id,
      role: om.participant?.role || null,
    }));

    const existingPreset = userPresets.find(p => p.id === editingPresetId);
    const presetName = existingPreset?.name ?? 'Preset';

    try {
      await updatePresetMutation.mutateAsync({
        json: { modelRoles },
        param: { id: editingPresetId },
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

  const userTier = (isPaidUser || userTierInfo?.current_tier === SubscriptionTiers.PRO)
    ? SubscriptionTiers.PRO
    : SubscriptionTiers.FREE;

  const hasLockedPresets = useMemo(() => {
    return MODEL_PRESETS.some(preset => !canAccessPreset(preset, userTier));
  }, [userTier]);

  const sortedPresets = useMemo(() => {
    return [...MODEL_PRESETS].sort((a, b) => {
      const aAccessible = canAccessPreset(a, userTier);
      const bAccessible = canAccessPreset(b, userTier);
      if (aAccessible && !bAccessible) {
        return -1;
      }
      if (!aAccessible && bAccessible) {
        return 1;
      }
      return a.order - b.order;
    });
  }, [userTier]);

  const selectedPreset = useMemo((): ModelPreset | null => {
    if (!selectedPresetId) {
      return null;
    }
    const systemPreset = MODEL_PRESETS.find(p => p.id === selectedPresetId);
    if (systemPreset) {
      return systemPreset;
    }
    const userPreset = userPresets.find(p => p.id === selectedPresetId);
    if (userPreset) {
      return {
        description: `${userPreset.modelRoles.length} models`,
        icon: Icons.sparkles,
        id: userPreset.id,
        mode: userPreset.mode,
        modelRoles: userPreset.modelRoles,
        name: userPreset.name,
        order: 0,
        requiredTier: SubscriptionTiers.FREE,
        searchEnabled: false,
      };
    }
    return null;
  }, [selectedPresetId, userPresets]);

  const selectedPresetModelIds = useMemo(() => {
    if (!selectedPreset) {
      return [];
    }
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
      canSave: selectedModels.length > 0,
      errorMessage: selectedModels.length === 0
        ? t('chat.models.modal.selectAtLeastOneModel')
        : null,
      hasSelectedModels: selectedModels.length > 0,
    };
  }, [orderedModels, t]);

  useEffect(() => {
    if (shouldApplyPresetRef.current && selectedPreset && onPresetSelect) {
      onPresetSelect(selectedPreset);
      shouldApplyPresetRef.current = false;
    }
  }, [selectedPreset, onPresetSelect]);

  // On modal open: capture current order (for mid-session stability)
  // On modal close: sort selected to top and persist via onReorder
  useEffect(() => {
    if (!open) {
      return;
    }

    // Capture order on open (items should already be sorted from previous close)
    initialSortOrderRef.current = orderedModelsRef.current.map(om => om.model.id);

    return () => {
      // Modal closing - sort selected to top and persist
      const models = orderedModelsRef.current;
      const reorder = onReorderRef.current;
      const sorted = [...models].sort((a, b) => {
        const aSelected = a.participant !== null;
        const bSelected = b.participant !== null;
        if (aSelected && !bSelected) {
          return -1;
        }
        if (!aSelected && bSelected) {
          return 1;
        }
        return 0;
      });
      reorder(sorted);
      initialSortOrderRef.current = null;
    };
  }, [open]);

  const handleTabChange = useCallback((tab: ModelSelectionTab) => {
    if (activeTab === ModelSelectionTabs.PRESETS && tab === ModelSelectionTabs.CUSTOM && selectedPresetId) {
      shouldApplyPresetRef.current = true;
      setSelectedPresetId(null);
    }
    setActiveTab(tab);
  }, [activeTab, selectedPresetId]);

  const sortedFilteredModels = useMemo(() => {
    if (activeTab !== ModelSelectionTabs.CUSTOM) {
      return filteredModels;
    }

    // Use initial sort order captured on modal open
    if (!initialSortOrderRef.current) {
      return filteredModels;
    }

    const orderMap = new Map(initialSortOrderRef.current.map((id, idx) => [id, idx]));
    return [...filteredModels].sort((a, b) => {
      const aOrder = orderMap.get(a.model.id) ?? Number.MAX_SAFE_INTEGER;
      const bOrder = orderMap.get(b.model.id) ?? Number.MAX_SAFE_INTEGER;
      return aOrder - bOrder;
    });
  }, [filteredModels, activeTab]);

  // Stable callback maps to prevent unnecessary re-renders of ModelItem
  const noop = useCallback(() => {}, []);

  const handleToggleMap = useMemo(() => {
    const map = new Map<string, () => void>();
    for (const om of sortedFilteredModels) {
      map.set(om.model.id, () => handleToggleWithPendingRole(om.model.id));
    }
    return map;
  }, [sortedFilteredModels, handleToggleWithPendingRole]);

  const handleClearRoleMap = useMemo(() => {
    const map = new Map<string, () => void>();
    for (const om of sortedFilteredModels) {
      map.set(om.model.id, () => handleClearRoleInternal(om.model.id));
    }
    return map;
  }, [sortedFilteredModels, handleClearRoleInternal]);

  const handleOpenRolePanelMap = useMemo(() => {
    const map = new Map<string, () => void>();
    for (const om of sortedFilteredModels) {
      map.set(om.model.id, () => handleOpenRoleSelection(om.model.id));
    }
    return map;
  }, [sortedFilteredModels, handleOpenRoleSelection]);

  const handleApplyPreset = useCallback(() => {
    if (!selectedPreset || !onPresetSelect) {
      return;
    }

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

        <DialogBody className="flex flex-col py-0">
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
                    <ScrollArea className="h-[min(420px,50vh)] -mr-4 sm:-mr-6">
                      <div className="flex flex-col pr-4 sm:pr-6">
                        {sortedPredefinedRoles.map((role: PredefinedRoleTemplate) => {
                          const Icon = getRoleIcon(role.iconName);
                          const currentRole = selectedModelData?.participant?.role
                            ?? (selectedModelForRole ? pendingRoles[selectedModelForRole]?.role : undefined);
                          const isSelected = currentRole === role.name;

                          return (
                            <button
                              type="button"
                              key={role.name}
                              onClick={() => {
                                if (isSelected && selectedModelForRole) {
                                  handleClearRoleInternal(selectedModelForRole);
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
                                      if (selectedModelForRole) {
                                        handleClearRoleInternal(selectedModelForRole);
                                        handleBackToModelList();
                                      }
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

                        {sortedCustomRoles.map((role: CustomRole) => {
                          const currentRole = selectedModelData?.participant?.role
                            ?? (selectedModelForRole ? pendingRoles[selectedModelForRole]?.role : undefined);
                          const isSelected = currentRole === role.name;

                          return (
                            <button
                              type="button"
                              key={role.id}
                              onClick={() => {
                                if (isSelected && selectedModelForRole) {
                                  handleClearRoleInternal(selectedModelForRole);
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
                                      if (selectedModelForRole) {
                                        handleClearRoleInternal(selectedModelForRole);
                                        handleBackToModelList();
                                      }
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
                        <ScrollArea className="flex-1 -mr-4 sm:-mr-6">
                          <div className="pr-4 sm:pr-6 pb-4 space-y-4">
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
                                    {userPresets.map((preset) => {
                                      const presetForCard: ModelPreset = {
                                        description: `${preset.modelRoles.length} models`,
                                        icon: Icons.sparkles,
                                        id: preset.id,
                                        mode: preset.mode,
                                        modelRoles: preset.modelRoles,
                                        name: preset.name,
                                        order: 0,
                                        requiredTier: SubscriptionTiers.FREE,
                                        searchEnabled: false,
                                      };
                                      const isNewlyCreated = newlyCreatedPresetId === preset.id;
                                      return (
                                        <motion.div
                                          key={preset.id}
                                          initial={isNewlyCreated ? { opacity: 0, scale: 0.9 } : { opacity: 1 }}
                                          animate={isNewlyCreated
                                            ? {
                                                boxShadow: ['0 0 0 0 rgba(var(--primary), 0)', '0 0 0 4px rgba(var(--primary), 0.3)', '0 0 0 0 rgba(var(--primary), 0)'],
                                                opacity: 1,
                                                scale: 1,
                                              }
                                            : { opacity: 1, scale: 1 }}
                                          exit={{
                                            opacity: 0,
                                            scale: 0.95,
                                            transition: { duration: 0.15, ease: 'easeOut' },
                                          }}
                                          transition={isNewlyCreated
                                            ? { boxShadow: { duration: 1.5, repeat: 1 }, duration: 0.5 }
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

                        <div className="flex-1 min-h-0 -mr-4 sm:-mr-6">
                          {sortedFilteredModels.length === 0
                            ? (
                                <div className="flex flex-col items-center justify-center py-12 h-full pr-4 sm:pr-6">
                                  <p className="text-sm text-muted-foreground">{t('chat.models.noModelsFound')}</p>
                                </div>
                              )
                            : enableDrag && !isFiltering
                              ? (
                                  <ScrollArea className="h-full" layoutScroll viewportRef={scrollViewportRef}>
                                    <Reorder.Group
                                      axis="y"
                                      values={sortedFilteredModels}
                                      onReorder={handleReorder}
                                      className="flex flex-col gap-2 pr-4 sm:pr-6 pb-4"
                                    >
                                      {sortedFilteredModels.map(orderedModel => (
                                        <ModelItem
                                          key={orderedModel.model.id}
                                          orderedModel={orderedModel}
                                          onToggle={handleToggleMap.get(orderedModel.model.id) ?? noop}
                                          onClearRole={handleClearRoleMap.get(orderedModel.model.id) ?? noop}
                                          selectedCount={selectedCount}
                                          maxModels={maxModels}
                                          enableDrag
                                          onOpenRolePanel={handleOpenRolePanelMap.get(orderedModel.model.id)}
                                          isVisionIncompatible={visionIncompatibleModelIds?.has(orderedModel.model.id)}
                                          isFileIncompatible={fileIncompatibleModelIds?.has(orderedModel.model.id)}
                                          pendingRole={pendingRoles[orderedModel.model.id]}
                                          onDragMove={onEdgeDrag}
                                          onDragStartCustom={onEdgeDragStart}
                                          onDragEndCustom={onEdgeDragEnd}
                                        />
                                      ))}
                                    </Reorder.Group>
                                  </ScrollArea>
                                )
                              : (
                                  <ScrollArea className="h-full">
                                    <div className="flex flex-col gap-2 pr-4 sm:pr-6 pb-4">
                                      {sortedFilteredModels.map(orderedModel => (
                                        <ModelItem
                                          key={orderedModel.model.id}
                                          orderedModel={orderedModel}
                                          onToggle={handleToggleMap.get(orderedModel.model.id) ?? noop}
                                          onClearRole={handleClearRoleMap.get(orderedModel.model.id) ?? noop}
                                          selectedCount={selectedCount}
                                          maxModels={maxModels}
                                          enableDrag={false}
                                          onOpenRolePanel={handleOpenRolePanelMap.get(orderedModel.model.id)}
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

        {selectedModelForRole && (
          <DialogFooter bordered bleed>
            {!canCreateCustomRoles
              ? (
                  <div
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-xl w-full',
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
                      <Link to="/chat/pricing">
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
          </DialogFooter>
        )}

        {!selectedModelForRole && (
          <DialogFooter bordered bleed justify="between">
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
                  <Link to="/chat/pricing" className="flex items-center gap-1.5">
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
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
