'use client';

import { AlertCircle, ArrowLeft, Briefcase, GraduationCap, Hammer, Lightbulb, MessageSquare, Search, Sparkles, Target, TrendingUp, Users, X } from 'lucide-react';
import { AnimatePresence, motion, Reorder } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';

import type { SubscriptionTier } from '@/api/services/product-logic.service';
import { createRoleSystemPrompt } from '@/api/services/prompts.service';
import type { ParticipantConfig } from '@/components/chat/chat-form-schemas';
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
import { useCreateCustomRoleMutation } from '@/hooks/mutations/chat-mutations';
import { useUsageStatsQuery } from '@/hooks/queries/usage';
import { toastManager } from '@/lib/toast/toast-manager';
import { cn } from '@/lib/ui/cn';
import { getApiErrorMessage } from '@/lib/utils/error-handling';
import { getRoleColors } from '@/lib/utils/role-colors';
import type { ListCustomRolesResponse } from '@/services/api/chat-roles';

import type { OrderedModel } from './model-item';
import { ModelItem } from './model-item';

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

type CustomRole = NonNullable<
  Extract<ListCustomRolesResponse, { success: true }>['data']
>['items'][number];

// Predefined roles with icons - colors assigned dynamically via getRoleColors()
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
  /** All participant configurations */
  allParticipants: ParticipantConfig[];
  /** Available custom roles */
  customRoles: CustomRole[];
  /** Callback when model is toggled */
  onToggle: (modelId: string) => void;
  /** Callback when role is changed for a model */
  onRoleChange: (modelId: string, role: string, customRoleId?: string) => void;
  /** Callback when role is cleared for a model */
  onClearRole: (modelId: string) => void;
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
};

