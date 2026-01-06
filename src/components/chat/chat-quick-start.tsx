'use client';
import { motion } from 'motion/react';
import { useCallback, useMemo } from 'react';

import type { ChatMode, SubscriptionTier } from '@/api/core/enums';
import { AvatarSizes, ChatModes, PlanTypes, SubscriptionTiers } from '@/api/core/enums';
import type { EnhancedModelResponse } from '@/api/routes/models/schema';
import { MIN_MODELS_REQUIRED } from '@/api/services/product-logic.service';
import { AvatarGroup } from '@/components/chat/avatar-group';
import { Skeleton } from '@/components/ui/skeleton';
import { useModelsQuery, useUsageStatsQuery } from '@/hooks/queries';
import { getChatModeLabel } from '@/lib/config/chat-modes';
import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';
import { cn } from '@/lib/ui/cn';

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
};
function QuickStartSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('w-full relative z-20', className)}>
      <div className="flex flex-col">
        {[0, 1, 2].map(index => (
          <div
            key={index}
            className={cn(
              'w-full px-4 py-3',
              index !== 2 && 'border-b border-white/[0.06]',
            )}
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-3">
              <Skeleton className="h-5 w-3/4 bg-white/10" />
              <div className="flex items-center gap-2 shrink-0">
                <Skeleton className="h-6 w-16 rounded-2xl bg-white/10" />
                <div className="flex -space-x-2">
                  {[0, 1, 2].map(i => (
                    <Skeleton key={i} className="size-6 rounded-full bg-white/10" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChatQuickStart({
  onSuggestionClick,
  className,
}: ChatQuickStartProps) {
  const { data: usageData, isLoading: isUsageLoading } = useUsageStatsQuery();
  const { data: modelsResponse, isLoading: isModelsLoading } = useModelsQuery();

  const isLoading = isModelsLoading || isUsageLoading;

  const userTier: SubscriptionTier = usageData?.data?.plan?.type === PlanTypes.PAID
    ? SubscriptionTiers.PRO
    : SubscriptionTiers.FREE;

  const allModels: EnhancedModelResponse[] = useMemo(() => {
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
      if (!grouped.has(provider)) {
        grouped.set(provider, []);
      }
      grouped.get(provider)!.push(model);
    }
    return grouped;
  }, [accessibleModels]);

  const selectUniqueProviderModels = useCallback(
    (count: number): string[] => {
      const selectedModels: string[] = [];
      const usedProviders = new Set<string>();
      const providers = Array.from(modelsByProvider.entries())
        .sort((a, b) => b[1].length - a[1].length)
        .map(([provider]) => provider);
      for (const provider of providers) {
        if (selectedModels.length >= count)
          break;
        if (usedProviders.has(provider))
          continue;
        const providerModels = modelsByProvider.get(provider);
        if (!providerModels || providerModels.length === 0)
          continue;
        const model = providerModels[0];
        if (model) {
          selectedModels.push(model.id);
          usedProviders.add(provider);
        }
      }
      return selectedModels;
    },
    [modelsByProvider],
  );

  const suggestions: QuickStartSuggestion[] = useMemo(() => {
    const availableModelIds = accessibleModels
      .map(m => m.id)
      .filter(id => id && id.length > 0);

    if (availableModelIds.length === 0) {
      return [];
    }

    const getModelsForTier = (idealCount: number): string[] => {
      const uniqueProviderModels = selectUniqueProviderModels(idealCount);

      if (
        uniqueProviderModels.length
        >= Math.min(idealCount, availableModelIds.length)
      ) {
        return uniqueProviderModels;
      }

      const models = [...uniqueProviderModels];
      const used = new Set(models);

      for (const modelId of availableModelIds) {
        if (models.length >= idealCount)
          break;
        if (!used.has(modelId)) {
          models.push(modelId);
          used.add(modelId);
        }
      }

      return models;
    };

    const freeModels = getModelsForTier(MIN_MODELS_REQUIRED);
    const proModels = getModelsForTier(4);

    const freeTierSuggestions: QuickStartSuggestion[] = (() => {
      const models = freeModels;
      if (models.length === 0) {
        return [];
      }

      const buildParticipants = (roles: string[]) => {
        const participants = roles
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
          .filter((p): p is NonNullable<typeof p> => p !== null);
        return participants;
      };

      const suggestions: QuickStartSuggestion[] = [
        {
          title: 'Is privacy a right or a privilege in the digital age?',
          prompt:
            'Should individuals sacrifice privacy for security, or is surveillance capitalism the new totalitarianism? Where do we draw the line?',
          mode: ChatModes.DEBATING,
          participants: buildParticipants([
            'Privacy Advocate',
            'Security Realist',
            'Legal Scholar',
          ]),
        },
        {
          title:
            'Should we resurrect extinct species using genetic engineering?',
          prompt:
            'De-extinction: ecological restoration or playing god? Discuss bringing back woolly mammoths, passenger pigeons, and other lost species.',
          mode: ChatModes.ANALYZING,
          participants: buildParticipants([
            'Conservation Biologist',
            'Bioethicist',
            'Ecologist',
          ]),
        },
        {
          title: 'Is meritocracy a myth that justifies inequality?',
          prompt:
            'Does hard work truly determine success, or is meritocracy just a comforting lie that masks systemic advantages and inherited privilege?',
          mode: ChatModes.DEBATING,
          participants: buildParticipants([
            'Sociologist',
            'Economist',
            'Historian',
          ]),
        },
      ];

      return suggestions;
    })();

    const proTierSuggestions: QuickStartSuggestion[] = (() => {
      const models = proModels;
      if (models.length === 0)
        return [];

      const buildParticipants = (roles: string[]) => {
        return roles
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
          .filter((p): p is NonNullable<typeof p> => p !== null);
      };

      return [
        {
          title: 'Should we edit human embryos to eliminate genetic diseases?',
          prompt:
            'CRISPR germline editing: eliminating suffering or creating designer babies? Where is the line between treatment and enhancement?',
          mode: ChatModes.DEBATING,
          participants: buildParticipants([
            'Bioethicist',
            'Geneticist',
            'Disability Rights Advocate',
            'Medical Ethicist',
          ]),
        },
        {
          title:
            'Can artificial general intelligence be aligned with human values?',
          prompt:
            'If we create AGI smarter than us, can we ensure it shares our values? Or is catastrophic misalignment inevitable?',
          mode: ChatModes.ANALYZING,
          participants: buildParticipants([
            'AI Safety Researcher',
            'Machine Learning Engineer',
            'Ethics Philosopher',
            'Systems Architect',
          ]),
        },
        {
          title: 'Is infinite economic growth possible on a finite planet?',
          prompt:
            'Capitalism demands perpetual growth, but Earth has limits. Must we choose between prosperity and survival, or can we transcend this paradox?',
          mode: ChatModes.DEBATING,
          participants: buildParticipants([
            'Ecological Economist',
            'Free Market Theorist',
            'Systems Thinker',
            'Resource Analyst',
          ]),
        },
      ];
    })();

    const tierSuggestions: QuickStartSuggestion[] = userTier === SubscriptionTiers.FREE
      ? freeTierSuggestions
      : proTierSuggestions;

    return tierSuggestions;
  }, [userTier, accessibleModels, selectUniqueProviderModels]);

  if (isLoading) {
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
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{
                scale: 1.01,
                transition: { duration: 0.2, ease: 'easeOut' },
              }}
              whileTap={{ scale: 0.99, transition: { duration: 0.1 } }}
              transition={{
                duration: 0.4,
                delay: index * 0.1,
                ease: [0.25, 0.46, 0.45, 0.94],
              }}
              onClick={() =>
                onSuggestionClick(
                  suggestion.prompt,
                  suggestion.mode,
                  suggestion.participants,
                )}
              className={cn(
                'group/suggestion w-full text-left px-4 py-3 rounded-2xl cursor-pointer focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:outline-none touch-manipulation',
                'hover:bg-white/[0.07]',
                'active:bg-black/20',
                'transition-all duration-200 ease-out',
                !isLast && 'border-b border-white/[0.02]',
              )}
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-3">
                <h3 className="text-sm sm:text-[15px] font-normal text-white leading-snug flex-1 min-w-0">
                  {suggestion.title}
                </h3>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-2xl bg-white/[0.04] border border-white/[0.02]">
                    <span className="text-[11px] font-medium whitespace-nowrap text-white/80">
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
