'use client';

import { Lock, SlidersHorizontal } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { memo, useMemo } from 'react';

import type { EnhancedModelResponse } from '@/api/routes/models/schema';
import type { SubscriptionTier } from '@/api/services/product-logic.service';
import { SUBSCRIPTION_TIER_NAMES } from '@/api/services/product-logic.service';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import type { ModelPreset } from '@/lib/config/model-presets';
import { canAccessPreset } from '@/lib/config/model-presets';
import { cn } from '@/lib/ui/cn';
import { getProviderIcon } from '@/lib/utils/ai-display';
import { getRoleColors, getShortRoleName } from '@/lib/utils/role-colors';

/** Selection result includes preset with model-role mappings */
export type PresetSelectionResult = {
  preset: ModelPreset;
};

type ModelPresetCardProps = {
  preset: ModelPreset;
  allModels: EnhancedModelResponse[];
  userTier: SubscriptionTier;
  onSelect: (result: PresetSelectionResult) => void;
  className?: string;
  /** Whether this preset is currently selected */
  isSelected?: boolean;
  /** Set of model IDs incompatible with current file attachments (no vision) */
  incompatibleModelIds?: Set<string>;
  /** Callback to customize this preset in Build Custom tab */
  onCustomize?: (result: PresetSelectionResult) => void;
};

/**
 * ModelPresetCard Component
 *
 * Displays a conversation preset card:
 * - Dark card with subtle border
 * - Title row
 * - Model avatars below
 * - Description at bottom
 * - Selection ring when selected
 */
export const ModelPresetCard = memo(({
  preset,
  allModels,
  userTier,
  onSelect,
  className,
  isSelected = false,
  incompatibleModelIds,
  onCustomize,
}: ModelPresetCardProps) => {
  const router = useRouter();
  const isLocked = !canAccessPreset(preset, userTier);

  // Get models for this preset from modelRoles
  const presetModelIds = preset.modelRoles.map(mr => mr.modelId);

  // Count how many models will be available after filtering incompatible ones
  const compatibleModelCount = useMemo(() => {
    if (!incompatibleModelIds || incompatibleModelIds.size === 0)
      return presetModelIds.length;
    return presetModelIds.filter(id => !incompatibleModelIds.has(id)).length;
  }, [presetModelIds, incompatibleModelIds]);

  const handleClick = () => {
    if (isLocked) {
      router.push('/chat/pricing');
      return;
    }
    // Don't select if all models are incompatible
    if (compatibleModelCount === 0) {
      return;
    }
    onSelect({ preset });
  };

  // Fully disabled if all models are incompatible
  const isFullyDisabled = compatibleModelCount === 0;

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
        // Base card styles
        'group relative flex flex-col p-4 rounded-2xl text-left w-full',
        'bg-card border transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        // Default border
        !isSelected && 'border-border/50',
        // Hover state (when not locked/disabled/selected) - matches composer button pattern
        !isLocked && !isFullyDisabled && !isSelected && 'hover:bg-white/10 hover:border-border cursor-pointer',
        // Selected state - white border + background
        isSelected && !isLocked && 'bg-white/10 border-white/70 cursor-pointer',
        // Locked state
        isLocked && 'opacity-70 cursor-pointer hover:opacity-80',
        // Disabled state
        isFullyDisabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
    >
      {/* Header row: Title + Actions */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="text-base font-semibold text-foreground leading-tight">
          {preset.name}
        </h3>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Customize icon - shows on hover */}
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

          const shortRole = getShortRoleName(modelRole.role);
          const roleColors = getRoleColors(shortRole);

          return (
            <div key={modelRole.modelId} className="flex flex-col items-center gap-1.5">
              <Avatar className="size-8 bg-card">
                <AvatarImage
                  src={getProviderIcon(model.provider)}
                  alt={model.name}
                  className="object-contain p-1"
                />
                <AvatarFallback className="text-xs bg-card font-semibold">
                  {model.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span
                className="text-[10px] font-medium leading-none"
                style={{ color: roleColors.iconColor }}
              >
                {shortRole}
              </span>
            </div>
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
            variant="outline"
            size="sm"
            className="w-full h-7 text-xs border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
            onClick={(e) => {
              e.stopPropagation();
              router.push('/chat/pricing');
            }}
          >
            Upgrade to
            {' '}
            {SUBSCRIPTION_TIER_NAMES[preset.requiredTier]}
          </Button>
        </div>
      )}
    </div>
  );
});

ModelPresetCard.displayName = 'ModelPresetCard';
