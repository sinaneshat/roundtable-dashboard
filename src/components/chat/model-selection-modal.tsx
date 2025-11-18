'use client';

import { X } from 'lucide-react';
import { Reorder } from 'motion/react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useMemo, useRef, useState } from 'react';

import type { SubscriptionTier } from '@/api/services/product-logic.service';
import type { ParticipantConfig } from '@/components/chat/chat-form-schemas';
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
 * Simplified AI model selection modal with search and drag-reordering.
 * Models are displayed in a single flat list sorted by the backend:
 * - Accessible models first (sorted by quality/flagship score)
 * - Inaccessible models after (sorted by required tier)
 */

type CustomRole = NonNullable<
  Extract<ListCustomRolesResponse, { success: true }>['data']
>['items'][number];

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
  const scrollAreaRef = useRef<HTMLDivElement>(null);

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

  // No grouping - simple flat list already sorted by backend
  // Backend sorts: accessible models first (by quality), then inaccessible (by tier)

  // Handle toggle - allow deselecting all models
  const handleToggle = (modelId: string) => {
    onToggle(modelId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        glass={true}
        className={cn(
          'overflow-hidden gap-0 p-0 flex flex-col',
          'max-h-[85vh] sm:max-h-[90vh]',
          'max-w-[768px] w-[calc(100vw-1rem)] sm:w-[calc(100vw-2.5rem)]',
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
          <DialogBody glass className="py-3 sm:py-4">
            <div className="relative w-full">
              <input
                ref={searchInputRef}
                type="text"
                placeholder={t('searchPlaceholder')}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className={cn(
                  'flex h-10 sm:h-9 w-full rounded-lg sm:rounded-md border border-input bg-transparent py-2 sm:py-1 text-base sm:text-sm shadow-xs transition-[color,box-shadow] outline-none',
                  'placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30',
                  'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
                  'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
                  searchQuery ? 'pl-3 pr-10 sm:pr-9' : 'px-3',
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

        {/* Scrollable Model List - Simple flat list */}
        <ScrollArea
          ref={scrollAreaRef}
          className="border-t border-white/5 bg-card/30 w-full overflow-hidden"
          style={{ height: 'clamp(250px, 60vh, 600px)' }}
        >
          <div className="w-full">
            {filteredModels.length === 0
              ? (
                  <div className="flex flex-col items-start justify-center py-12 px-4 sm:px-5 md:px-6">
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
                      className="flex flex-col gap-1.5 sm:gap-2 w-full px-2 sm:px-4 md:px-6 py-1.5 sm:py-2"
                    >
                      {filteredModels.map(orderedModel => (
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
                    <div className="flex flex-col gap-1.5 sm:gap-2 w-full px-2 sm:px-4 md:px-6 py-1.5 sm:py-2">
                      {filteredModels.map(orderedModel => (
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
        </ScrollArea>

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
