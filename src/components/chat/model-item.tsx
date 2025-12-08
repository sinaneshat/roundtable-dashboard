'use client';
import {
  GripVertical,
  Lock,
  Plus,
  X,
} from 'lucide-react';
import { Reorder } from 'motion/react';
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
import { getRoleBadgeStyle } from '@/lib/utils/role-colors';
import type { ListCustomRolesResponse } from '@/services/api/chat-roles';

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
  /** Callback to open role assignment panel for this model */
  onOpenRolePanel?: () => void;
};

export function ModelItem({
  orderedModel,
  allParticipants: _allParticipants,
  customRoles: _customRoles,
  onToggle,
  onRoleChange: _onRoleChange,
  onClearRole: _onClearRole,
  selectedCount,
  maxModels,
  enableDrag = true,
  userTierInfo: _userTierInfo,
  onOpenRolePanel,
}: ModelItemProps) {
  const tModels = useTranslations('chat.models');
  const { model, participant } = orderedModel;
  const isSelected = participant !== null;
  const isAccessible = model.is_accessible_to_user ?? isSelected;
  const isDisabledDueToTier = !isSelected && !isAccessible;
  const isDisabledDueToLimit = !isSelected && selectedCount >= maxModels;
  // Allow deselecting all - validation shown elsewhere
  const isDisabled = isDisabledDueToTier || isDisabledDueToLimit;

  const itemContent = (
    <div className="flex items-center gap-3 w-full min-w-0">
      {enableDrag && (
        <div className="shrink-0 text-muted-foreground cursor-grab active:cursor-grabbing">
          <GripVertical className="size-5" />
        </div>
      )}
      <div className="flex items-center gap-3 flex-1 min-w-0 overflow-hidden">
        <Avatar className="size-10 shrink-0">
          <AvatarImage src={getProviderIcon(model.provider)} alt={model.name} />
          <AvatarFallback className="text-xs">
            {model.name.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0 overflow-hidden space-y-1">
          <div className="flex items-center gap-2 min-w-0 overflow-hidden">
            <span className="text-sm font-semibold truncate min-w-0">{model.name}</span>

            {/* Tier/Limit badges - show immediately after name */}
            {isDisabledDueToTier && (model.required_tier_name || model.required_tier) && (
              <Badge variant="secondary" className="text-[10px] px-2 py-0.5 h-5 font-semibold bg-amber-500/20 text-amber-400 border-amber-500/30 shrink-0 uppercase">
                {model.required_tier_name || model.required_tier}
              </Badge>
            )}
            {isDisabledDueToLimit && !isDisabledDueToTier && (
              <Badge variant="outline" className="text-[10px] px-2 py-0.5 h-5 border-warning/50 text-warning shrink-0">
                {tModels('limitReached')}
              </Badge>
            )}

            {/* Role badges or Add Role button - always rendered to prevent layout shift */}
            {!isDisabledDueToTier && (
              <div
                className={cn(
                  'shrink-0 flex items-center gap-1',
                  !isSelected && 'invisible',
                )}
                onClick={e => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                  }
                }}
                role="presentation"
              >
                {participant?.role
                  ? (
                      <div className="inline-flex items-center gap-1">
                        <Badge
                          className="text-[10px] px-2 py-0.5 h-5 font-semibold border cursor-pointer hover:opacity-80 transition-opacity rounded-full"
                          style={getRoleBadgeStyle(participant.role)}
                          onClick={() => onOpenRolePanel?.()}
                        >
                          {participant.role}
                        </Badge>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            _onClearRole();
                          }}
                          className="shrink-0 p-0.5 rounded-sm hover:bg-white/10 transition-colors"
                          aria-label="Clear role"
                        >
                          <X className="h-3 w-3 text-muted-foreground" />
                        </button>
                      </div>
                    )
                  : (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[11px] font-medium border border-dashed border-muted-foreground/40 text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenRolePanel?.();
                        }}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {tModels('addRole')}
                      </button>
                    )}
              </div>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate w-full min-w-0">
            {model.description}
          </div>
        </div>
      </div>

      {/* Show lock icon for inaccessible models, toggle switch for accessible */}
      {isDisabledDueToTier
        ? (
            <Link
              href="/chat/pricing"
              className="shrink-0 p-1.5 rounded-md touch-manipulation"
              onClick={e => e.stopPropagation()}
              aria-label="Upgrade to unlock this model"
            >
              <Lock className="size-5 text-amber-400" />
            </Link>
          )
        : (
            <Switch
              checked={isSelected}
              onCheckedChange={isDisabled ? undefined : onToggle}
              disabled={isDisabled}
              className="shrink-0"
              onClick={e => e.stopPropagation()}
            />
          )}
    </div>
  );

  if (enableDrag) {
    return (
      <Reorder.Item
        value={orderedModel}
        layout
        style={{ position: 'relative' }}
        className={cn(
          'p-4 w-full rounded-xl block',
          'cursor-pointer transition-colors duration-200',
          !isDisabled && 'hover:bg-white/5',
          isDisabled && 'opacity-50 cursor-not-allowed',
        )}
        onTap={isDisabled ? undefined : onToggle}
      >
        {itemContent}
      </Reorder.Item>
    );
  }

  return (
    <div
      role="button"
      tabIndex={isDisabled ? -1 : 0}
      className={cn(
        'p-4 w-full rounded-xl block',
        'cursor-pointer transition-colors duration-200',
        !isDisabled && 'hover:bg-white/5',
        isDisabled && 'opacity-50 cursor-not-allowed',
      )}
      onClick={isDisabled ? undefined : onToggle}
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
      {itemContent}
    </div>
  );
}
