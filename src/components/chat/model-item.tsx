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
import { useState } from 'react';

import { getShortRoleName } from '@/api/core/enums';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { OrderedModel } from '@/lib/schemas/model-schemas';
import { cn } from '@/lib/ui/cn';
import { getProviderIcon, getRoleBadgeStyle } from '@/lib/utils';

type PendingRole = {
  role: string;
  customRoleId?: string;
};

type RoleBadgeDisplayProps = {
  displayRole: string | undefined;
  onOpenRolePanel?: () => void;
  onClearRole: () => void;
  tModels: (key: string) => string;
  tAccessibility: (key: string) => string;
};

function RoleBadgeDisplay({
  displayRole,
  onOpenRolePanel,
  onClearRole,
  tModels,
  tAccessibility,
}: RoleBadgeDisplayProps) {
  return (
    <div
      className="shrink-0 flex items-center gap-0.5 sm:gap-1"
      onClick={e => e.stopPropagation()}
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
              className="text-[8px] sm:text-[10px] pl-1.5 sm:pl-2 pr-0.5 sm:pr-1 py-0.5 h-4 sm:h-5 font-semibold border cursor-pointer hover:opacity-80 transition-opacity rounded-full inline-flex items-center gap-0.5 sm:gap-1 max-w-[100px] sm:max-w-[120px]"
              style={getRoleBadgeStyle(getShortRoleName(displayRole))}
              onClick={() => onOpenRolePanel?.()}
            >
              <span className="truncate">
                {getShortRoleName(displayRole)}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClearRole();
                }}
                className="shrink-0 p-0.5 rounded-full hover:bg-black/20 transition-colors"
                aria-label={tAccessibility('clearRole')}
              >
                <X className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
              </button>
            </Badge>
          )
        : (
            <button
              type="button"
              className="inline-flex items-center gap-0.5 sm:gap-1 h-4 sm:h-5 px-1.5 sm:px-2 rounded-full text-[8px] sm:text-[10px] font-medium border border-dashed border-muted-foreground/40 text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onOpenRolePanel?.();
              }}
            >
              <Plus className="h-2 w-2 sm:h-2.5 sm:w-2.5" />
              {tModels('addRole')}
            </button>
          )}
    </div>
  );
}

export type ModelItemProps = {
  orderedModel: OrderedModel;
  onToggle: () => void;
  onClearRole: () => void;
  selectedCount: number;
  maxModels: number;
  enableDrag?: boolean;
  onOpenRolePanel?: () => void;
  isIncompatibleWithFiles?: boolean;
  pendingRole?: PendingRole;
};

export function ModelItem({
  orderedModel,
  onToggle,
  onClearRole,
  selectedCount,
  maxModels,
  enableDrag = true,
  onOpenRolePanel,
  isIncompatibleWithFiles = false,
  pendingRole,
}: ModelItemProps) {
  const tModels = useTranslations('chat.models');
  const tAccessibility = useTranslations('accessibility');
  const dragControls = useDragControls();
  const [isDragging, setIsDragging] = useState(false);
  const { model, participant } = orderedModel;
  const isSelected = participant !== null;
  const isAccessible = model.is_accessible_to_user ?? isSelected;
  const isDisabledDueToTier = !isSelected && !isAccessible;
  const isDisabledDueToLimit = !isSelected && selectedCount >= maxModels;
  const isDisabledDueToFileIncompatibility = !isSelected && isIncompatibleWithFiles;
  const showFileIncompatibilityWarning = isIncompatibleWithFiles;
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

            {!isDisabledDueToTier && (
              <RoleBadgeDisplay
                displayRole={participant?.role ?? pendingRole?.role}
                onOpenRolePanel={onOpenRolePanel}
                onClearRole={onClearRole}
                tModels={tModels}
                tAccessibility={tAccessibility}
              />
            )}
          </div>
          <div className="text-[10px] sm:text-xs text-muted-foreground truncate w-full min-w-0">
            {model.description}
          </div>
        </div>
      </div>

      {isDisabledDueToTier
        ? (
            <Link
              href="/chat/pricing"
              className="shrink-0 p-1 sm:p-1.5 rounded-full touch-manipulation"
              onClick={e => e.stopPropagation()}
              aria-label={tModels('upgradeToUnlock')}
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
        style={{ position: 'relative', borderRadius: '0.75rem' }}
        className={cn(
          'p-3 sm:p-4 w-full rounded-xl block touch-manipulation cursor-pointer',
          'transition-[background-color,backdrop-filter,box-shadow] duration-150',
          isDisabled && 'opacity-50 cursor-not-allowed',
          !isDisabled && !isDragging && 'hover:bg-white/[0.08] hover:backdrop-blur-md',
          isDragging && 'bg-white/[0.1] backdrop-blur-xl shadow-[0px_8px_24px_rgba(0,0,0,0.4)] cursor-grabbing',
        )}
        onDragStart={() => setIsDragging(true)}
        onDragEnd={() => setIsDragging(false)}
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
