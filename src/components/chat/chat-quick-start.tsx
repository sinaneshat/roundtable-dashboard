'use client';

import { motion } from 'motion/react';
import { useCallback, useMemo } from 'react';

import type { SubscriptionTier } from '@/api/services/product-logic.service';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { useModelsQuery } from '@/hooks/queries/models';
import { useUsageStatsQuery } from '@/hooks/queries/usage';
import { getProviderIcon } from '@/lib/ai/provider-icons';
import type { ChatModeId } from '@/lib/config/chat-modes';
import type { ParticipantConfig } from '@/lib/schemas/chat-forms';
import { cn } from '@/lib/ui/cn';

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
 */
export function ChatQuickStart({ onSuggestionClick, className }: ChatQuickStartProps) {
  // Get user's subscription tier
  const { data: usageData } = useUsageStatsQuery();
  const userTier = (usageData?.success ? usageData.data.subscription.tier : 'free') as SubscriptionTier;

  // ✅ DYNAMIC: Fetch all models from OpenRouter API with tier access info
  const { data: modelsResponse, isLoading: modelsLoading } = useModelsQuery();
  const allModels = modelsResponse?.success ? modelsResponse.data.models : [];

  // ✅ BACKEND-COMPUTED ACCESS: Use backend's is_accessible_to_user flag
  const accessibleModels = useMemo(() => {
    return allModels.filter(model => model.is_accessible_to_user ?? true);
  }, [allModels]);

  // ✅ SELECT MODELS: Simply take first N accessible models (backend already filtered by tier)
  const selectQuickStartModels = useCallback(
    (count: number = 4): string[] => {
      return accessibleModels.slice(0, count).map(m => m.id);
    },
    [accessibleModels],
  );

  // Tier-based gray area questions - always returns exactly 3 suggestions
  // Designed to be morally ambiguous, thought-provoking, and accessible to each tier
  // ✅ FULLY DYNAMIC: Models selected from OpenRouter API based on pricing tiers
  const suggestions: QuickStartSuggestion[] = useMemo(() => {
    // Return empty array while models are loading
    if (modelsLoading || accessibleModels.length === 0) {
      return [];
    }

    // ✅ BACKEND FILTERING: Backend already filtered models by user's tier
    // Just select first N models for each suggestion tier
    const freeModels = selectQuickStartModels(2);
    const starterModels = selectQuickStartModels(3);
    const proModels = selectQuickStartModels(4);
    const powerModels = selectQuickStartModels(6);

    // Destructure models for use in suggestions
    const [starterModel1, starterModel2, starterModel3] = starterModels;
    const [proModel1, proModel2, proModel3, proModel4] = proModels;
    const [powerModel1, powerModel2, powerModel3, powerModel4, powerModel5, powerModel6] = powerModels;

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
              { id: 'p1', modelId: freeModels[1] || '', role: 'Sociologist', order: 0, customRoleId: undefined },
              { id: 'p2', modelId: freeModels[0] || '', role: 'Economist', order: 1, customRoleId: undefined },
            ],
          },
        ]
      : [];

    // Starter tier models are now selected using the centralized service

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
              { id: 'p1', modelId: starterModel2 || '', role: 'Animal Ethicist', order: 0, customRoleId: undefined },
              { id: 'p2', modelId: starterModel1 || '', role: 'Agronomist', order: 1, customRoleId: undefined },
              { id: 'p3', modelId: starterModel3 || '', role: 'Cultural Anthropologist', order: 2, customRoleId: undefined },
            ],
          },
          {
            title: 'Is nuclear energy our climate salvation or a ticking time bomb?',
            prompt: 'Nuclear power could solve climate change but carries catastrophic risks. Can we trust ourselves with this technology long-term?',
            mode: 'debating',
            participants: [
              { id: 'p1', modelId: starterModel1 || '', role: 'Energy Policy Expert', order: 0, customRoleId: undefined },
              { id: 'p2', modelId: starterModel2 || '', role: 'Nuclear Physicist', order: 1, customRoleId: undefined },
              { id: 'p3', modelId: starterModel3 || '', role: 'Environmental Activist', order: 2, customRoleId: undefined },
            ],
          },
        ]
      : [];

    // Pro tier models are now selected using the centralized service

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
              ...(proModels.length > 3 ? [{ id: 'p4', modelId: proModels[3] || '', role: 'Medical Ethicist', order: 3, customRoleId: undefined }] : []),
            ],
          },
          {
            title: 'Can artificial general intelligence be aligned with human values?',
            prompt: 'If we create AGI smarter than us, can we ensure it shares our values? Or is catastrophic misalignment inevitable?',
            mode: 'analyzing',
            participants: [
              { id: 'p1', modelId: proModel1 || '', role: 'AI Safety Researcher', order: 0, customRoleId: undefined },
              { id: 'p2', modelId: proModel2 || '', role: 'Machine Learning Engineer', order: 1, customRoleId: undefined },
              { id: 'p3', modelId: proModel3 || '', role: 'Ethics Philosopher', order: 2, customRoleId: undefined },
              ...(proModel4 ? [{ id: 'p4', modelId: proModel4 || '', role: 'Systems Architect', order: 3, customRoleId: undefined }] : []),
            ],
          },
          {
            title: 'Is infinite economic growth possible on a finite planet?',
            prompt: 'Capitalism demands perpetual growth, but Earth has limits. Must we choose between prosperity and survival, or can we transcend this paradox?',
            mode: 'debating',
            participants: [
              { id: 'p1', modelId: proModel2 || '', role: 'Ecological Economist', order: 0, customRoleId: undefined },
              { id: 'p2', modelId: proModel1 || '', role: 'Free Market Theorist', order: 1, customRoleId: undefined },
              { id: 'p3', modelId: proModel3 || '', role: 'Systems Thinker', order: 2, customRoleId: undefined },
            ],
          },
        ]
      : [];

    // Power tier models are now selected using the centralized service

    const powerTierSuggestions: QuickStartSuggestion[] = powerModels.length >= 3
      ? [
          {
            title: 'Should we terraform planets or preserve them as pristine laboratories?',
            prompt: 'Terraforming Mars could create a second home for humanity, but would we be destroying irreplaceable alien ecosystems before we even discover them?',
            mode: 'debating',
            participants: [
              { id: 'p1', modelId: powerModel1 || '', role: 'Planetary Scientist', order: 0, customRoleId: undefined },
              { id: 'p2', modelId: powerModel2 || '', role: 'Exobiologist', order: 1, customRoleId: undefined },
              { id: 'p3', modelId: powerModel3 || '', role: 'Space Ethicist', order: 2, customRoleId: undefined },
              ...(powerModel4 ? [{ id: 'p4', modelId: powerModel4 || '', role: 'Space Policy Expert', order: 3, customRoleId: undefined }] : []),
              ...(powerModel5 ? [{ id: 'p5', modelId: powerModel5 || '', role: 'Astrogeologist', order: 4, customRoleId: undefined }] : []),
              ...(powerModel6 ? [{ id: 'p6', modelId: powerModel6 || '', role: 'Astrobiologist', order: 5, customRoleId: undefined }] : []),
            ],
          },
          {
            title: 'Is objective morality possible without a higher power?',
            prompt: 'Can moral truths exist in a purely materialist universe without divine authority? Or are ethics just evolutionary programming and social contracts?',
            mode: 'analyzing',
            participants: [
              { id: 'p1', modelId: powerModel1 || '', role: 'Moral Philosopher', order: 0, customRoleId: undefined },
              { id: 'p2', modelId: powerModel2 || '', role: 'Evolutionary Psychologist', order: 1, customRoleId: undefined },
              { id: 'p3', modelId: powerModel3 || '', role: 'Theologian', order: 2, customRoleId: undefined },
              ...(powerModel4 ? [{ id: 'p4', modelId: powerModel4 || '', role: 'Neuroscientist', order: 3, customRoleId: undefined }] : []),
              ...(powerModel5 ? [{ id: 'p5', modelId: powerModel5 || '', role: 'Cognitive Scientist', order: 4, customRoleId: undefined }] : []),
              ...(powerModel6 ? [{ id: 'p6', modelId: powerModel6 || '', role: 'Ethics Scholar', order: 5, customRoleId: undefined }] : []),
            ],
          },
          {
            title: 'Should we create conscious AI even if we can\'t guarantee their wellbeing?',
            prompt: 'If we develop sentient AI, do we have moral obligations to them? Could creating digital consciousness be the greatest crime or the greatest gift?',
            mode: 'debating',
            participants: [
              { id: 'p1', modelId: powerModel1 || '', role: 'AI Consciousness Researcher', order: 0, customRoleId: undefined },
              { id: 'p2', modelId: powerModel2 || '', role: 'Digital Rights Advocate', order: 1, customRoleId: undefined },
              { id: 'p3', modelId: powerModel4 || powerModel1 || '', role: 'Bioethicist', order: 2, customRoleId: undefined },
              ...(powerModel3 ? [{ id: 'p4', modelId: powerModel3 || '', role: 'Philosophy of Mind Expert', order: 3, customRoleId: undefined }] : []),
              ...(powerModel5 ? [{ id: 'p5', modelId: powerModel5 || '', role: 'Computational Consciousness Expert', order: 4, customRoleId: undefined }] : []),
              ...(powerModel6 ? [{ id: 'p6', modelId: powerModel6 || '', role: 'AI Ethics Researcher', order: 5, customRoleId: undefined }] : []),
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

    // Suggestions are already tier-appropriate, no filtering needed
    return tierSuggestions;
  }, [userTier, modelsLoading, accessibleModels, selectQuickStartModels]);

  return (
    <div className={cn('w-full relative z-20', className)}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 md:gap-4">
        {suggestions.map((suggestion) => {
          return (
            <motion.div
              key={suggestion.title}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.3,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="flex min-w-0"
            >
              <Card
                variant="glass"
                className="cursor-pointer p-3 sm:p-4 hover:shadow-2xl transition-all group flex-1 flex flex-col min-w-0 gap-2 sm:gap-3 border-0"
                onClick={() => onSuggestionClick(suggestion.prompt, suggestion.mode, suggestion.participants)}
              >
                {/* Title - Show full question without truncation */}
                <h3 className="font-semibold text-xs sm:text-sm text-white/90 drop-shadow-md leading-relaxed">
                  {suggestion.title}
                </h3>

                {/* Model Participants - Compact inline display with icons */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {suggestion.participants
                    .sort((a, b) => a.order - b.order)
                    .map((participant) => {
                      // ✅ SINGLE SOURCE: Find model from backend API data
                      const model = allModels.find(m => m.id === participant.modelId);
                      if (!model)
                        return null;

                      // ✅ SINGLE SOURCE: Use backend-computed accessibility
                      const isAccessible = model.is_accessible_to_user ?? true;
                      const provider = model.id.split('/')[0] || 'unknown';

                      return (
                        <div
                          key={participant.id}
                          className={cn(
                            'flex items-center gap-1 shrink-0',
                            !isAccessible && 'opacity-50',
                          )}
                        >
                          <Avatar className="size-4 ring-1 ring-white/10">
                            <AvatarImage src={getProviderIcon(provider)} alt={model.name} />
                            <AvatarFallback className="text-[8px]">
                              {model.name.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-[10px] sm:text-xs font-medium text-white/80">
                            {model.name}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
