'use client';
import {
  EyeOff,
  GripVertical,
  Lock,
  Plus,
  X,
} from 'lucide-react';
import { Reorder, useDragControls } from 'motion/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import type { EnhancedModelResponse } from '@/api/routes/models/schema';
import type { SubscriptionTier } from '@/api/services/product-logic.service';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';
import { cn } from '@/lib/ui/cn';
import { getProviderIcon } from '@/lib/utils/ai-display';
import { getRoleBadgeStyle, getShortRoleName } from '@/lib/utils/role-colors';
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
  /** Whether model is incompatible with current file attachments (e.g., no vision for images/PDFs) */
  isIncompatibleWithFiles?: boolean;
  /** Pending role for models not yet toggled on - allows role assignment independently of selection */
  pendingRole?: { role: string; customRoleId?: string };
};

export function ModelItem({
  orderedModel,
  allParticipants: _allParticipants,
  customRoles: _customRoles,
  onToggle,
  onRoleChange: _onRoleChange,
  onClearRole,
  selectedCount,
  maxModels,
  enableDrag = true,
  userTierInfo: _userTierInfo,
  onOpenRolePanel,
  isIncompatibleWithFiles = false,
  pendingRole,
}: ModelItemProps) {
  const tModels = useTranslations('chat.models');
  const dragControls = useDragControls();
  const { model, participant } = orderedModel;
  const isSelected = participant !== null;
  const isAccessible = model.is_accessible_to_user ?? isSelected;
  const isDisabledDueToTier = !isSelected && !isAccessible;
  const isDisabledDueToLimit = !isSelected && selectedCount >= maxModels;
  // Disable selection if model can't handle uploaded files (e.g., no vision for images/PDFs)
  const isDisabledDueToFileIncompatibility = !isSelected && isIncompatibleWithFiles;
  // Show warning badge for ANY incompatible model (selected or not)
  const showFileIncompatibilityWarning = isIncompatibleWithFiles;
  // Allow deselecting all - validation shown elsewhere
  const isDisabled = isDisabledDueToTier || isDisabledDueToLimit || isDisabledDueToFileIncompatibility;

  const itemContent = (
    <div className="flex items-center gap-2 sm:gap-3 w-full min-w-0">
      {enableDrag && (
        <div
          className="shrink-0 text-muted-foreground cursor-grab active:cursor-grabbing select-none p-1 -m-1"
          style={{ touchAction: 'none' }}
          onPointerDown={(e) => {
            e.stopPropagation();
            dragControls.start(e);
          }}
        >
          <GripVertical className="size-4 sm:size-5" />
        </div>
      )}
      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 overflow-hidden">
        <Avatar className="size-8 sm:size-10 shrink-0">
          <AvatarImage src={getProviderIcon(model.provider)} alt={model.name} />
          <AvatarFallback className="text-[10px] sm:text-xs">
            {model.name.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0 overflow-hidden space-y-0.5 sm:space-y-1">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 overflow-hidden">
            <span className="text-xs sm:text-sm font-semibold truncate min-w-0">{model.name}</span>

            {/* Tier/Limit/Incompatibility badges - show immediately after name */}
            {isDisabledDueToTier && (model.required_tier_name || model.required_tier) && (
              <Badge variant="secondary" className="text-[8px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 h-4 sm:h-5 font-semibold bg-amber-500/20 text-amber-400 border-amber-500/30 shrink-0 uppercase">
                {model.required_tier_name || model.required_tier}
              </Badge>
            )}
            {isDisabledDueToLimit && !isDisabledDueToTier && (
              <Badge variant="outline" className="text-[8px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 h-4 sm:h-5 border-warning/50 text-warning shrink-0">
                {tModels('limitReached')}
              </Badge>
            )}
            {showFileIncompatibilityWarning && !isDisabledDueToTier && !isDisabledDueToLimit && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-[8px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 h-4 sm:h-5 border-destructive/50 text-destructive shrink-0 gap-1">
                    <EyeOff className="size-2.5 sm:size-3" />
                    {tModels('noVision')}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[200px]">
                  {tModels('noVisionTooltip')}
                </TooltipContent>
              </Tooltip>
            )}

            {/* Role badges or Add Role button - always visible */}
            {!isDisabledDueToTier && (() => {
              // Use participant role if selected, otherwise use pending role
              const displayRole = participant?.role ?? pendingRole?.role;

              return (
                <div
                  className="shrink-0 flex items-center gap-0.5 sm:gap-1"
                  onClick={e => e.stopPropagation()}
                  // ✅ MOTION FIX: Stop pointer events to prevent Reorder.Item onTap from firing
                  onPointerDownCapture={e => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation();
                    }
                  }}
                  role="presentation"
                >
                  {displayRole
                    ? (
                        <Badge
                          className="text-[8px] sm:text-[10px] pl-1.5 sm:pl-2 pr-0.5 sm:pr-1 py-0.5 h-4 sm:h-5 font-semibold border cursor-pointer hover:opacity-80 transition-opacity rounded-full inline-flex items-center gap-0.5 sm:gap-1"
                          style={getRoleBadgeStyle(getShortRoleName(displayRole))}
                          onClick={() => onOpenRolePanel?.()}
                        >
                          {getShortRoleName(displayRole)}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onClearRole();
                            }}
                            className="shrink-0 p-0.5 rounded-full hover:bg-black/20 transition-colors"
                            aria-label="Clear role"
                          >
                            <X className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                          </button>
                        </Badge>
                      )
                    : (
                        <button
                          type="button"
                          className="inline-flex items-center gap-0.5 sm:gap-1 h-5 sm:h-6 px-1.5 sm:px-2.5 rounded-full text-[9px] sm:text-[11px] font-medium border border-dashed border-muted-foreground/40 text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenRolePanel?.();
                          }}
                        >
                          <Plus className="h-2.5 w-2.5 sm:h-3.5 sm:w-3.5" />
                          {tModels('addRole')}
                        </button>
                      )}
                </div>
              );
            })()}
          </div>
          <div className="text-[10px] sm:text-xs text-muted-foreground truncate w-full min-w-0">
            {model.description}
          </div>
        </div>
      </div>

      {/* Show lock icon for inaccessible models, toggle switch for accessible */}
      {isDisabledDueToTier
        ? (
            <Link
              href="/chat/pricing"
              className="shrink-0 p-1 sm:p-1.5 rounded-full touch-manipulation"
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
              // ✅ MOTION FIX: Stop pointer events to prevent Reorder.Item onTap from firing
              onPointerDownCapture={e => e.stopPropagation()}
            />
          )}
    </div>
  );

  if (enableDrag) {
    return (
      <Reorder.Item
        value={orderedModel}
        dragControls={dragControls}
        dragListener={false}
        dragElastic={0}
        dragMomentum={false}
        layout
        style={{ position: 'relative' }}
        className={cn(
          'p-3 sm:p-4 w-full rounded-xl block touch-manipulation cursor-pointer',
          isDisabled && 'opacity-50 cursor-not-allowed',
        )}
        whileHover={
          !isDisabled
            ? {
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                borderColor: 'rgba(255, 255, 255, 0.12)',
              }
            : undefined
        }
        whileDrag={{
          scale: 1.02,
          boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.4)',
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          cursor: 'grabbing',
        }}
        transition={{ duration: 0.15 }}
        onClick={isDisabled ? undefined : onToggle}
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
        'p-3 sm:p-4 w-full rounded-xl block touch-manipulation',
        'border border-transparent',
        'cursor-pointer transition-all duration-200 ease-out',
        !isDisabled && 'hover:bg-white/[0.08] hover:backdrop-blur-md hover:border-white/[0.12] active:bg-white/[0.12]',
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
