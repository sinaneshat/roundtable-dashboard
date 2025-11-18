'use client';
import { GripVertical, Lock } from 'lucide-react';
import { Reorder, useDragControls } from 'motion/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import type { EnhancedModelResponse } from '@/api/routes/models/schema';
import type { SubscriptionTier } from '@/api/services/product-logic.service';
import type { ParticipantConfig } from '@/components/chat/chat-form-schemas';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/ui/cn';
import { getProviderIcon } from '@/lib/utils/ai-display';
import type { ListCustomRolesResponse } from '@/services/api/chat-roles';

import { RoleSelector } from './role-selector';

type CustomRole = NonNullable<Extract<ListCustomRolesResponse, { success: true }>['data']>['items'][number];
export type OrderedModel = {
  model: EnhancedModelResponse;
  participant: ParticipantConfig | null;
  order: number;
};
export type ModelItemProps = {
  orderedModel: OrderedModel;
  allParticipants: ParticipantConfig[];
  customRoles: CustomRole[];
  onToggle: () => void;
  onRoleChange: (role: string, customRoleId?: string) => void;
  onClearRole: () => void;
  selectedCount: number;
  maxModels: number;
  enableDrag?: boolean;
  userTierInfo?: {
    tier_name: string;
    max_models: number;
    current_tier: SubscriptionTier;
    can_upgrade: boolean;
  };
};
export function ModelItem({
  orderedModel,
  allParticipants,
  customRoles,
  onToggle,
  onRoleChange,
  onClearRole,
  selectedCount,
  maxModels,
  enableDrag = true,
  userTierInfo: _userTierInfo,
}: ModelItemProps) {
  const controls = useDragControls();
  const tModels = useTranslations('chat.models');
  const { model, participant } = orderedModel;
  const isSelected = participant !== null;
  const isAccessible = model.is_accessible_to_user ?? isSelected;
  const isDisabledDueToTier = !isSelected && !isAccessible;
  const isDisabledDueToLimit = !isSelected && selectedCount >= maxModels;
  const isDisabled = isDisabledDueToTier || isDisabledDueToLimit;

  const itemContent = (
    <div
      role="button"
      tabIndex={isDisabled ? -1 : 0}
      className={cn(
        'px-3 sm:px-4 py-2.5 sm:py-3 hover:bg-white/5 active:bg-white/10 transition-colors rounded-lg sm:rounded-xl mx-1 sm:mx-2 my-0.5 sm:my-1 block w-full',
        !isDisabled && 'cursor-pointer touch-manipulation',
        isDisabled && 'opacity-50 cursor-not-allowed',
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
      <div className="flex items-center gap-2 sm:gap-3 w-full min-w-0">
        {enableDrag && (
          <div
            className="shrink-0 text-muted-foreground p-1 sm:p-0.5 -ml-1 sm:ml-0 cursor-grab active:cursor-grabbing touch-none"
            onPointerDown={e => controls.start(e)}
            style={{ touchAction: 'none' }}
            aria-label={tModels('dragToReorder')}
            onClick={e => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
              }
            }}
            role="button"
            tabIndex={0}
          >
            <GripVertical className="size-4 sm:size-4" />
          </div>
        )}
        <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
          <Avatar className="size-8 sm:size-9 shrink-0">
            <AvatarImage src={getProviderIcon(model.provider)} alt={model.name} />
            <AvatarFallback className="text-xs">
              {model.name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0 overflow-hidden space-y-0.5 sm:space-y-1">
            <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
              <span className="text-xs sm:text-sm font-semibold truncate min-w-0">{model.name}</span>
              {/* Role Selector - Next to model title */}
              {!isDisabledDueToTier && (isSelected || !isDisabled) && (
                <div
                  className="shrink-0"
                  onClick={e => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation();
                    }
                  }}
                  role="presentation"
                >
                  <RoleSelector
                    participant={participant}
                    allParticipants={allParticipants}
                    customRoles={customRoles}
                    onRoleChange={onRoleChange}
                    onClearRole={onClearRole}
                    onRequestSelection={!participant ? onToggle : undefined}
                  />
                </div>
              )}
              {isDisabledDueToTier && (model.required_tier_name || model.required_tier) && (
                <Badge variant="secondary" className="text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 h-3.5 sm:h-4 font-semibold bg-amber-500/20 text-amber-400 border-amber-500/30 shrink-0 uppercase">
                  {model.required_tier_name || model.required_tier}
                </Badge>
              )}
              {isDisabledDueToLimit && !isDisabledDueToTier && (
                <Badge variant="outline" className="text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0 h-3.5 sm:h-4 border-warning/50 text-warning shrink-0">
                  {tModels('limitReached')}
                </Badge>
              )}
            </div>
            <div className="text-[11px] sm:text-xs text-muted-foreground line-clamp-2 sm:line-clamp-1 w-full min-w-0">
              {model.description}
            </div>
          </div>
        </div>

        {/* Show lock icon for inaccessible models, toggle switch for accessible */}
        {isDisabledDueToTier
          ? (
              <Link
                href="/chat/pricing"
                className="shrink-0 p-1 sm:p-1.5 rounded-md touch-manipulation"
                onClick={e => e.stopPropagation()}
                aria-label="Upgrade to unlock this model"
              >
                <Lock className="size-4 sm:size-5 text-amber-400" />
              </Link>
            )
          : (
              <Switch
                checked={isSelected}
                onCheckedChange={isDisabled ? undefined : onToggle}
                disabled={isDisabled}
                className="shrink-0 scale-90 sm:scale-100"
                onClick={e => e.stopPropagation()}
              />
            )}
      </div>
    </div>
  );
  if (enableDrag) {
    return (
      <Reorder.Item
        value={orderedModel}
        dragListener={false}
        dragControls={controls}
        className="block w-full min-w-0"
      >
        {itemContent}
      </Reorder.Item>
    );
  }
  return <div className="block w-full min-w-0">{itemContent}</div>;
}
