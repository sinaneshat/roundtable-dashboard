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
  disabled?: boolean;
  quickStartData: QuickStartData;
};

export function ChatQuickStart({
  className,
  disabled = false,
  onSuggestionClick,
  quickStartData,
}: ChatQuickStartProps) {
  const randomPrompts = useMemo(
    () => getPromptsByIndices(quickStartData.promptIndices),
    [quickStartData.promptIndices],
  );
  const initialProviderOffset = quickStartData.providerOffset;

  const { data: usageData } = useUsageStatsQuery();
  const { data: modelsResponse, isPending: isModelsPending } = useModelsQuery();

  const hasModelsData = modelsResponse?.success;
  const isInitialLoad = !hasModelsData && isModelsPending;

  const userTier: SubscriptionTier = usageData?.success && usageData.data?.plan?.type === PlanTypes.PAID
    ? SubscriptionTiers.PRO
    : SubscriptionTiers.FREE;

  const allModels: Model[] = useMemo(() => {
    if (!modelsResponse?.success) {
      return [];
    }
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

  const sortedProviders = useMemo(() => {
    return Array.from(modelsByProvider.keys()).sort();
  }, [modelsByProvider]);

  const modelPerProvider = useMemo(() => {
    const result = new Map<string, string>();
    for (const provider of sortedProviders) {
      const models = modelsByProvider.get(provider);
      if (models && models.length > 0) {
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
    (count: number, offset = 0): string[] => {
      const selectedModels: string[] = [];

      const rotatedProviders = [
        ...sortedProviders.slice(offset % sortedProviders.length),
        ...sortedProviders.slice(0, offset % sortedProviders.length),
      ];

      for (const provider of rotatedProviders) {
        if (selectedModels.length >= count) {
          break;
        }
        const modelId = modelPerProvider.get(provider);
        if (modelId) {
          selectedModels.push(modelId);
        }
      }

      if (selectedModels.length < count) {
        const used = new Set(selectedModels);
        for (const model of accessibleModels) {
          if (selectedModels.length >= count) {
            break;
          }
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
    if (accessibleModels.length === 0 || randomPrompts.length === 0) {
      return [];
    }

    const idealCount = getExampleParticipantCount(userTier);

    const buildSuggestion = (
      template: { title: string; prompt: string; mode: ChatMode; roles: string[] },
      suggestionIndex: number,
    ): QuickStartSuggestion => {
      const models = selectUniqueProviderModels(idealCount, initialProviderOffset + suggestionIndex);

      return {
        mode: template.mode,
        participants: template.roles
          .slice(0, models.length)
          .map((role, idx) => {
            const modelId = models[idx];
            if (!modelId) {
              return null;
            }
            return {
              customRoleId: undefined,
              id: `p${idx + 1}`,
              modelId,
              priority: idx,
              role,
            };
          })
          .filter((p): p is NonNullable<typeof p> => p !== null),
        prompt: template.prompt,
        title: template.title,
      };
    };

    return randomPrompts.map((template, index) =>
      buildSuggestion(template, index),
    );
  }, [userTier, accessibleModels, selectUniqueProviderModels, randomPrompts, initialProviderOffset]);

  if (isInitialLoad) {
    return <QuickStartSkeleton className={className} />;
  }

  return (
    <div className={cn('w-full max-w-lg md:max-w-none mx-auto md:mx-0 relative z-20', className)}>
      <p className="text-xs text-white/30 mb-2 text-center md:hidden">Try asking...</p>
      <div className="flex flex-col gap-1 md:gap-0">
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
                'group/suggestion w-full text-left px-3 md:px-4 py-3 rounded-xl md:rounded-2xl focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:outline-none touch-manipulation',
                'transition-all duration-200 ease-out',
                !isLast && 'border-b border-white/[0.06] md:border-white/[0.02]',
                disabled
                  ? 'cursor-not-allowed opacity-50'
                  : 'cursor-pointer hover:bg-white/[0.04] md:hover:bg-white/[0.07] active:bg-black/20',
              )}
            >
              <div className="flex flex-row items-center justify-between gap-3">
                <span className="text-[13px] md:text-[15px] font-normal md:font-medium text-white/50 md:text-white leading-snug flex-1 min-w-0">
                  {suggestion.title}
                </span>
                <div className="flex items-center gap-2.5 opacity-50 md:opacity-100 shrink-0">
                  <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-2xl bg-white/[0.04] border border-white/[0.02]">
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
