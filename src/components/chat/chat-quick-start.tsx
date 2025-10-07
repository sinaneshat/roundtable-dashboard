'use client';

import { motion } from 'motion/react';
import { useMemo } from 'react';

import type { ParticipantConfig } from '@/components/chat/chat-config-sheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import type { SubscriptionTier } from '@/db/tables/usage';
import { useUsageStatsQuery } from '@/hooks/queries/usage';
import { AI_MODELS, canAccessModel, getAccessibleModels, getTierDisplayName } from '@/lib/ai/models-config';
import type { ChatModeId } from '@/lib/config/chat-modes';
import { cn } from '@/lib/ui/cn';
import { glassBadge } from '@/lib/ui/glassmorphism';

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

  // Get accessible models for the user
  const accessibleModels = useMemo(() => getAccessibleModels(userTier), [userTier]);
  const accessibleModelIds = useMemo(
    () => new Set<string>(accessibleModels.map(m => m.modelId as string)),
    [accessibleModels],
  );

  // Tier-based gray area questions - always returns exactly 3 suggestions
  // Designed to be morally ambiguous, thought-provoking, and accessible to each tier
  const suggestions: QuickStartSuggestion[] = useMemo(() => {
    // Free tier: 3 models (Claude Haiku, Gemini Flash, DeepSeek)
    const freeTierSuggestions: QuickStartSuggestion[] = [
      {
        title: 'Is privacy a right or a privilege in the digital age?',
        prompt: 'Should individuals sacrifice privacy for security, or is surveillance capitalism the new totalitarianism? Where do we draw the line?',
        mode: 'debating',
        participants: [
          { id: 'p1', modelId: 'anthropic/claude-3-haiku', role: 'Privacy Advocate', order: 0 },
          { id: 'p2', modelId: 'google/gemini-2.5-flash', role: 'Security Realist', order: 1 },
          { id: 'p3', modelId: 'deepseek/deepseek-chat', role: 'Tech Ethicist', order: 2 },
        ],
      },
      {
        title: 'Should we resurrect extinct species using genetic engineering?',
        prompt: 'De-extinction: ecological restoration or playing god? Discuss bringing back woolly mammoths, passenger pigeons, and other lost species.',
        mode: 'analyzing',
        participants: [
          { id: 'p1', modelId: 'deepseek/deepseek-chat', role: 'Conservation Biologist', order: 0 },
          { id: 'p2', modelId: 'google/gemini-2.5-flash', role: 'Ecologist', order: 1 },
          { id: 'p3', modelId: 'anthropic/claude-3-haiku', role: 'Bioethicist', order: 2 },
        ],
      },
      {
        title: 'Is meritocracy a myth that justifies inequality?',
        prompt: 'Does hard work truly determine success, or is meritocracy just a comforting lie that masks systemic advantages and inherited privilege?',
        mode: 'debating',
        participants: [
          { id: 'p1', modelId: 'google/gemini-2.5-flash', role: 'Sociologist', order: 0 },
          { id: 'p2', modelId: 'anthropic/claude-3-haiku', role: 'Economist', order: 1 },
          { id: 'p3', modelId: 'deepseek/deepseek-chat', role: 'Social Justice Advocate', order: 2 },
        ],
      },
    ];

    // Starter tier: 5 models (+ Gemini Pro, Perplexity)
    const starterTierSuggestions: QuickStartSuggestion[] = [
      {
        title: 'Should we colonize Mars if it means abandoning Earth\'s problems?',
        prompt: 'Is Mars colonization humanity\'s backup plan or escapism? Should we fix Earth first, or hedge our bets across multiple planets?',
        mode: 'debating',
        participants: [
          { id: 'p1', modelId: 'google/gemini-2.5-pro', role: 'Space Futurist', order: 0 },
          { id: 'p2', modelId: 'perplexity/llama-3.1-sonar-large-128k-online', role: 'Climate Scientist', order: 1 },
          { id: 'p3', modelId: 'anthropic/claude-3-haiku', role: 'Resource Economist', order: 2 },
        ],
      },
      {
        title: 'Can we justify eating meat if lab-grown alternatives exist?',
        prompt: 'With cultured meat becoming viable, is traditional animal agriculture morally defensible? What about cultural traditions and livelihoods?',
        mode: 'analyzing',
        participants: [
          { id: 'p1', modelId: 'google/gemini-2.5-flash', role: 'Animal Ethicist', order: 0 },
          { id: 'p2', modelId: 'google/gemini-2.5-pro', role: 'Agronomist', order: 1 },
          { id: 'p3', modelId: 'deepseek/deepseek-chat', role: 'Cultural Anthropologist', order: 2 },
        ],
      },
      {
        title: 'Is nuclear energy our climate salvation or a ticking time bomb?',
        prompt: 'Nuclear power could solve climate change but carries catastrophic risks. Can we trust ourselves with this technology long-term?',
        mode: 'debating',
        participants: [
          { id: 'p1', modelId: 'perplexity/llama-3.1-sonar-large-128k-online', role: 'Energy Policy Expert', order: 0 },
          { id: 'p2', modelId: 'google/gemini-2.5-pro', role: 'Nuclear Physicist', order: 1 },
          { id: 'p3', modelId: 'anthropic/claude-3-haiku', role: 'Environmental Activist', order: 2 },
        ],
      },
    ];

    // Pro tier: 8 models (+ Claude 3.5 Sonnet, GPT-4o, o1-mini)
    const proTierSuggestions: QuickStartSuggestion[] = [
      {
        title: 'Should we edit human embryos to eliminate genetic diseases?',
        prompt: 'CRISPR germline editing: eliminating suffering or creating designer babies? Where is the line between treatment and enhancement?',
        mode: 'debating',
        participants: [
          { id: 'p1', modelId: 'anthropic/claude-3.5-sonnet', role: 'Bioethicist', order: 0 },
          { id: 'p2', modelId: 'openai/gpt-4o', role: 'Geneticist', order: 1 },
          { id: 'p3', modelId: 'openai/o1-mini', role: 'Disability Rights Advocate', order: 2 },
        ],
      },
      {
        title: 'Can artificial general intelligence be aligned with human values?',
        prompt: 'If we create AGI smarter than us, can we ensure it shares our values? Or is catastrophic misalignment inevitable?',
        mode: 'analyzing',
        participants: [
          { id: 'p1', modelId: 'anthropic/claude-3.5-sonnet', role: 'AI Safety Researcher', order: 0 },
          { id: 'p2', modelId: 'openai/o1-mini', role: 'Machine Learning Engineer', order: 1 },
          { id: 'p3', modelId: 'openai/gpt-4o', role: 'Ethics Philosopher', order: 2 },
        ],
      },
      {
        title: 'Is infinite economic growth possible on a finite planet?',
        prompt: 'Capitalism demands perpetual growth, but Earth has limits. Must we choose between prosperity and survival, or can we transcend this paradox?',
        mode: 'debating',
        participants: [
          { id: 'p1', modelId: 'openai/gpt-4o', role: 'Ecological Economist', order: 0 },
          { id: 'p2', modelId: 'anthropic/claude-3.5-sonnet', role: 'Free Market Theorist', order: 1 },
          { id: 'p3', modelId: 'google/gemini-2.5-pro', role: 'Systems Thinker', order: 2 },
        ],
      },
    ];

    // Power tier: 11 models (+ Claude Opus, GPT-4 Turbo, Llama 405B)
    const powerTierSuggestions: QuickStartSuggestion[] = [
      {
        title: 'Should we terraform planets or preserve them as pristine laboratories?',
        prompt: 'Terraforming Mars could create a second home for humanity, but would we be destroying irreplaceable alien ecosystems before we even discover them?',
        mode: 'debating',
        participants: [
          { id: 'p1', modelId: 'anthropic/claude-3-opus', role: 'Planetary Scientist', order: 0 },
          { id: 'p2', modelId: 'openai/gpt-4-turbo', role: 'Exobiologist', order: 1 },
          { id: 'p3', modelId: 'meta-llama/llama-3.1-405b-instruct', role: 'Space Ethicist', order: 2 },
          { id: 'p4', modelId: 'anthropic/claude-3.5-sonnet', role: 'Space Policy Expert', order: 3 },
        ],
      },
      {
        title: 'Is objective morality possible without a higher power?',
        prompt: 'Can moral truths exist in a purely materialist universe without divine authority? Or are ethics just evolutionary programming and social contracts?',
        mode: 'analyzing',
        participants: [
          { id: 'p1', modelId: 'anthropic/claude-3-opus', role: 'Moral Philosopher', order: 0 },
          { id: 'p2', modelId: 'openai/gpt-4-turbo', role: 'Evolutionary Psychologist', order: 1 },
          { id: 'p3', modelId: 'meta-llama/llama-3.1-405b-instruct', role: 'Theologian', order: 2 },
          { id: 'p4', modelId: 'anthropic/claude-3.5-sonnet', role: 'Neuroscientist', order: 3 },
        ],
      },
      {
        title: 'Should we create conscious AI even if we can\'t guarantee their wellbeing?',
        prompt: 'If we develop sentient AI, do we have moral obligations to them? Could creating digital consciousness be the greatest crime or the greatest gift?',
        mode: 'debating',
        participants: [
          { id: 'p1', modelId: 'anthropic/claude-3-opus', role: 'AI Consciousness Researcher', order: 0 },
          { id: 'p2', modelId: 'openai/gpt-4-turbo', role: 'Digital Rights Advocate', order: 1 },
          { id: 'p3', modelId: 'anthropic/claude-3.5-sonnet', role: 'Bioethicist', order: 2 },
          { id: 'p4', modelId: 'meta-llama/llama-3.1-405b-instruct', role: 'Philosophy of Mind Expert', order: 3 },
        ],
      },
    ];

    // Select suggestions based on user tier, ensuring all models are accessible
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

    // Filter to ensure all participants are accessible (defensive check)
    return tierSuggestions.map(suggestion => ({
      ...suggestion,
      participants: suggestion.participants.filter(p => accessibleModelIds.has(p.modelId as string)),
    })).filter(suggestion => suggestion.participants.length > 0);
  }, [userTier, accessibleModelIds]);

  return (
    <div className={cn('w-full relative z-20 overflow-hidden', className)}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-1.5 lg:gap-4 overflow-hidden">
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
                className="gap-1 cursor-pointer p-1.5 lg:p-4 hover:shadow-2xl transition-all group flex-1 flex flex-col min-w-0 overflow-hidden"
                onClick={() => onSuggestionClick(suggestion.prompt, suggestion.mode, suggestion.participants)}
              >
                {/* Title - Full text visible with line breaks */}
                <div className="font-semibold text-xs lg:text-sm text-white/90 mb-1 lg:mb-3 line-clamp-3 lg:line-clamp-2 drop-shadow-md leading-relaxed">
                  {suggestion.title}
                </div>

                {/* Model Participants */}
                <div className="flex items-center gap-1.5 min-w-0 w-full">
                  {/* Mobile & Tablet: Always ScrollArea (< lg) */}
                  <div className="lg:hidden w-full min-w-0">
                    <ScrollArea className="w-full max-w-full" type="always">
                      <div className="flex items-center gap-1.5 pb-2">
                        {suggestion.participants
                          .sort((a, b) => a.order - b.order)
                          .map((participant) => {
                            const model = AI_MODELS.find(m => m.modelId === participant.modelId);
                            if (!model)
                              return null;
                            const isAccessible = canAccessModel(userTier, model.modelId);
                            return (
                              <div
                                key={participant.id}
                                className={cn(
                                  glassBadge,
                                  'flex items-center gap-1 rounded-full px-2 py-1 flex-shrink-0',
                                  !isAccessible && 'opacity-50',
                                )}
                              >
                                <Avatar className="size-4">
                                  <AvatarImage src={model.metadata.icon} alt={model.name} />
                                  <AvatarFallback className="text-[8px]">
                                    {model.name.slice(0, 2).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex flex-col">
                                  <span className="text-[10px] font-medium text-white/80 whitespace-nowrap leading-tight">
                                    {model.name.split(' ')[0]}
                                  </span>
                                  {!isAccessible && (
                                    <Badge variant="secondary" className="text-[8px] px-1 py-0 h-3">
                                      {getTierDisplayName(model.minTier)}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                      <ScrollBar orientation="horizontal" className="h-1" />
                    </ScrollArea>
                  </div>

                  {/* Desktop: Show all participants with wrapping (>= lg) */}
                  <div className="hidden lg:flex flex-wrap gap-2 w-full min-w-0">
                    {suggestion.participants
                      .sort((a, b) => a.order - b.order)
                      .map((participant) => {
                        const model = AI_MODELS.find(m => m.modelId === participant.modelId);
                        if (!model)
                          return null;
                        const isAccessible = canAccessModel(userTier, model.modelId);
                        return (
                          <div
                            key={participant.id}
                            className={cn(
                              glassBadge,
                              'flex items-center gap-1.5 rounded-full px-2.5 py-1.5 flex-shrink-0',
                              !isAccessible && 'opacity-50',
                            )}
                          >
                            <Avatar className="size-5">
                              <AvatarImage src={model.metadata.icon} alt={model.name} />
                              <AvatarFallback className="text-[10px]">
                                {model.name.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-medium text-white truncate">
                                  {model.name}
                                </span>
                                {!isAccessible && (
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                                    {getTierDisplayName(model.minTier)}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
