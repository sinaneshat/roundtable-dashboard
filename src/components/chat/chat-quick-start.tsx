'use client';

import { motion } from 'motion/react';
import { useCallback, useMemo } from 'react';

import type { SubscriptionTier } from '@/api/services/product-logic.service';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useModelsQuery } from '@/hooks/queries/models';
import { useUsageStatsQuery } from '@/hooks/queries/usage';
import type { ChatModeId } from '@/lib/config/chat-modes';
import type { ParticipantConfig } from '@/lib/types/participant-config';
import { cn } from '@/lib/ui/cn';
import { getProviderIcon } from '@/lib/utils/ai-display';

// ============================================================================
// Types
// ============================================================================

type QuickStartSuggestion = {
  title: string;
  prompt: string;
  mode: ChatModeId;
  participants: ParticipantConfig[];
};

type ChatQuickStartProps = {
  onSuggestionClick: (
    prompt: string,
    mode: ChatModeId,
    participants: ParticipantConfig[],
  ) => void;
  className?: string;
};

// ============================================================================
// Component
// ============================================================================

/**
 * ChatQuickStart Component
 *
 * Compact, mobile-friendly quick start suggestions
 * Filters suggestions based on user's subscription tier
 * ✅ ENSURES UNIQUE PROVIDERS: Each card uses models from different providers
 */
