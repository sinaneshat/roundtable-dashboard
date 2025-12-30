'use client';

import { Lock, SlidersHorizontal, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { memo, useMemo } from 'react';

import type { SubscriptionTier } from '@/api/core/enums';
import type { EnhancedModelResponse } from '@/api/routes/models/schema';
import { SUBSCRIPTION_TIER_NAMES } from '@/api/services/product-logic.service';
import { ModelAvatarWithRole } from '@/components/chat/model-avatar-with-role';
import { Button } from '@/components/ui/button';
import type { ModelPreset, PresetSelectionResult } from '@/lib/config/model-presets';
import { canAccessPreset } from '@/lib/config/model-presets';
import { cn } from '@/lib/ui/cn';

type ModelPresetCardProps = {
  preset: ModelPreset;
  allModels: EnhancedModelResponse[];
  userTier: SubscriptionTier;
  onSelect: (result: PresetSelectionResult) => void;
  className?: string;
  isSelected?: boolean;
  incompatibleModelIds?: Set<string>;
  onCustomize?: (result: PresetSelectionResult) => void;
  /** Whether this is a user-created preset */
  isUserPreset?: boolean;
  /** Callback to delete a user preset */
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
  const t = useTranslations('chat.models');
  const isLocked = !canAccessPreset(preset, userTier);

  const compatibleModelCount = useMemo(() => {
    if (!incompatibleModelIds || incompatibleModelIds.size === 0) {
      return preset.modelRoles.length;
    }
    return preset.modelRoles.filter(mr => !incompatibleModelIds.has(mr.modelId)).length;
  }, [preset.modelRoles, incompatibleModelIds]);

  const isFullyDisabled = compatibleModelCount === 0;

  const handleClick = () => {
    // Locked presets have upgrade button at bottom - don't navigate on card click
    if (isLocked || isFullyDisabled) {
      return;
    }
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
        !isLocked && !isFullyDisabled && !isSelected && 'hover:bg-white/10 hover:border-border cursor-pointer',
        isSelected && !isLocked && 'bg-white/10 border-white/70 cursor-pointer',
        isLocked && 'opacity-70 cursor-pointer hover:opacity-80',
        isFullyDisabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="text-base font-semibold text-foreground leading-tight">
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
              className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all"
              aria-label="Customize preset"
            >
              <SlidersHorizontal className="size-4 text-muted-foreground" />
            </button>
          )}

          {/* Delete icon - shows on hover for user presets */}
          {isUserPreset && onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-destructive/20 transition-all"
              aria-label="Delete preset"
            >
              <Trash2 className="size-4 text-destructive" />
            </button>
          )}

          {/* Lock indicator for locked presets */}
          {isLocked && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20">
              <Lock className="size-3 text-amber-400" />
              <span className="text-[10px] font-medium text-amber-400">
                {SUBSCRIPTION_TIER_NAMES[preset.requiredTier]}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Model Avatars with Role Labels */}
      <div className="flex items-start gap-4 mb-3">
        {preset.modelRoles.slice(0, 5).map((modelRole) => {
          const model = allModels.find(m => m.id === modelRole.modelId);
          if (!model)
            return null;

          return (
            <ModelAvatarWithRole
              key={modelRole.modelId}
              model={model}
              role={modelRole.role}
              size="sm"
            />
          );
        })}
      </div>

      {/* Description */}
      <p className="text-xs text-muted-foreground leading-relaxed">
        {preset.description}
      </p>

      {/* Upgrade button for locked presets */}
      {isLocked && (
        <div className="mt-3">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="w-full h-7 text-xs border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
          >
            <Link href="/chat/pricing" onClick={e => e.stopPropagation()}>
              {t('upgradeToTier', { tier: SUBSCRIPTION_TIER_NAMES[preset.requiredTier] })}
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
});

ModelPresetCard.displayName = 'ModelPresetCard';
