'use client';

import { X } from 'lucide-react';
import { Reorder } from 'motion/react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useMemo, useRef, useState } from 'react';

import type { SubscriptionTier } from '@/api/services/product-logic.service';
import type { ParticipantConfig } from '@/components/chat/chat-form-schemas';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/ui/cn';
import type { ListCustomRolesResponse } from '@/services/api/chat-roles';

import type { OrderedModel } from './model-item';
import { ModelItem } from './model-item';

/**
 * ModelSelectionModal Component
 *
 * Tier-grouped AI model selection modal with search and drag-reordering.
 * Matches original implementation from chat-participants-list.tsx
 *
 * Group Order: Selected Models → Most Popular → Free → Starter → Pro → Power
 */

type CustomRole = NonNullable<
  Extract<ListCustomRolesResponse, { success: true }>['data']
>['items'][number];

type ModelGroup = {
  title: string;
  models: OrderedModel[];
};

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
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  // Group models: Selected → Flagship → Free → Starter → Pro → Power
  const groupedModels = useMemo<ModelGroup[]>(() => {
    const groups: ModelGroup[] = [];
    const selectedModelIds = new Set(
      filteredModels.filter(om => om.participant !== null).map(om => om.model.id),
    );

    // 1. Selected models - always first
    const selectedModels = filteredModels.filter(om => om.participant !== null);
    if (selectedModels.length > 0) {
      groups.push({ title: tModels('selectedModels') || 'Selected Models', models: selectedModels });
    }

    // 2. Flagship/Most Popular models (excluding selected)
    const flagshipModelIds = new Set([
      'anthropic/claude-sonnet-4',
      'anthropic/claude-4-sonnet',
      'anthropic/claude-sonnet-4.5',
      'openai/gpt-4o',
      'openai/chatgpt-4o-latest',
      'google/gemini-pro-1.5',
      'google/gemini-2.0-flash-thinking-exp:free',
      'deepseek/deepseek-chat',
    ]);

    const flagshipModels = filteredModels.filter(om =>
      flagshipModelIds.has(om.model.id) && !selectedModelIds.has(om.model.id),
    );

    if (flagshipModels.length > 0) {
      groups.push({ title: tModels('mostPopular') || 'Most Popular', models: flagshipModels });
    }

    // 3. Tier groups (excluding selected and flagship)
    const tierModels = filteredModels.filter(om =>
      !selectedModelIds.has(om.model.id) && !flagshipModelIds.has(om.model.id),
    );

    const tierMap = new Map<string, OrderedModel[]>();

    tierModels.forEach((om) => {
      const tierName = om.model.required_tier_name || om.model.required_tier || 'free';
      const normalizedTier = tierName.toLowerCase();
      if (!tierMap.has(normalizedTier)) {
        tierMap.set(normalizedTier, []);
      }
      tierMap.get(normalizedTier)!.push(om);
    });

    // Define tier order matching backend
    const tierOrder = [
      { key: 'free', label: 'Free' },
      { key: 'starter', label: 'Starter' },
      { key: 'pro', label: 'Pro' },
      { key: 'power', label: 'Power' },
      { key: 'premium', label: 'Premium' },
      { key: 'enterprise', label: 'Enterprise' },
    ];

    // Add tier groups in order
    tierOrder.forEach(({ key, label }) => {
      const models = tierMap.get(key);
      if (models && models.length > 0) {
        groups.push({ title: label, models });
      }
    });

    // Add any remaining tiers not in predefined order
    Array.from(tierMap.keys()).forEach((tierKey) => {
      if (!tierOrder.some(t => t.key === tierKey)) {
        const models = tierMap.get(tierKey)!;
        const label = tierKey.charAt(0).toUpperCase() + tierKey.slice(1);
        groups.push({ title: label, models });
      }
    });

    return groups;
  }, [filteredModels, tModels]);

  // Handle toggle with prevention for last selected model
  const handleToggle = (modelId: string) => {
    const model = orderedModels.find(om => om.model.id === modelId);
    if (!model)
      return;

    // Prevent deselecting the last selected model
    if (model.participant !== null && selectedCount <= 1) {
      return;
    }

    onToggle(modelId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        glass={true}
        className={cn(
          'overflow-hidden gap-0 p-0 max-h-[85vh] max-w-[768px] w-[calc(100vw-2.5rem)]',
          className,
        )}
      >
        {/* Fixed Header Section */}
        <div className="shrink-0">
          <DialogHeader glass>
            <DialogTitle className="text-xl">{t('title')}</DialogTitle>
            <DialogDescription>{t('subtitle')}</DialogDescription>
          </DialogHeader>

          {/* Search Input */}
          <DialogBody glass className="py-4">
            <div className="relative w-full">
              <input
                ref={searchInputRef}
                type="text"
                placeholder={t('searchPlaceholder')}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className={cn(
                  'flex h-9 w-full rounded-md border border-input bg-transparent py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none',
                  'placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30',
                  'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
                  'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
                  searchQuery ? 'pl-3 pr-9' : 'px-3',
                )}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    searchInputRef.current?.focus();
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
                  tabIndex={-1}
                  aria-label="Clear search"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
          </DialogBody>
        </div>

        {/* Scrollable Model List */}
        <div className="border-t border-white/5 bg-black/30 h-[500px] max-h-[500px] min-h-[300px]">
          <ScrollArea className="h-full w-full [&_[data-slot=scroll-area-viewport]>div]:block!">
            <div className="w-full">
              {groupedModels.length === 0
                ? (
                    <div className="flex flex-col items-start justify-center py-12 px-4 sm:px-5 md:px-6">
                      <p className="text-sm text-muted-foreground">{tModels('noModelsFound')}</p>
                    </div>
                  )
                : groupedModels.map((group, groupIndex) => (
                    <div key={group.title} className="w-full">
                      {/* Group Header - Sticky */}
                      <div className="sticky top-0 z-10 w-full bg-black/80 backdrop-blur-[60px] px-4 sm:px-5 md:px-6 py-2.5 border-b border-white/5">
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn(
                            'text-xs font-semibold truncate',
                            groupIndex === 0 && 'text-foreground',
                            groupIndex === 1 && 'text-accent-foreground',
                            groupIndex > 1 && 'text-muted-foreground uppercase tracking-wider',
                          )}
                          >
                            {group.title}
                          </span>
                          {groupIndex === 0 && selectedCount > 0 && (
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4">
                                {selectedCount}
                                /
                                {maxModels}
                              </Badge>
                              <span className="text-[10px] opacity-70 hidden sm:inline whitespace-nowrap">{tModels('dragToReorder')}</span>
                            </div>
                          )}
                          {groupIndex === 1 && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                              {tModels('topModels')}
                            </Badge>
                          )}
                          {groupIndex > 1 && (
                            <span className="text-[10px] opacity-80 shrink-0 whitespace-nowrap">
                              {group.models.length}
                              {' '}
                              {group.models.length === 1 ? tModels('model') : tModels('models')}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Group Models */}
                      {enableDrag && groupIndex === 0
                        ? (
                            <Reorder.Group
                              axis="y"
                              values={group.models}
                              onReorder={(reordered) => {
                                // Update only the selected models order
                                const otherModels = orderedModels.filter(om => om.participant === null);
                                onReorder([...reordered, ...otherModels]);
                              }}
                              className="flex flex-col gap-2 w-full px-4 sm:px-5 md:px-6 py-2"
                            >
                              {group.models.map(orderedModel => (
                                <ModelItem
                                  key={orderedModel.model.id}
                                  orderedModel={orderedModel}
                                  allParticipants={allParticipants}
                                  customRoles={customRoles}
                                  onToggle={() => handleToggle(orderedModel.model.id)}
                                  onRoleChange={(role, customRoleId) =>
                                    onRoleChange(orderedModel.model.id, role, customRoleId)}
                                  onClearRole={() => onClearRole(orderedModel.model.id)}
                                  selectedCount={selectedCount}
                                  maxModels={maxModels}
                                  enableDrag={enableDrag}
                                  userTierInfo={userTierInfo}
                                />
                              ))}
                            </Reorder.Group>
                          )
                        : (
                            <div className="flex flex-col gap-2 w-full px-4 sm:px-5 md:px-6 py-2">
                              {group.models.map(orderedModel => (
                                <ModelItem
                                  key={orderedModel.model.id}
                                  orderedModel={orderedModel}
                                  allParticipants={allParticipants}
                                  customRoles={customRoles}
                                  onToggle={() => handleToggle(orderedModel.model.id)}
                                  onRoleChange={(role, customRoleId) =>
                                    onRoleChange(orderedModel.model.id, role, customRoleId)}
                                  onClearRole={() => onClearRole(orderedModel.model.id)}
                                  selectedCount={selectedCount}
                                  maxModels={maxModels}
                                  enableDrag={false}
                                  userTierInfo={userTierInfo}
                                />
                              ))}
                            </div>
                          )}
                    </div>
                  ))}
            </div>
          </ScrollArea>
        </div>

        {/* Footer - Fixed (if children provided) */}
        {children && (
          <div className="shrink-0">
            {children}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
