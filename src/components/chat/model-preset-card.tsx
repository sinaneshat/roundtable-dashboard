'use client';

import { EyeOff, Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { memo, useMemo } from 'react';

import type { BaseModelResponse, EnhancedModelResponse } from '@/api/routes/models/schema';
import type { SubscriptionTier } from '@/api/services/product-logic.service';
import { SUBSCRIPTION_TIER_NAMES } from '@/api/services/product-logic.service';
import { AvatarGroup } from '@/components/chat/avatar-group';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ModelPreset } from '@/lib/config/model-presets';
import { canAccessPreset, getModelsForPreset } from '@/lib/config/model-presets';
import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';
import { cn } from '@/lib/ui/cn';

type ModelPresetCardProps = {
  preset: ModelPreset;
  allModels: EnhancedModelResponse[];
  userTier: SubscriptionTier;
  onSelect: (models: BaseModelResponse[]) => void;
  className?: string;
  /** Set of model IDs incompatible with current file attachments (no vision) */
  incompatibleModelIds?: Set<string>;
};

/**
 * ModelPresetCard Component
 *
 * Displays a preset card with icon, name, description, and model avatars.
 * Handles tier-based locking with upgrade prompts.
 */
export const ModelPresetCard = memo(({
  preset,
  allModels,
  userTier,
  onSelect,
  className,
  incompatibleModelIds,
}: ModelPresetCardProps) => {
  const router = useRouter();
  const t = useTranslations('chat.models');
  const isLocked = !canAccessPreset(preset, userTier);
  const Icon = preset.icon;

  // Get models for this preset (use power tier to show what models would be included)
  const presetModels = getModelsForPreset(
    preset,
    allModels,
    isLocked ? 'power' : userTier,
  );

  // Check if any models in this preset are incompatible with vision files
  const hasIncompatibleModels = useMemo(() => {
    if (!incompatibleModelIds || incompatibleModelIds.size === 0)
      return false;
    return presetModels.some(model => incompatibleModelIds.has(model.id));
  }, [presetModels, incompatibleModelIds]);

  // Count how many models will be available after filtering incompatible ones
  const compatibleModelCount = useMemo(() => {
    if (!incompatibleModelIds || incompatibleModelIds.size === 0)
      return presetModels.length;
    return presetModels.filter(m => !incompatibleModelIds.has(m.id)).length;
  }, [presetModels, incompatibleModelIds]);

  // Convert models to participant config format for AvatarGroup
  const participants: ParticipantConfig[] = presetModels.map((model, index) => ({
    id: `preset-${preset.id}-${index}`,
    modelId: model.id,
    role: '',
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
    onSelect(presetModels);
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
      className={cn(
        'relative flex flex-col h-full p-4 rounded-xl text-left w-full',
        'border border-transparent',
        'transition-all duration-200 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20',
        !isLocked && !isFullyDisabled && 'hover:bg-white/[0.08] hover:border-white/[0.12] hover:backdrop-blur-md cursor-pointer',
        isLocked && 'opacity-70 cursor-pointer hover:opacity-80 hover:bg-white/[0.05]',
        isFullyDisabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
    >
      {/* Locked overlay badge */}
      {isLocked && (
        <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-500/20 border border-amber-500/30">
          <Lock className="size-3 text-amber-400" />
          <span className="text-[10px] font-medium text-amber-400">
            {SUBSCRIPTION_TIER_NAMES[preset.requiredTier]}
          </span>
        </div>
      )}

      {/* Vision incompatibility warning badge */}
      {!isLocked && hasIncompatibleModels && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="absolute top-3 right-3">
              <Badge
                variant="outline"
                className="text-[10px] px-2 py-0.5 h-5 border-destructive/50 text-destructive gap-1"
              >
                <EyeOff className="size-3" />
                {compatibleModelCount === 0
                  ? t('noVision')
                  : `${compatibleModelCount}/${presetModels.length}`}
              </Badge>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[220px]">
            {compatibleModelCount === 0
              ? t('presetNoVisionAll')
              : t('presetNoVisionPartial', { count: presetModels.length - compatibleModelCount })}
          </TooltipContent>
        </Tooltip>
      )}

      {/* Content wrapper - grows to fill space */}
      <div className="flex-1 flex flex-col">
        {/* Header: Icon + Name */}
        <div className="flex items-center gap-3 mb-2">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/5">
            <Icon className="size-5 text-white/70" />
          </div>
          <h3 className="text-sm font-semibold text-foreground pr-16">
            {preset.name}
          </h3>
        </div>

        {/* Model Avatars */}
        <div className="mb-3">
          <AvatarGroup
            participants={participants}
            allModels={allModels}
            maxVisible={5}
            size="sm"
          />
        </div>

        {/* Description */}
        <p className="text-xs text-muted-foreground leading-relaxed flex-1">
          {preset.description}
        </p>
      </div>

      {/* Upgrade button for locked presets - always at footer */}
      {isLocked && (
        <div className="mt-3 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="w-full h-8 text-xs border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
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