export function ModelSelectionModal({
  open,
  onOpenChange,
  orderedModels,
  onReorder,
  allParticipants,
  customRoles,
  onToggle,
  onRoleChange,
  onClearRole,
  selectedCount,
  maxModels,
  userTierInfo,
  className,
  children,
  enableDrag = true,
}: ModelSelectionModalProps) {
  const t = useTranslations('chat.models.modal');
  const tModels = useTranslations('chat.models');
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Role selection state
  const [selectedModelForRole, setSelectedModelForRole] = useState<string | null>(null);
  const [customRoleInput, setCustomRoleInput] = useState('');

  // Custom role creation mutation
  const createRoleMutation = useCreateCustomRoleMutation();

  // Usage stats for custom role limits
  const { data: usageData } = useUsageStatsQuery();
  const customRoleLimit = usageData?.data?.customRoles?.limit ?? 0;
  const customRoleRemaining = usageData?.data?.customRoles?.remaining ?? 0;
  const canCreateCustomRoles = customRoleLimit > 0 && customRoleRemaining > 0;

  // Filter models based on search query
  const filteredModels = useMemo(() => {
    if (!searchQuery.trim()) {
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
  }, [orderedModels, searchQuery]);

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
      onRoleChange(selectedModelForRole, roleName, customRoleId);
      handleBackToModelList();
    }
  }, [selectedModelForRole, onRoleChange, handleBackToModelList]);

  const handleCustomRoleCreate = useCallback(async () => {
    const trimmedRole = customRoleInput.trim();
    if (!trimmedRole)
      return;

    // Check if user can create custom roles
    if (!canCreateCustomRoles) {
      if (customRoleLimit === 0) {
        toastManager.error(
          'Upgrade Required',
          'Custom roles are not available on your current plan. Upgrade to create custom roles.',
        );
      } else {
        toastManager.error(
          'Limit Reached',
          `You've reached your custom role limit (${customRoleLimit} per month). Upgrade your plan for more custom roles.`,
        );
      }
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
  }, [customRoleInput, createRoleMutation, handleRoleSelect, canCreateCustomRoles, customRoleLimit]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn('!max-w-2xl !w-[calc(100vw-2.5rem)]', className)}
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
                    <span className="text-sm font-medium">Back</span>
                  </button>
                  <DialogTitle className="text-xl">
                    Set Role for
                    {' '}
                    {selectedModelData?.model.name}
                  </DialogTitle>
                  <DialogDescription>Select a role or enter a custom one</DialogDescription>
                </>
              )
            : (
                <>
                  <DialogTitle className="text-xl">{t('title')}</DialogTitle>
                  <DialogDescription>{t('subtitle')}</DialogDescription>
                </>
              )}
        </DialogHeader>

        <DialogBody className="flex flex-col py-0 max-h-[500px] overflow-hidden">
          <AnimatePresence mode="wait">
            {/* Role Selection View */}
            {selectedModelForRole
              ? (
                  <motion.div
                    key="role-selection"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-col flex-1 min-h-0"
                  >
                    {/* Scrollable role list - NO padding */}
                    <ScrollArea className="h-[400px]">
                      <div className="flex flex-col">
                        {/* Predefined roles */}
                        {PREDEFINED_ROLES.map((role) => {
                          const Icon = role.icon;
                          const isSelected = selectedModelData?.participant?.role === role.name;
                          const colors = getRoleColors(role.name);

                          return (
                            <button
                              type="button"
                              key={role.name}
                              onClick={() => {
                                // Toggle: if already selected, clear it
                                if (isSelected) {
                                  onClearRole(selectedModelForRole!);
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
                                      onClearRole(selectedModelForRole!);
                                      handleBackToModelList();
                                    }}
                                    className="shrink-0 p-1 rounded-md hover:bg-white/10 transition-colors"
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
                          const isSelected = selectedModelData?.participant?.role === role.name;

                          return (
                            <button
                              type="button"
                              key={role.id}
                              onClick={() => {
                                // Toggle: if already selected, clear it
                                if (isSelected) {
                                  onClearRole(selectedModelForRole!);
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
                                      onClearRole(selectedModelForRole!);
                                      handleBackToModelList();
                                    }}
                                    className="shrink-0 p-1 rounded-md hover:bg-white/10 transition-colors"
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
                      {!canCreateCustomRoles && customRoleLimit === 0
                        ? (
                            <div
                              className={cn(
                                'flex items-center gap-2 px-3 py-2 rounded-xl',
                                'bg-destructive/10 border border-destructive/20',
                                'text-xs text-destructive',
                              )}
                            >
                              <AlertCircle className="size-3 shrink-0" />
                              <span className="flex-1">Custom roles not available on your plan</span>
                              <Button
                                variant="default"
                                size="sm"
                                className="h-6 rounded-full text-[10px] font-medium shrink-0"
                                onClick={() => router.push('/chat/pricing')}
                              >
                                Upgrade
                              </Button>
                            </div>
                          )
                        : (
                            <div className="flex gap-2">
                              <Input
                                placeholder={canCreateCustomRoles ? 'Enter custom role name...' : 'Limit reached'}
                                value={customRoleInput}
                                onChange={e => setCustomRoleInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && customRoleInput.trim() && canCreateCustomRoles) {
                                    handleCustomRoleCreate();
                                  }
                                }}
                                disabled={!canCreateCustomRoles}
                                className="flex-1 h-8 text-sm"
                              />
                              <Button
                                onClick={handleCustomRoleCreate}
                                disabled={!customRoleInput.trim() || !canCreateCustomRoles}
                                size="sm"
                                className="h-8"
                              >
                                Save
                              </Button>
                            </div>
                          )}
                    </div>
                  </motion.div>
                )
              : (
                  <>
                    {/* Model List View */}
                    <motion.div
                      key="model-list"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ duration: 0.2 }}
                      className="flex flex-col gap-4 pt-4 pb-0"
                    >
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
                                    searchInputRef.current?.focus();
                                  }}
                                />
                              )
                            : undefined}
                          endIconClickable={!!searchQuery}
                        />
                      </div>

                      {/* Model List - ScrollArea with fixed height */}
                      <ScrollArea className="h-[400px] max-h-[400px]">
                        {filteredModels.length === 0
                          ? (
                              <div className="flex flex-col items-center justify-center py-12">
                                <p className="text-sm text-muted-foreground">{tModels('noModelsFound')}</p>
                              </div>
                            )
                          : enableDrag
                            ? (
                                <Reorder.Group
                                  axis="y"
                                  values={filteredModels}
                                  onReorder={onReorder}
                                  layoutScroll
                                  style={{ overflowY: 'visible' }}
                                  className="flex flex-col gap-2"
                                >
                                  {filteredModels.map(orderedModel => (
                                    <ModelItem
                                      key={orderedModel.model.id}
                                      orderedModel={orderedModel}
                                      allParticipants={allParticipants}
                                      customRoles={customRoles}
                                      onToggle={() => onToggle(orderedModel.model.id)}
                                      onRoleChange={(role, customRoleId) =>
                                        onRoleChange(orderedModel.model.id, role, customRoleId)}
                                      onClearRole={() => onClearRole(orderedModel.model.id)}
                                      selectedCount={selectedCount}
                                      maxModels={maxModels}
                                      enableDrag={enableDrag}
                                      userTierInfo={userTierInfo}
                                      onOpenRolePanel={() => handleOpenRoleSelection(orderedModel.model.id)}
                                    />
                                  ))}
                                </Reorder.Group>
                              )
                            : (
                                <div className="flex flex-col gap-2">
                                  {filteredModels.map(orderedModel => (
                                    <ModelItem
                                      key={orderedModel.model.id}
                                      orderedModel={orderedModel}
                                      allParticipants={allParticipants}
                                      customRoles={customRoles}
                                      onToggle={() => onToggle(orderedModel.model.id)}
                                      onRoleChange={(role, customRoleId) =>
                                        onRoleChange(orderedModel.model.id, role, customRoleId)}
                                      onClearRole={() => onClearRole(orderedModel.model.id)}
                                      selectedCount={selectedCount}
                                      maxModels={maxModels}
                                      enableDrag={false}
                                      userTierInfo={userTierInfo}
                                      onOpenRolePanel={() => handleOpenRoleSelection(orderedModel.model.id)}
                                    />
                                  ))}
                                </div>
                              )}
                      </ScrollArea>
                    </motion.div>
                  </>
                )}
          </AnimatePresence>
        </DialogBody>

        {children}
      </DialogContent>
    </Dialog>
  );
}
