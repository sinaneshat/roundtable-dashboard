'use client';
import { MessageSquare, Users } from 'lucide-react';
import { motion } from 'motion/react';
import { useCallback, useMemo } from 'react';

import type { ChatMode, SubscriptionTier } from '@/api/core/enums';
import { ChatModes, SubscriptionTiers } from '@/api/core/enums';
import {
  MIN_MODELS_REQUIRED,
} from '@/api/services/product-logic.service';
import { AvatarGroup } from '@/components/chat/avatar-group';
import { useModelsQuery, useUsageStatsQuery } from '@/hooks/queries';
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
export function ChatQuickStart({
  onSuggestionClick,
  className,
}: ChatQuickStartProps) {
  const { data: usageData } = useUsageStatsQuery();
  const userTier: SubscriptionTier
    = usageData?.data?.subscription?.tier ?? 'free';
  const { data: modelsResponse } = useModelsQuery();

  const allModels = useMemo(() => {
    const models = modelsResponse?.success ? modelsResponse.data.items : [];
    return models;
  }, [modelsResponse]);

  const accessibleModels = useMemo(() => {
    const accessible = allModels.filter(
      model => model.is_accessible_to_user === true,
    );
    return accessible;
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
    // Only show suggestions if we have valid models available
    const availableModelIds = accessibleModels
      .map(m => m.id)
      .filter(id => id && id.length > 0);

    // No suggestions if no valid models
    if (availableModelIds.length === 0) {
      return [];
    }

    // Helper to get unique models, ensuring we always return models even if not from unique providers
    const getModelsForTier = (idealCount: number): string[] => {
      // Try to get unique provider models first
      const uniqueProviderModels = selectUniqueProviderModels(idealCount);

      // If we have enough, return them
      if (
        uniqueProviderModels.length
        >= Math.min(idealCount, availableModelIds.length)
      ) {
        return uniqueProviderModels;
      }

      // Otherwise, fill with any available models ensuring uniqueness
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

    // All tiers get at least MIN_MODELS_REQUIRED (3) models for diverse discussions
    const freeModels = getModelsForTier(MIN_MODELS_REQUIRED);
    const starterModels = getModelsForTier(MIN_MODELS_REQUIRED);
    const proModels = getModelsForTier(4);
    const powerModels = getModelsForTier(6);

    const freeTierSuggestions: QuickStartSuggestion[] = (() => {
      const models = freeModels;
      // Always return suggestions, adjust participants based on available models
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
    const starterTierSuggestions: QuickStartSuggestion[] = (() => {
      const models = starterModels;
      // Always return suggestions, adjust participants based on available models
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
          title:
            'Should we colonize Mars if it means abandoning Earth\'s problems?',
          prompt:
            'Is Mars colonization humanity\'s backup plan or escapism? Should we fix Earth first, or hedge our bets across multiple planets?',
          mode: ChatModes.DEBATING,
          participants: buildParticipants([
            'Space Futurist',
            'Climate Scientist',
            'Resource Economist',
          ]),
        },
        {
          title: 'Can we justify eating meat if lab-grown alternatives exist?',
          prompt:
            'With cultured meat becoming viable, is traditional animal agriculture morally defensible? What about cultural traditions and livelihoods?',
          mode: ChatModes.ANALYZING,
          participants: buildParticipants([
            'Animal Ethicist',
            'Agronomist',
            'Cultural Anthropologist',
          ]),
        },
        {
          title:
            'Is nuclear energy our climate salvation or a ticking time bomb?',
          prompt:
            'Nuclear power could solve climate change but carries catastrophic risks. Can we trust ourselves with this technology long-term?',
          mode: ChatModes.DEBATING,
          participants: buildParticipants([
            'Energy Policy Expert',
            'Nuclear Physicist',
            'Environmental Activist',
          ]),
        },
      ];
    })();
    const proTierSuggestions: QuickStartSuggestion[] = (() => {
      const models = proModels;
      // Always return suggestions, adjust participants based on available models
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
    const powerTierSuggestions: QuickStartSuggestion[] = (() => {
      const models = powerModels;
      // Always return suggestions, adjust participants based on available models
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
          title:
            'Should we terraform planets or preserve them as pristine laboratories?',
          prompt:
            'Terraforming Mars could create a second home for humanity, but would we be destroying irreplaceable alien ecosystems before we even discover them?',
          mode: ChatModes.DEBATING,
          participants: buildParticipants([
            'Planetary Scientist',
            'Exobiologist',
            'Space Ethicist',
            'Space Policy Expert',
            'Astrogeologist',
            'Astrobiologist',
          ]),
        },
        {
          title: 'Is objective morality possible without a higher power?',
          prompt:
            'Can moral truths exist in a purely materialist universe without divine authority? Or are ethics just evolutionary programming and social contracts?',
          mode: ChatModes.ANALYZING,
          participants: buildParticipants([
            'Moral Philosopher',
            'Evolutionary Psychologist',
            'Theologian',
            'Neuroscientist',
            'Cognitive Scientist',
            'Ethics Scholar',
          ]),
        },
        {
          title:
            'Should we create conscious AI even if we can\'t guarantee their wellbeing?',
          prompt:
            'If we develop sentient AI, do we have moral obligations to them? Could creating digital consciousness be the greatest crime or the greatest gift?',
          mode: ChatModes.DEBATING,
          participants: buildParticipants([
            'AI Consciousness Researcher',
            'Digital Rights Advocate',
            'Bioethicist',
            'Philosophy of Mind Expert',
            'Computational Consciousness Expert',
            'AI Ethics Researcher',
          ]),
        },
      ];
    })();
    let tierSuggestions: QuickStartSuggestion[];
    if (userTier === SubscriptionTiers.FREE) {
      tierSuggestions = freeTierSuggestions;
    } else if (userTier === SubscriptionTiers.STARTER) {
      tierSuggestions = starterTierSuggestions;
    } else if (userTier === SubscriptionTiers.PRO) {
      tierSuggestions = proTierSuggestions;
    } else {
      tierSuggestions = powerTierSuggestions;
    }

    return tierSuggestions;
  }, [userTier, accessibleModels, selectUniqueProviderModels]);
  const getModeConfig = (mode: ChatMode) => {
    switch (mode) {
      case ChatModes.DEBATING:
        return {
          icon: Users,
          label: 'Debating',
          color: 'text-white/80',
          bgColor: 'bg-white/10',
          borderColor: 'border-white/20',
        };
      case ChatModes.ANALYZING:
        return {
          icon: MessageSquare,
          label: 'Analyzing',
          color: 'text-white/80',
          bgColor: 'bg-white/10',
          borderColor: 'border-white/20',
        };
      default:
        return {
          icon: MessageSquare,
          label: 'Chatting',
          color: 'text-white/80',
          bgColor: 'bg-white/10',
          borderColor: 'border-white/20',
        };
    }
  };
  return (
    <div className={cn('w-full relative z-20', className)}>
      <div className="flex flex-col">
        {suggestions.map((suggestion, index) => {
          const modeConfig = getModeConfig(suggestion.mode);
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
                // Glass effect with backdrop blur on hover
                'hover:bg-white/10 hover:backdrop-blur-md',
                'active:bg-white/[0.15]',
                'transition-all duration-200 ease-out',
                !isLast && 'border-b border-white/[0.06]',
              )}
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-3">
                {/* Left: Question */}
                <h3 className="text-sm sm:text-[15px] font-normal text-white leading-snug flex-1 min-w-0">
                  {suggestion.title}
                </h3>

                {/* Right: Mode and avatars */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-2xl bg-white/[0.04] border border-white/[0.06]">
                    <span
                      className={cn(
                        'text-[11px] font-medium whitespace-nowrap',
                        modeConfig.color,
                      )}
                    >
                      {modeConfig.label}
                    </span>
                  </div>

                  {/* Overlapping Avatars */}
                  <AvatarGroup
                    participants={suggestion.participants}
                    allModels={allModels}
                    maxVisible={4}
                    size="sm"
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
