'use client';

import { Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { memo } from 'react';

import type { BaseModelResponse, EnhancedModelResponse } from '@/api/routes/models/schema';
import type { SubscriptionTier } from '@/api/services/product-logic.service';
import { SUBSCRIPTION_TIER_NAMES } from '@/api/services/product-logic.service';
import { AvatarGroup } from '@/components/chat/avatar-group';
import { Button } from '@/components/ui/button';
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
}: ModelPresetCardProps) => {
  const router = useRouter();
  const isLocked = !canAccessPreset(preset, userTier);
  const Icon = preset.icon;

  // Get models for this preset (use power tier to show what models would be included)
  const presetModels = getModelsForPreset(
    preset,
    allModels,
    isLocked ? 'power' : userTier,
  );

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
    onSelect(presetModels);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={false}
      className={cn(
        'relative flex flex-col h-full p-4 rounded-xl text-left w-full',
        'border border-white/[0.08] bg-card/50 backdrop-blur-sm',
        'transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20',
        !isLocked && 'hover:bg-white/5 hover:border-white/[0.15] hover:backdrop-blur-md cursor-pointer',
        isLocked && 'opacity-70 cursor-pointer hover:opacity-80',
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
    </button>
  );
});

ModelPresetCard.displayName = 'ModelPresetCard';