export function ChatQuickStart({ onSuggestionClick, className }: ChatQuickStartProps) {
  // Get user's subscription tier
  const { data: usageData } = useUsageStatsQuery();
  const userTier = (usageData?.success ? usageData.data.subscription.tier : 'free') as SubscriptionTier;

  // ✅ DYNAMIC: Fetch all models from OpenRouter API with tier access info
  const { data: modelsResponse, isLoading: modelsLoading } = useModelsQuery();
  const allModels = useMemo(
    () => (modelsResponse?.success ? modelsResponse.data.items : []),
    [modelsResponse],
  );

  // ✅ BACKEND-COMPUTED ACCESS: Use backend's is_accessible_to_user flag
  const accessibleModels = useMemo(() => {
    return allModels.filter(model => model.is_accessible_to_user ?? true);
  }, [allModels]);

  // ✅ GROUP MODELS BY PROVIDER: Essential for ensuring unique providers per card
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

  // ✅ SELECT MODELS WITH UNIQUE PROVIDERS: Each model must be from a different provider
  const selectUniqueProviderModels = useCallback(
    (count: number): string[] => {
      const selectedModels: string[] = [];
      const usedProviders = new Set<string>();

      // Get providers sorted by number of models (prefer providers with more options)
      const providers = Array.from(modelsByProvider.entries())
        .sort((a, b) => b[1].length - a[1].length)
        .map(([provider]) => provider);

      // Select one model from each provider until we have enough
      for (const provider of providers) {
        if (selectedModels.length >= count)
          break;
        if (usedProviders.has(provider))
          continue;

        const providerModels = modelsByProvider.get(provider);
        if (!providerModels || providerModels.length === 0)
          continue;

        // Take the first (usually most popular) model from this provider
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

  // Tier-based gray area questions - always returns exactly 3 suggestions
  // Designed to be morally ambiguous, thought-provoking, and accessible to each tier
  // ✅ FULLY DYNAMIC: Models selected from OpenRouter API with UNIQUE PROVIDERS per card
  const suggestions: QuickStartSuggestion[] = useMemo(() => {
    // Return empty array while models are loading
    if (modelsLoading || accessibleModels.length === 0 || modelsByProvider.size === 0) {
      return [];
    }

    // ✅ UNIQUE PROVIDERS: Each suggestion uses models from different providers
    const freeModels = selectUniqueProviderModels(2);
    const starterModels = selectUniqueProviderModels(3);
    const proModels = selectUniqueProviderModels(4);
    const powerModels = selectUniqueProviderModels(6);

    const freeTierSuggestions: QuickStartSuggestion[] = freeModels.length >= 2
      ? [
          {
            title: 'Is privacy a right or a privilege in the digital age?',
            prompt: 'Should individuals sacrifice privacy for security, or is surveillance capitalism the new totalitarianism? Where do we draw the line?',
            mode: 'debating',
            participants: [
              { id: 'p1', modelId: freeModels[0] || '', role: 'Privacy Advocate', order: 0, customRoleId: undefined },
              { id: 'p2', modelId: freeModels[1] || '', role: 'Security Realist', order: 1, customRoleId: undefined },
            ],
          },
          {
            title: 'Should we resurrect extinct species using genetic engineering?',
            prompt: 'De-extinction: ecological restoration or playing god? Discuss bringing back woolly mammoths, passenger pigeons, and other lost species.',
            mode: 'analyzing',
            participants: [
              { id: 'p1', modelId: freeModels[1] || '', role: 'Conservation Biologist', order: 0, customRoleId: undefined },
              { id: 'p2', modelId: freeModels[0] || '', role: 'Bioethicist', order: 1, customRoleId: undefined },
            ],
          },
          {
            title: 'Is meritocracy a myth that justifies inequality?',
            prompt: 'Does hard work truly determine success, or is meritocracy just a comforting lie that masks systemic advantages and inherited privilege?',
            mode: 'debating',
            participants: [
              { id: 'p1', modelId: freeModels[0] || '', role: 'Sociologist', order: 0, customRoleId: undefined },
              { id: 'p2', modelId: freeModels[1] || '', role: 'Economist', order: 1, customRoleId: undefined },
            ],
          },
        ]
      : [];

    const starterTierSuggestions: QuickStartSuggestion[] = starterModels.length >= 3
      ? [
          {
            title: 'Should we colonize Mars if it means abandoning Earth\'s problems?',
            prompt: 'Is Mars colonization humanity\'s backup plan or escapism? Should we fix Earth first, or hedge our bets across multiple planets?',
            mode: 'debating',
            participants: [
              { id: 'p1', modelId: starterModels[0] || '', role: 'Space Futurist', order: 0, customRoleId: undefined },
              { id: 'p2', modelId: starterModels[1] || '', role: 'Climate Scientist', order: 1, customRoleId: undefined },
              { id: 'p3', modelId: starterModels[2] || '', role: 'Resource Economist', order: 2, customRoleId: undefined },
            ],
          },
          {
            title: 'Can we justify eating meat if lab-grown alternatives exist?',
            prompt: 'With cultured meat becoming viable, is traditional animal agriculture morally defensible? What about cultural traditions and livelihoods?',
            mode: 'analyzing',
            participants: [
              { id: 'p1', modelId: starterModels[1] || '', role: 'Animal Ethicist', order: 0, customRoleId: undefined },
              { id: 'p2', modelId: starterModels[0] || '', role: 'Agronomist', order: 1, customRoleId: undefined },
              { id: 'p3', modelId: starterModels[2] || '', role: 'Cultural Anthropologist', order: 2, customRoleId: undefined },
            ],
          },
          {
            title: 'Is nuclear energy our climate salvation or a ticking time bomb?',
            prompt: 'Nuclear power could solve climate change but carries catastrophic risks. Can we trust ourselves with this technology long-term?',
            mode: 'debating',
            participants: [
              { id: 'p1', modelId: starterModels[0] || '', role: 'Energy Policy Expert', order: 0, customRoleId: undefined },
              { id: 'p2', modelId: starterModels[1] || '', role: 'Nuclear Physicist', order: 1, customRoleId: undefined },
              { id: 'p3', modelId: starterModels[2] || '', role: 'Environmental Activist', order: 2, customRoleId: undefined },
            ],
          },
        ]
      : [];

    const proTierSuggestions: QuickStartSuggestion[] = proModels.length >= 3
      ? [
          {
            title: 'Should we edit human embryos to eliminate genetic diseases?',
            prompt: 'CRISPR germline editing: eliminating suffering or creating designer babies? Where is the line between treatment and enhancement?',
            mode: 'debating',
            participants: [
              { id: 'p1', modelId: proModels[0] || '', role: 'Bioethicist', order: 0, customRoleId: undefined },
              { id: 'p2', modelId: proModels[1] || '', role: 'Geneticist', order: 1, customRoleId: undefined },
              { id: 'p3', modelId: proModels[2] || '', role: 'Disability Rights Advocate', order: 2, customRoleId: undefined },
              ...(proModels[3] ? [{ id: 'p4', modelId: proModels[3] || '', role: 'Medical Ethicist', order: 3, customRoleId: undefined }] : []),
            ],
          },
          {
            title: 'Can artificial general intelligence be aligned with human values?',
            prompt: 'If we create AGI smarter than us, can we ensure it shares our values? Or is catastrophic misalignment inevitable?',
            mode: 'analyzing',
            participants: [
              { id: 'p1', modelId: proModels[1] || '', role: 'AI Safety Researcher', order: 0, customRoleId: undefined },
              { id: 'p2', modelId: proModels[0] || '', role: 'Machine Learning Engineer', order: 1, customRoleId: undefined },
              { id: 'p3', modelId: proModels[2] || '', role: 'Ethics Philosopher', order: 2, customRoleId: undefined },
              ...(proModels[3] ? [{ id: 'p4', modelId: proModels[3] || '', role: 'Systems Architect', order: 3, customRoleId: undefined }] : []),
            ],
          },
          {
            title: 'Is infinite economic growth possible on a finite planet?',
            prompt: 'Capitalism demands perpetual growth, but Earth has limits. Must we choose between prosperity and survival, or can we transcend this paradox?',
            mode: 'debating',
            participants: [
              { id: 'p1', modelId: proModels[2] || '', role: 'Ecological Economist', order: 0, customRoleId: undefined },
              { id: 'p2', modelId: proModels[0] || '', role: 'Free Market Theorist', order: 1, customRoleId: undefined },
              { id: 'p3', modelId: proModels[1] || '', role: 'Systems Thinker', order: 2, customRoleId: undefined },
            ],
          },
        ]
      : [];

    const powerTierSuggestions: QuickStartSuggestion[] = powerModels.length >= 3
      ? [
          {
            title: 'Should we terraform planets or preserve them as pristine laboratories?',
            prompt: 'Terraforming Mars could create a second home for humanity, but would we be destroying irreplaceable alien ecosystems before we even discover them?',
            mode: 'debating',
            participants: [
              { id: 'p1', modelId: powerModels[0] || '', role: 'Planetary Scientist', order: 0, customRoleId: undefined },
              { id: 'p2', modelId: powerModels[1] || '', role: 'Exobiologist', order: 1, customRoleId: undefined },
              { id: 'p3', modelId: powerModels[2] || '', role: 'Space Ethicist', order: 2, customRoleId: undefined },
              ...(powerModels[3] ? [{ id: 'p4', modelId: powerModels[3] || '', role: 'Space Policy Expert', order: 3, customRoleId: undefined }] : []),
              ...(powerModels[4] ? [{ id: 'p5', modelId: powerModels[4] || '', role: 'Astrogeologist', order: 4, customRoleId: undefined }] : []),
              ...(powerModels[5] ? [{ id: 'p6', modelId: powerModels[5] || '', role: 'Astrobiologist', order: 5, customRoleId: undefined }] : []),
            ],
          },
          {
            title: 'Is objective morality possible without a higher power?',
            prompt: 'Can moral truths exist in a purely materialist universe without divine authority? Or are ethics just evolutionary programming and social contracts?',
            mode: 'analyzing',
            participants: [
              { id: 'p1', modelId: powerModels[1] || '', role: 'Moral Philosopher', order: 0, customRoleId: undefined },
              { id: 'p2', modelId: powerModels[0] || '', role: 'Evolutionary Psychologist', order: 1, customRoleId: undefined },
              { id: 'p3', modelId: powerModels[2] || '', role: 'Theologian', order: 2, customRoleId: undefined },
              ...(powerModels[3] ? [{ id: 'p4', modelId: powerModels[3] || '', role: 'Neuroscientist', order: 3, customRoleId: undefined }] : []),
              ...(powerModels[4] ? [{ id: 'p5', modelId: powerModels[4] || '', role: 'Cognitive Scientist', order: 4, customRoleId: undefined }] : []),
              ...(powerModels[5] ? [{ id: 'p6', modelId: powerModels[5] || '', role: 'Ethics Scholar', order: 5, customRoleId: undefined }] : []),
            ],
          },
          {
            title: 'Should we create conscious AI even if we can\'t guarantee their wellbeing?',
            prompt: 'If we develop sentient AI, do we have moral obligations to them? Could creating digital consciousness be the greatest crime or the greatest gift?',
            mode: 'debating',
            participants: [
              { id: 'p1', modelId: powerModels[0] || '', role: 'AI Consciousness Researcher', order: 0, customRoleId: undefined },
              { id: 'p2', modelId: powerModels[1] || '', role: 'Digital Rights Advocate', order: 1, customRoleId: undefined },
              { id: 'p3', modelId: powerModels[2] || '', role: 'Bioethicist', order: 2, customRoleId: undefined },
              ...(powerModels[3] ? [{ id: 'p4', modelId: powerModels[3] || '', role: 'Philosophy of Mind Expert', order: 3, customRoleId: undefined }] : []),
              ...(powerModels[4] ? [{ id: 'p5', modelId: powerModels[4] || '', role: 'Computational Consciousness Expert', order: 4, customRoleId: undefined }] : []),
              ...(powerModels[5] ? [{ id: 'p6', modelId: powerModels[5] || '', role: 'AI Ethics Researcher', order: 5, customRoleId: undefined }] : []),
            ],
          },
        ]
      : [];

    // Select suggestions based on user tier
    let tierSuggestions: QuickStartSuggestion[];

    if (userTier === 'free') {
      tierSuggestions = freeTierSuggestions;
    } else if (userTier === 'starter') {
      tierSuggestions = starterTierSuggestions;
    } else if (userTier === 'pro') {
      tierSuggestions = proTierSuggestions;
    } else {
      // power tier
      tierSuggestions = powerTierSuggestions;
    }

    return tierSuggestions;
  }, [userTier, modelsLoading, accessibleModels, modelsByProvider.size, selectUniqueProviderModels]);

  return (
    <div className={cn('w-full relative z-20', className)}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {suggestions.map((suggestion, index) => {
          return (
            <motion.div
              key={suggestion.title}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.4,
                delay: index * 0.1,
                ease: [0.25, 0.46, 0.45, 0.94],
              }}
              className="flex min-w-0"
            >
              <Card
                variant="glass"
                className="cursor-pointer hover:shadow-2xl transition-shadow duration-300 group w-full focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none"
                onClick={() => onSuggestionClick(suggestion.prompt, suggestion.mode, suggestion.participants)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSuggestionClick(suggestion.prompt, suggestion.mode, suggestion.participants);
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={suggestion.title}
              >
                <CardHeader>
                  <CardTitle className="text-sm md:text-base text-white/90">
                    {suggestion.title}
                  </CardTitle>
                </CardHeader>

                <CardContent>
                  <div className="flex flex-col gap-2">
                    {suggestion.participants
                      .sort((a, b) => a.order - b.order)
                      .map((participant) => {
                        // ✅ SINGLE SOURCE: Find model from backend API data
                        const model = allModels.find(m => m.id === participant.modelId);
                        if (!model)
                          return null;

                        // ✅ SINGLE SOURCE: Use backend-computed accessibility
                        const isAccessible = model.is_accessible_to_user ?? true;
                        const provider = model.provider || model.id.split('/')[0] || 'unknown';

                        return (
                          <div
                            key={participant.id}
                            className={cn(
                              'flex items-center gap-2',
                              !isAccessible && 'opacity-50',
                            )}
                          >
                            <Avatar className="size-4">
                              <AvatarImage src={getProviderIcon(provider)} alt={model.name} />
                              <AvatarFallback className="text-[8px]">
                                {model.name.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-xs text-white/70">
                              {model.name}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
