'use client';

import { Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { memo, useMemo } from 'react';

import type { EnhancedModelResponse } from '@/api/routes/models/schema';
import type { SubscriptionTier } from '@/api/services/product-logic.service';
import { SUBSCRIPTION_TIER_NAMES } from '@/api/services/product-logic.service';
import { AvatarGroup } from '@/components/chat/avatar-group';
import { Button } from '@/components/ui/button';
import type { ModelPreset } from '@/lib/config/model-presets';
import { canAccessPreset } from '@/lib/config/model-presets';
import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';
import { cn } from '@/lib/ui/cn';

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

  // Convert to participant config format for AvatarGroup
  const participants: ParticipantConfig[] = preset.modelRoles.map((mr, index) => ({
    id: `preset-${preset.id}-${index}`,
    modelId: mr.modelId,
    role: mr.role,
    priority: index,
  }));

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
      {/* Header row: Title */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="text-base font-semibold text-foreground leading-tight">
          {preset.name}
        </h3>

        {/* Lock indicator for locked presets */}
        {isLocked && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 shrink-0">
            <Lock className="size-3 text-amber-400" />
            <span className="text-[10px] font-medium text-amber-400">
              {SUBSCRIPTION_TIER_NAMES[preset.requiredTier]}
            </span>
          </div>
        )}
      </div>

      {/* Model Avatars */}
      <div className="mb-3">
        <AvatarGroup
          participants={participants}
          allModels={allModels}
          maxVisible={5}
          size="sm"
          showCount={false}
          overlap={false}
        />
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
