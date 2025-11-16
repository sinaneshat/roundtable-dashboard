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
        'px-4 py-3 hover:bg-white/5 transition-colors rounded-xl mx-2 my-1 block w-full max-w-[1148px]',
        !isDisabled && 'cursor-pointer',
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
      <div className="flex items-center gap-3 w-full max-w-3xl min-w-0" style={{ maxWidth: '768px' }}>
        {enableDrag && (
          <div
            className={cn(
              'shrink-0 text-muted-foreground p-0.5',
              !isDisabled && 'cursor-grab active:cursor-grabbing touch-none',
              isDisabled && 'cursor-not-allowed opacity-30',
            )}
            onPointerDown={isDisabled ? undefined : e => controls.start(e)}
            style={isDisabled ? undefined : { touchAction: 'none' }}
            aria-label={isDisabled ? tModels('dragDisabled') : tModels('dragToReorder')}
            onClick={e => e.stopPropagation()}
            onKeyDown={(e) => {
              if (!isDisabled && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
              }
            }}
            role="button"
            tabIndex={isDisabled ? -1 : 0}
          >
            <GripVertical className="size-4" />
          </div>
        )}
        <Switch
          checked={isSelected}
          onCheckedChange={isDisabled ? undefined : onToggle}
          disabled={isDisabled}
          className="shrink-0"
          onClick={e => e.stopPropagation()}
        />
        <div className="flex items-center gap-2 flex-1 max-w-[1148px] min-w-0 overflow-hidden">
          <Avatar className="size-9 shrink-0">
            <AvatarImage src={getProviderIcon(model.provider)} alt={model.name} />
            <AvatarFallback className="text-xs">
              {model.name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 max-w-[1148px] min-w-0 overflow-hidden space-y-1">
            <div className="flex items-center gap-1.5 max-w-[1148px] min-w-0 overflow-hidden">
              <span className="text-sm font-semibold truncate max-w-[1148px] min-w-0">{model.name}</span>
              {isDisabledDueToTier && (model.required_tier_name || model.required_tier) && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 h-4 font-semibold bg-amber-500/20 text-amber-400 border-amber-500/30 shrink-0 uppercase">
                  {model.required_tier_name || model.required_tier}
                </Badge>
              )}
              {isDisabledDueToLimit && !isDisabledDueToTier && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-warning/50 text-warning shrink-0">
                  {tModels('limitReached')}
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground truncate max-w-[1148px] w-full min-w-0">
              {model.description}
            </div>
          </div>
        </div>

        {/* Lock Icon for Inaccessible Models */}
        {isDisabledDueToTier && (
          <Link
            href="/chat/pricing"
            className="shrink-0 p-1.5 rounded-md"
            onClick={e => e.stopPropagation()}
            aria-label="Upgrade to unlock this model"
          >
            <Lock className="size-5 text-amber-400" />
          </Link>
        )}

        {/* Role Selector - Only show for selected or accessible models */}
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
      </div>
    </div>
  );
  if (enableDrag) {
    return (
      <Reorder.Item
        value={orderedModel}
        dragListener={false}
        dragControls={controls}
        className="block w-full max-w-[1148px] min-w-0 overflow-hidden"
      >
        {itemContent}
      </Reorder.Item>
    );
  }
  return <div className="block w-full max-w-[1148px] min-w-0 overflow-hidden">{itemContent}</div>;
}
