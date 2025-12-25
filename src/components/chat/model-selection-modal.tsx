'use client';

import { AlertCircle, ArrowLeft, Briefcase, GraduationCap, Hammer, Lightbulb, MessageSquare, Search, Sparkles, Target, TrendingUp, Users, X } from 'lucide-react';
import { AnimatePresence, motion, Reorder } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { SubscriptionTier } from '@/api/core/enums';
import { DEFAULT_MODEL_SELECTION_TAB, ModelSelectionTabs } from '@/api/core/enums/ui';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCreateCustomRoleMutation } from '@/hooks/mutations';
import { useUsageStatsQuery } from '@/hooks/queries';
import type { ModelPreset, PresetSelectionResult } from '@/lib/config/model-presets';
import { MODEL_PRESETS } from '@/lib/config/model-presets';
import type { OrderedModel } from '@/lib/schemas/model-schemas';
import { toastManager } from '@/lib/toast';
import { cn } from '@/lib/ui/cn';
import { getApiErrorMessage, getRoleColors } from '@/lib/utils';
import type { ListCustomRolesResponse } from '@/services/api/chat-roles';

import { ModelItem } from './model-item';
import { ModelPresetCard } from './model-preset-card';

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

// Predefined roles with icons - colors assigned dynamically via getRoleColors()
// NOTE: These are not enum constants - they're default role templates that users can customize
const PREDEFINED_ROLES = [
  {
    name: 'The Ideator',
    icon: Lightbulb,
    description: 'Generate creative ideas and innovative solutions',
  },
  {
    name: 'Devil\'s Advocate',
    icon: MessageSquare,
    description: 'Challenge assumptions and identify potential issues',
  },
  {
    name: 'Builder',
    icon: Hammer,
    description: 'Focus on practical implementation and execution',
  },
  {
    name: 'Practical Evaluator',
    icon: Target,
    description: 'Assess feasibility and real-world applicability',
  },
  {
    name: 'Visionary Thinker',
    icon: Sparkles,
    description: 'Think big picture and long-term strategy',
  },
  {
    name: 'Domain Expert',
    icon: GraduationCap,
    description: 'Provide deep domain-specific knowledge',
  },
  {
    name: 'User Advocate',
    icon: Users,
    description: 'Champion user needs and experience',
  },
  {
    name: 'Implementation Strategist',
    icon: Briefcase,
    description: 'Plan execution strategy and implementation',
  },
  {
    name: 'The Data Analyst',
    icon: TrendingUp,
    description: 'Analyze data and provide insights',
  },
] as const;

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

  // Tab state - default to presets to encourage usage
  const [activeTab, setActiveTab] = useState(DEFAULT_MODEL_SELECTION_TAB);

  // Selected preset state for presets tab
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);

  // Track if preset should be applied on next render
  const shouldApplyPresetRef = useRef(false);

  // Role selection state
  const [selectedModelForRole, setSelectedModelForRole] = useState<string | null>(null);
  const [customRoleInput, setCustomRoleInput] = useState('');

  // Pending roles for models that aren't toggled on yet
  // Allows assigning roles independently of selection state
  const [pendingRoles, setPendingRoles] = useState<Record<string, { role: string; customRoleId?: string }>>({});

  // Custom role creation mutation
  const createRoleMutation = useCreateCustomRoleMutation();

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
    setCustomRoleInput('');
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

  const handleCustomRoleCreate = useCallback(async () => {
    const trimmedRole = customRoleInput.trim();
    if (!trimmedRole)
      return;

    // Check if user can create custom roles (paid users only)
    if (!canCreateCustomRoles) {
      toastManager.error(
        'Upgrade Required',
        'Custom roles are available for paid users only. Upgrade to create custom roles.',
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
      const errorMessage = getApiErrorMessage(error, 'Failed to create custom role');
      toastManager.error('Failed to create role', errorMessage);
    }
  }, [customRoleInput, createRoleMutation, handleRoleSelect, canCreateCustomRoles]);

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

  // Get all models for preset cards
  const allModels = useMemo(() => {
    return orderedModels.map(om => om.model);
  }, [orderedModels]);

  // Get user tier for preset access checks
  const userTier = userTierInfo?.current_tier ?? 'free';

  // Get selected preset for footer display
  const selectedPreset = useMemo(() => {
    if (!selectedPresetId)
      return null;
    return MODEL_PRESETS.find(p => p.id === selectedPresetId) ?? null;
  }, [selectedPresetId]);

  // Get model IDs from selected preset
  const selectedPresetModelIds = useMemo(() => {
    if (!selectedPreset)
      return [];
    return selectedPreset.modelRoles.map(mr => mr.modelId);
  }, [selectedPreset]);

  // Apply preset when flag is set (triggered by tab change handler)
  useEffect(() => {
    if (shouldApplyPresetRef.current && selectedPreset && onPresetSelect) {
      // Apply the preset to populate Build Custom tab
      onPresetSelect(selectedPreset);
      shouldApplyPresetRef.current = false;
    }
  }, [selectedPreset, onPresetSelect]);

  // Handle tab changes - apply preset when switching to custom tab
  const handleTabChange = useCallback((tab: typeof DEFAULT_MODEL_SELECTION_TAB) => {
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
        className={cn('!max-w-3xl !w-[calc(100vw-2.5rem)] gap-0', className)}
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

        <DialogBody className="flex flex-col py-0 max-h-[600px] overflow-hidden">
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
                    <ScrollArea className="h-[420px]">
                      <div className="flex flex-col">
                        {/* Predefined roles */}
                        {PREDEFINED_ROLES.map((role) => {
                          const Icon = role.icon;
                          // Check both participant role and pending role
                          const currentRole = selectedModelData?.participant?.role
                            ?? (selectedModelForRole ? pendingRoles[selectedModelForRole]?.role : undefined);
                          const isSelected = currentRole === role.name;
                          const colors = getRoleColors(role.name);

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
                                <div
                                  className="flex size-8 shrink-0 items-center justify-center rounded-full"
                                  style={{ backgroundColor: colors.bgColor }}
                                >
                                  <Icon className="size-4" style={{ color: colors.iconColor }} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h4 className="text-base font-normal">{role.name}</h4>
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
                                'w-full p-3 transition-all text-left rounded-lg',
                                'hover:bg-white/5 hover:backdrop-blur-sm',
                                isSelected && 'bg-white/10',
                              )}
                            >
                              <div className="flex items-center gap-3">
                                {(() => {
                                  const colors = getRoleColors(role.name);
                                  return (
                                    <div
                                      className="flex size-8 shrink-0 items-center justify-center rounded-full"
                                      style={{ backgroundColor: colors.bgColor }}
                                    >
                                      <span className="font-semibold text-[11px]" style={{ color: colors.iconColor }}>
                                        {role.name.charAt(0).toUpperCase()}
                                      </span>
                                    </div>
                                  );
                                })()}
                                <div className="flex-1 min-w-0">
                                  <h4 className="text-base font-normal">{role.name}</h4>
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
                              <span className="flex-1">Custom roles are available for paid users</span>
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
                            <div className="flex gap-2 w-full">
                              <Input
                                placeholder={t('customRolePlaceholder')}
                                value={customRoleInput}
                                onChange={e => setCustomRoleInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && customRoleInput.trim()) {
                                    handleCustomRoleCreate();
                                  }
                                }}
                                className="flex-1 min-w-0 h-8 text-sm"
                              />
                              <Button
                                onClick={handleCustomRoleCreate}
                                disabled={!customRoleInput.trim() || !canCreateCustomRoles}
                                size="sm"
                                className="h-8 shrink-0"
                              >
                                Save
                              </Button>
                            </div>
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
                      onValueChange={v => handleTabChange(v as typeof DEFAULT_MODEL_SELECTION_TAB)}
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
                      <TabsContent value={ModelSelectionTabs.PRESETS} className="mt-0 h-[480px] flex flex-col">
                        <ScrollArea className="flex-1 -mr-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 auto-rows-fr pr-3 pb-4">
                            {MODEL_PRESETS.map(preset => (
                              <ModelPresetCard
                                key={preset.id}
                                preset={preset}
                                allModels={allModels}
                                userTier={userTier}
                                onSelect={handlePresetCardClick}
                                isSelected={selectedPresetId === preset.id}
                                incompatibleModelIds={incompatibleModelIds}
                              />
                            ))}
                          </div>
                        </ScrollArea>

                      </TabsContent>

                      {/* Build Custom Tab Content */}
                      <TabsContent value={ModelSelectionTabs.CUSTOM} className="mt-0 h-[480px] flex flex-col">
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
            <div className="flex items-center justify-end px-6 py-4">
              <Button
                onClick={activeTab === ModelSelectionTabs.PRESETS ? handleApplyPreset : () => onOpenChange(false)}
                disabled={activeTab === ModelSelectionTabs.PRESETS && !selectedPreset}
                variant="white"
                size="sm"
              >
                Save
              </Button>
            </div>
          </div>
        )}

        {children}
      </DialogContent>
    </Dialog>
  );
}
