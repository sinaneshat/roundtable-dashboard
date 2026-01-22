import type { SubscriptionTier } from '@roundtable/shared';
import { SUBSCRIPTION_TIER_NAMES } from '@roundtable/shared';
import { memo, useMemo } from 'react';

import { ModelAvatarWithRole } from '@/components/chat/model-avatar-with-role';
import { Icons } from '@/components/icons';
import { canAccessPreset } from '@/lib/config';
import type { ModelPreset, PresetSelectionResult } from '@/lib/config/model-presets';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/ui/cn';
import type { Model } from '@/services/api';

type ModelPresetCardProps = {
  preset: ModelPreset;
  allModels: Model[];
  userTier: SubscriptionTier;
  onSelect: (result: PresetSelectionResult) => void;
  className?: string;
  isSelected?: boolean;
  incompatibleModelIds?: Set<string>;
  onCustomize?: (result: PresetSelectionResult) => void;
  isUserPreset?: boolean;
  onDelete?: () => void;
};

export const ModelPresetCard = memo(({
  preset,
  allModels,
  userTier,
  onSelect,
  className,
  isSelected = false,
  incompatibleModelIds,
  onCustomize,
  isUserPreset = false,
  onDelete,
}: ModelPresetCardProps) => {
  const t = useTranslations();
  const isLocked = !canAccessPreset(preset, userTier);

  const compatibleModelCount = useMemo(() => {
    if (!incompatibleModelIds || incompatibleModelIds.size === 0) {
      return preset.modelRoles.length;
    }
    return preset.modelRoles.filter(mr => !incompatibleModelIds.has(mr.modelId)).length;
  }, [preset.modelRoles, incompatibleModelIds]);

  const isFullyDisabled = compatibleModelCount === 0;

  const handleClick = () => {
    if (isLocked || isFullyDisabled)
      return;
    onSelect({ preset });
  };

  return (
    <div
      role="button"
      tabIndex={isFullyDisabled ? -1 : 0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      aria-disabled={isFullyDisabled}
      aria-pressed={isSelected}
      className={cn(
        'group relative flex flex-col p-4 rounded-2xl text-left w-full',
        'bg-card border transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        !isSelected && 'border-border/50',
        !isLocked && !isFullyDisabled && !isSelected && 'hover:bg-white/[0.07] hover:border-border cursor-pointer',
        isSelected && !isLocked && 'bg-white/10 border-white/20 cursor-pointer',
        isLocked && 'opacity-50 cursor-not-allowed',
        isFullyDisabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="text-base font-semibold text-foreground leading-tight truncate min-w-0">
          {preset.name}
        </h3>

        <div className="flex items-center gap-1.5 shrink-0">
          {!isLocked && !isFullyDisabled && onCustomize && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCustomize({ preset });
              }}
              className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-white/[0.07] transition-all"
              aria-label={t('chat.models.presets.customizePreset')}
            >
              <Icons.slidersHorizontal className="size-4 text-muted-foreground" />
            </button>
          )}

          {isUserPreset && onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-destructive/20 transition-all"
              aria-label={t('chat.models.presets.deletePreset')}
            >
              <Icons.trash className="size-4 text-destructive" />
            </button>
          )}

          {isLocked && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20">
              <Icons.lock className="size-3 text-amber-400" />
              <span className="text-[10px] font-medium text-amber-400">
                {SUBSCRIPTION_TIER_NAMES[preset.requiredTier]}
              </span>
            </div>
          )}

          {!isLocked && incompatibleModelIds && incompatibleModelIds.size > 0 && compatibleModelCount < preset.modelRoles.length && (
            <div className={cn(
              'flex items-center gap-1 px-2 py-0.5 rounded-full',
              isFullyDisabled
                ? 'bg-destructive/20'
                : 'bg-yellow-500/20',
            )}
            >
              <Icons.alertTriangle className={cn(
                'size-3',
                isFullyDisabled ? 'text-destructive' : 'text-yellow-400',
              )}
              />
              <span className={cn(
                'text-[10px] font-medium',
                isFullyDisabled ? 'text-destructive' : 'text-yellow-400',
              )}
              >
                {compatibleModelCount}
                /
                {preset.modelRoles.length}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-start gap-4 mb-3">
        {preset.modelRoles.slice(0, 5).map((modelRole) => {
          const model = allModels.find(m => m.id === modelRole.modelId);
          if (!model)
            return null;

          const isModelIncompatible = incompatibleModelIds?.has(modelRole.modelId) ?? false;

          return (
            <ModelAvatarWithRole
              key={modelRole.modelId}
              model={model}
              role={modelRole.role}
              size="base"
              isIncompatible={isModelIncompatible}
            />
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
        {preset.description}
      </p>
    </div>
  );
});

ModelPresetCard.displayName = 'ModelPresetCard';
