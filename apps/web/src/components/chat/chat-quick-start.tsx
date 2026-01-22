import type { ChatMode, SubscriptionTier } from '@roundtable/shared';
import { AvatarSizes, PlanTypes, SubscriptionTiers } from '@roundtable/shared';
import { motion } from 'motion/react';
import { useCallback, useMemo } from 'react';

import { AvatarGroup } from '@/components/chat/avatar-group';
import { QuickStartSkeleton } from '@/components/skeletons';
import { useModelsQuery, useUsageStatsQuery } from '@/hooks/queries';
import type { QuickStartData } from '@/lib/config';
import { getChatModeLabel, getExampleParticipantCount, getPromptsByIndices } from '@/lib/config';
import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';
import { cn } from '@/lib/ui/cn';
import type { Model } from '@/services/api';

type QuickStartSuggestion = {
  title: string;
  prompt: string;
  mode: ChatMode;
  participants: ParticipantConfig[];
};

type ChatQuickStartProps = {
  onSuggestionClick: (
    prompt: string,
    mode: ChatMode,
    participants: ParticipantConfig[],
  ) => void;
  className?: string;
  /** Disable all suggestion buttons (e.g., during submission) */
  disabled?: boolean;
  /** Server-side pre-selected quick start data (from route loader) */
  quickStartData: QuickStartData;
};
export { QuickStartSkeleton };

