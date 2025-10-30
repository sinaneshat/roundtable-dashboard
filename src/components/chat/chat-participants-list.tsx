'use client';
import type { UIMessage } from 'ai';
import { Bot, Lock } from 'lucide-react';
import { motion, Reorder } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { EnhancedModelResponse } from '@/api/routes/models/schema';
import type { SubscriptionTier } from '@/api/services/product-logic.service';
import type { ParticipantConfig } from '@/components/chat/chat-form-schemas';
import { ModelItem } from '@/components/chat/model-item';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandList,
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
import { useCustomRolesQuery } from '@/hooks/queries/chat';
import { useModelsQuery } from '@/hooks/queries/models';
import { useFuzzySearch } from '@/hooks/utils/use-fuzzy-search';
import { toastManager } from '@/lib/toast/toast-manager';
import { cn } from '@/lib/ui/cn';
import { getProviderIcon } from '@/lib/utils/ai-display';

type ChatParticipantsListProps = {
  participants: ParticipantConfig[];
  onParticipantsChange?: (participants: ParticipantConfig[]) => void;
  className?: string;
  isStreaming?: boolean;
  disabled?: boolean;
};
type OrderedModel = {
  model: EnhancedModelResponse;
  participant: ParticipantConfig | null;
  order: number;
};
export function ChatParticipantsList({
  participants,
  onParticipantsChange,
  className,
  isStreaming = false,
  disabled = false,
}: ChatParticipantsListProps) {
  const tModels = useTranslations('chat.models');
  const [open, setOpen] = useState(false);
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const participantIdCounterRef = useRef(0);
  const { data: customRolesData } = useCustomRolesQuery(open && !isStreaming);
  const { data: modelsData } = useModelsQuery();

  // Close popover when disabled using ref pattern to avoid cascading renders
  const wasDisabledRef = useRef(disabled);
  useEffect(() => {
    if (!wasDisabledRef.current && disabled && open) {
      queueMicrotask(() => setOpen(false));
    }
    wasDisabledRef.current = disabled;
  }, [disabled, open]);
  const customRoles = customRolesData?.pages.flatMap(page =>
    (page?.success && page.data?.items) ? page.data.items : [],
  ) || [];
  const userTierConfig = modelsData?.data?.user_tier_config || {
    tier: 'free' as SubscriptionTier,
    tier_name: 'Free',
    max_models: 2,
    can_upgrade: true,
  };
  const maxModels = userTierConfig.max_models;
  const tierName = userTierConfig.tier_name;
  const userTier = userTierConfig.tier;
  const allEnabledModels: EnhancedModelResponse[] = useMemo(
    () => modelsData?.data?.items || [],
    [modelsData?.data?.items],
  );
  const orderedModels = useMemo<OrderedModel[]>(() => {
    if (allEnabledModels.length === 0)
      return [];
    const selectedModels: OrderedModel[] = participants
      .sort((a, b) => a.priority - b.priority)
      .flatMap((p, index) => {
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
  }, [participants, allEnabledModels]);
  const userTierInfo = {
    tier_name: tierName,
    max_models: maxModels,
    current_tier: userTier,
    can_upgrade: userTier !== 'power',
  };
  const handleToggleModel = (modelId: string) => {
    const orderedModel = orderedModels.find(om => om.model.id === modelId);
    if (!orderedModel)
      return;
    if (!orderedModel.participant) {
      const openRouterModel = modelsData?.data?.items.find(m => m.id === modelId);
      if (openRouterModel && !openRouterModel.is_accessible_to_user) {
        toastManager.error(
          'Model not accessible',
          `Your ${userTierInfo?.tier_name || 'current'} plan does not include access to this model.`,
        );
        return;
      }
    }
    if (orderedModel.participant) {
      const filtered = participants.filter(p => p.id !== orderedModel.participant!.id);
      const reindexed = filtered.map((p, index) => ({ ...p, priority: index }));
      onParticipantsChange?.(reindexed);
    } else {
      const existingParticipant = participants.find(p => p.modelId === modelId);
      if (existingParticipant) {
        return;
      }
      participantIdCounterRef.current += 1;
      const newParticipant: ParticipantConfig = {
        id: `participant-${participantIdCounterRef.current}`,
        modelId,
        role: '',
        priority: participants.length,
      };
      onParticipantsChange?.([...participants, newParticipant]);
    }
  };
  const handleRoleChange = (modelId: string, role: string, customRoleId?: string) => {
    onParticipantsChange?.(
      participants.map(p =>
        p.modelId === modelId ? { ...p, role, customRoleId } : p,
      ),
    );
  };
  const handleClearRole = (modelId: string) => {
    onParticipantsChange?.(
      participants.map(p =>
        p.modelId === modelId ? { ...p, role: '', customRoleId: undefined } : p,
      ),
    );
  };
  const handleReorderSelected = (newOrder: OrderedModel[]) => {
    const reorderedParticipants = newOrder.map((om, index) => ({
      ...om.participant!,
      priority: index,
    }));
    onParticipantsChange?.(reorderedParticipants);
  };
  const tierGroups = useMemo(() => modelsData?.data?.tier_groups || [], [modelsData?.data?.tier_groups]);
  const flagshipModels = useMemo(() => modelsData?.data?.flagship_models || [], [modelsData?.data?.flagship_models]);
  const selectedModelIds = useMemo(
    () => new Set(participants.map(p => p.modelId)),
    [participants],
  );
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
  const searchFilteredIds = useMemo(() => {
    if (!modelSearchQuery)
      return null;
    return new Set(searchFilteredModels.map(m => m.id));
  }, [searchFilteredModels, modelSearchQuery]);
  const selectedModels = useMemo(() => {
    return orderedModels
      .filter(om =>
        om.participant !== null
        && (!searchFilteredIds || searchFilteredIds.has(om.model.id)),
      )
      .sort((a, b) => a.participant!.priority - b.participant!.priority);
  }, [orderedModels, searchFilteredIds]);
  const flatUnselectedModels = useMemo(() => {
    if (!modelSearchQuery || !searchFilteredIds)
      return [];
    const allUnselected: EnhancedModelResponse[] = [];
    flagshipModels.forEach((model) => {
      if (!selectedModelIds.has(model.id) && searchFilteredIds.has(model.id)) {
        allUnselected.push(model);
      }
    });
    const flagshipIds = new Set(flagshipModels.map(m => m.id));
    tierGroups.forEach((tierGroup) => {
      tierGroup.models.forEach((model) => {
        if (
          !selectedModelIds.has(model.id)
          && searchFilteredIds.has(model.id)
          && !flagshipIds.has(model.id)
        ) {
          allUnselected.push(model);
        }
      });
    });
    return allUnselected;
  }, [modelSearchQuery, searchFilteredIds, flagshipModels, tierGroups, selectedModelIds]);
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <TooltipProvider>
        <Popover open={open} onOpenChange={setOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled}
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
            {participants.length > 0 && (
              <TooltipContent side="top" className="max-w-xs">
                <div className="space-y-1">
                  <div className="font-semibold text-xs">{tModels('selectedModelsLabel')}</div>
                  {participants
                    .sort((a, b) => a.priority - b.priority)
                    .map((participant) => {
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
                  const hasResults = searchFilteredIds
                    ? searchFilteredIds.size > 0
                    : allEnabledModels.length > 0;
                  return !hasResults && (
                    <CommandEmpty>{tModels('noModelsFound')}</CommandEmpty>
                  );
                })()}
                {modelSearchQuery
                  ? (
                      <>
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
                                  allParticipants={participants}
                                  customRoles={customRoles}
                                  onToggle={() => handleToggleModel(orderedModel.model.id)}
                                  onRoleChange={(role, customRoleId) => handleRoleChange(orderedModel.model.id, role, customRoleId)}
                                  onClearRole={() => handleClearRole(orderedModel.model.id)}
                                  selectedCount={participants.length}
                                  maxModels={maxModels}
                                  userTierInfo={userTierInfo}
                                />
                              ))}
                            </Reorder.Group>
                          </div>
                        )}
                        {flatUnselectedModels.length > 0 && (
                          <div className="space-y-0">
                            {flatUnselectedModels.map((model, index) => (
                              <ModelItem
                                key={`search-${model.id}`}
                                orderedModel={{ model, participant: null, order: index }}
                                allParticipants={participants}
                                customRoles={customRoles}
                                onToggle={() => handleToggleModel(model.id)}
                                onRoleChange={(role, customRoleId) => handleRoleChange(model.id, role, customRoleId)}
                                onClearRole={() => handleClearRole(model.id)}
                                selectedCount={participants.length}
                                maxModels={maxModels}
                                enableDrag={false}
                                userTierInfo={userTierInfo}
                              />
                            ))}
                          </div>
                        )}
                      </>
                    )
                  : (
                      <>
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
                                  allParticipants={participants}
                                  customRoles={customRoles}
                                  onToggle={() => handleToggleModel(orderedModel.model.id)}
                                  onRoleChange={(role, customRoleId) => handleRoleChange(orderedModel.model.id, role, customRoleId)}
                                  onClearRole={() => handleClearRole(orderedModel.model.id)}
                                  selectedCount={participants.length}
                                  maxModels={maxModels}
                                  userTierInfo={userTierInfo}
                                />
                              ))}
                            </Reorder.Group>
                          </div>
                        )}
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
                                    allParticipants={participants}
                                    customRoles={customRoles}
                                    onToggle={() => handleToggleModel(model.id)}
                                    onRoleChange={(role, customRoleId) => handleRoleChange(model.id, role, customRoleId)}
                                    onClearRole={() => handleClearRole(model.id)}
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
                        {tierGroups.length > 0 && (
                          <div className="space-y-0">
                            {tierGroups.map((tierGroup, tierIndex) => {
                              const unselectedTierModels = tierGroup.models.filter(m =>
                                !selectedModelIds.has(m.id)
                                && (!searchFilteredIds || searchFilteredIds.has(m.id)),
                              );
                              if (unselectedTierModels.length === 0)
                                return null;
                              const isUserTier = tierGroup.is_user_tier;
                              const userTierIndex = tierGroups.findIndex(g => g.is_user_tier);
                              const isLowerTier = tierIndex < userTierIndex;
                              const isHigherTier = tierIndex > userTierIndex;
                              return (
                                <div key={tierGroup.tier}>
                                  <div
                                    className={cn(
                                      'px-3 py-2.5 text-xs font-medium border-b',
                                      'sticky top-0 z-20',
                                      'backdrop-blur-sm',
                                      isUserTier && 'bg-primary/15 text-primary border-primary/20',
                                      isLowerTier && 'bg-muted/50 text-muted-foreground',
                                      isHigherTier && 'bg-muted/60 text-muted-foreground border-muted',
                                    )}
                                    style={{
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
                                  <div className="space-y-0">
                                    {unselectedTierModels.map((model, index) => (
                                      <ModelItem
                                        key={`tier-${tierGroup.tier}-${model.id}`}
                                        orderedModel={{ model, participant: null, order: index }}
                                        allParticipants={participants}
                                        customRoles={customRoles}
                                        onToggle={() => handleToggleModel(model.id)}
                                        onRoleChange={(role, customRoleId) => handleRoleChange(model.id, role, customRoleId)}
                                        onClearRole={() => handleClearRole(model.id)}
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
export function ParticipantsPreview({
  participants,
  isStreaming,
  currentParticipantIndex,
  className,
  chatMessages: _chatMessages,
}: {
  participants: ParticipantConfig[];
  isStreaming?: boolean;
  currentParticipantIndex?: number;
  className?: string;
  chatMessages?: UIMessage[];
}) {
  const { data: modelsData } = useModelsQuery();
  const allModels: EnhancedModelResponse[] = modelsData?.data?.items || [];
  if (participants.length === 0) {
    return null;
  }
  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <div className="flex items-center gap-2 pb-2">
        {participants
          .sort((a, b) => a.priority - b.priority)
          .map((participant, index) => {
            const model = allModels.find(m => m.id === participant.modelId);
            if (!model)
              return null;
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
                  isWaitingInQueue && 'opacity-60',
                )}
              >
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