export function ChatQuickStart({
  onSuggestionClick,
  className,
  disabled = false,
  quickStartData,
}: ChatQuickStartProps) {
  // ✅ SSR: Pre-selected prompts from route loader - no client skeleton flash
  const randomPrompts = useMemo(
    () => getPromptsByIndices(quickStartData.promptIndices),
    [quickStartData.promptIndices],
  );
  const initialProviderOffset = quickStartData.providerOffset;

  const { data: usageData } = useUsageStatsQuery();
  const { data: modelsResponse, isPending: isModelsPending } = useModelsQuery();

  // HYDRATION FIX: Check data presence, not loading state
  // SSR prefetches this data - if it exists, render immediately
  // Only show skeleton if we have NO data AND are actively fetching
  const hasModelsData = modelsResponse?.success;
  const isInitialLoad = !hasModelsData && isModelsPending;

  const userTier: SubscriptionTier = usageData?.success && usageData.data?.plan?.type === PlanTypes.PAID
    ? SubscriptionTiers.PRO
    : SubscriptionTiers.FREE;

  const allModels: Model[] = useMemo(() => {
    if (!modelsResponse?.success)
      return [];
    return modelsResponse.data.items;
  }, [modelsResponse]);

  const accessibleModels = useMemo(() => {
    return allModels.filter(
      model => model.is_accessible_to_user === true,
    );
  }, [allModels]);

  const modelsByProvider = useMemo(() => {
    const grouped = new Map<string, typeof accessibleModels>();
    for (const model of accessibleModels) {
      const provider = model.provider || model.id.split('/')[0] || 'unknown';
      const existing = grouped.get(provider);
      if (existing) {
        existing.push(model);
      } else {
        grouped.set(provider, [model]);
      }
    }
    return grouped;
  }, [accessibleModels]);

  // Stable provider order - sorted alphabetically for deterministic selection
  const sortedProviders = useMemo(() => {
    return Array.from(modelsByProvider.keys()).sort();
  }, [modelsByProvider]);

  // Pre-select one model per provider (deterministic, first model from each)
  const modelPerProvider = useMemo(() => {
    const result = new Map<string, string>();
    for (const provider of sortedProviders) {
      const models = modelsByProvider.get(provider);
      if (models && models.length > 0) {
        // Sort by ID for stable, deterministic selection
        const sorted = [...models].sort((a, b) => a.id.localeCompare(b.id));
        const firstModel = sorted[0];
        if (firstModel) {
          result.set(provider, firstModel.id);
        }
      }
    }
    return result;
  }, [sortedProviders, modelsByProvider]);

  const selectUniqueProviderModels = useCallback(
    (count: number, offset: number = 0): string[] => {
      const selectedModels: string[] = [];

      // Rotate providers based on offset for variety across suggestions
      const rotatedProviders = [
        ...sortedProviders.slice(offset % sortedProviders.length),
        ...sortedProviders.slice(0, offset % sortedProviders.length),
      ];

      for (const provider of rotatedProviders) {
        if (selectedModels.length >= count)
          break;
        const modelId = modelPerProvider.get(provider);
        if (modelId) {
          selectedModels.push(modelId);
        }
      }

      // If we need more models than providers, fill from remaining
      if (selectedModels.length < count) {
        const used = new Set(selectedModels);
        for (const model of accessibleModels) {
          if (selectedModels.length >= count)
            break;
          if (!used.has(model.id)) {
            selectedModels.push(model.id);
            used.add(model.id);
          }
        }
      }

      return selectedModels;
    },
    [sortedProviders, modelPerProvider, accessibleModels],
  );

  const suggestions: QuickStartSuggestion[] = useMemo(() => {
    // Guard against empty models (still loading from server)
    if (accessibleModels.length === 0 || randomPrompts.length === 0) {
      return [];
    }

    const idealCount = getExampleParticipantCount(userTier);

    // Build each suggestion with a DIFFERENT provider offset for maximum diversity
    const buildSuggestion = (
      template: { title: string; prompt: string; mode: ChatMode; roles: string[] },
      suggestionIndex: number,
    ): QuickStartSuggestion => {
      // Combine initial random offset with suggestion index for variety on each page load
      // while still ensuring diversity across the 3 suggestions
      const models = selectUniqueProviderModels(idealCount, initialProviderOffset + suggestionIndex);

      return {
        title: template.title,
        prompt: template.prompt,
        mode: template.mode,
        participants: template.roles
          .slice(0, models.length)
          .map((role, idx) => {
            const modelId = models[idx];
            if (!modelId)
              return null;
            return {
              id: `p${idx + 1}`,
              modelId,
              role,
              priority: idx,
              customRoleId: undefined,
            };
          })
          .filter((p): p is NonNullable<typeof p> => p !== null),
      };
    };

    return randomPrompts.map((template, index) =>
      buildSuggestion(template, index),
    );
  }, [userTier, accessibleModels, selectUniqueProviderModels, randomPrompts, initialProviderOffset]);

  // Show skeleton only if genuinely loading models (no cached data)
  // quickStartData is always available from server loader - no client skeleton needed
  if (isInitialLoad) {
    return <QuickStartSkeleton className={className} />;
  }
  return (
    <div className={cn('w-full relative z-20', className)}>
      <div className="flex flex-col">
        {suggestions.map((suggestion, index) => {
          const isLast = index === suggestions.length - 1;
          return (
            <motion.button
              key={suggestion.title}
              whileHover={disabled
                ? undefined
                : {
                    scale: 1.01,
                    transition: { duration: 0.2, ease: 'easeOut' },
                  }}
              whileTap={disabled ? undefined : { scale: 0.99, transition: { duration: 0.1 } }}
              disabled={disabled}
              onClick={() =>
                onSuggestionClick(
                  suggestion.prompt,
                  suggestion.mode,
                  suggestion.participants,
                )}
              className={cn(
                'group/suggestion w-full text-left px-4 py-3 rounded-2xl focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:outline-none touch-manipulation',
                'transition-all duration-200 ease-out',
                !isLast && 'border-b border-white/[0.02]',
                disabled
                  ? 'cursor-not-allowed opacity-50'
                  : 'cursor-pointer hover:bg-white/[0.07] active:bg-black/20',
              )}
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-3">
                <h3 className="text-[15px] sm:text-[15px] font-medium text-white leading-snug flex-1 min-w-0">
                  {suggestion.title}
                </h3>
                <div className="flex items-center gap-2.5 shrink-0">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-2xl bg-white/[0.04] border border-white/[0.02]">
                    <span className="text-[11px] font-medium whitespace-nowrap text-white/60">
                      {getChatModeLabel(suggestion.mode)}
                    </span>
                  </div>
                  <AvatarGroup
                    participants={suggestion.participants}
                    allModels={allModels}
                    maxVisible={4}
                    size={AvatarSizes.SM}
                    showCount={false}
                    showOverflow
                  />
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
