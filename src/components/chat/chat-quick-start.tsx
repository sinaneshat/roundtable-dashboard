'use client';
import { MessageSquare, Users } from 'lucide-react';
import { motion } from 'motion/react';
import { useCallback, useMemo } from 'react';

import type { SubscriptionTier } from '@/api/services/product-logic.service';
import type { ParticipantConfig } from '@/components/chat/chat-form-schemas';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useModelsQuery } from '@/hooks/queries/models';
import { useUsageStatsQuery } from '@/hooks/queries/usage';
import type { ChatModeId } from '@/lib/config/chat-modes';
import { cn } from '@/lib/ui/cn';
import { getProviderIcon } from '@/lib/utils/ai-display';

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
export function ChatQuickStart({ onSuggestionClick, className }: ChatQuickStartProps) {
  const { data: usageData } = useUsageStatsQuery();
  const userTier = (usageData?.success ? usageData.data.subscription.tier : 'free') as SubscriptionTier;
  const { data: modelsResponse, isLoading: modelsLoading } = useModelsQuery();
  const allModels = useMemo(
    () => (modelsResponse?.success ? modelsResponse.data.items : []),
    [modelsResponse],
  );
  const accessibleModels = useMemo(() => {
    return allModels.filter(model => model.is_accessible_to_user ?? true);
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
    if (modelsLoading || accessibleModels.length === 0 || modelsByProvider.size === 0) {
      return [];
    }
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
              { id: 'p1', modelId: freeModels[0] || '', role: 'Privacy Advocate', priority: 0, customRoleId: undefined },
              { id: 'p2', modelId: freeModels[1] || '', role: 'Security Realist', priority: 1, customRoleId: undefined },
            ],
          },
          {
            title: 'Should we resurrect extinct species using genetic engineering?',
            prompt: 'De-extinction: ecological restoration or playing god? Discuss bringing back woolly mammoths, passenger pigeons, and other lost species.',
            mode: 'analyzing',
            participants: [
              { id: 'p1', modelId: freeModels[1] || '', role: 'Conservation Biologist', priority: 0, customRoleId: undefined },
              { id: 'p2', modelId: freeModels[0] || '', role: 'Bioethicist', priority: 1, customRoleId: undefined },
            ],
          },
          {
            title: 'Is meritocracy a myth that justifies inequality?',
            prompt: 'Does hard work truly determine success, or is meritocracy just a comforting lie that masks systemic advantages and inherited privilege?',
            mode: 'debating',
            participants: [
              { id: 'p1', modelId: freeModels[0] || '', role: 'Sociologist', priority: 0, customRoleId: undefined },
              { id: 'p2', modelId: freeModels[1] || '', role: 'Economist', priority: 1, customRoleId: undefined },
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
              { id: 'p1', modelId: starterModels[0] || '', role: 'Space Futurist', priority: 0, customRoleId: undefined },
              { id: 'p2', modelId: starterModels[1] || '', role: 'Climate Scientist', priority: 1, customRoleId: undefined },
              { id: 'p3', modelId: starterModels[2] || '', role: 'Resource Economist', priority: 2, customRoleId: undefined },
            ],
          },
          {
            title: 'Can we justify eating meat if lab-grown alternatives exist?',
            prompt: 'With cultured meat becoming viable, is traditional animal agriculture morally defensible? What about cultural traditions and livelihoods?',
            mode: 'analyzing',
            participants: [
              { id: 'p1', modelId: starterModels[1] || '', role: 'Animal Ethicist', priority: 0, customRoleId: undefined },
              { id: 'p2', modelId: starterModels[0] || '', role: 'Agronomist', priority: 1, customRoleId: undefined },
              { id: 'p3', modelId: starterModels[2] || '', role: 'Cultural Anthropologist', priority: 2, customRoleId: undefined },
            ],
          },
          {
            title: 'Is nuclear energy our climate salvation or a ticking time bomb?',
            prompt: 'Nuclear power could solve climate change but carries catastrophic risks. Can we trust ourselves with this technology long-term?',
            mode: 'debating',
            participants: [
              { id: 'p1', modelId: starterModels[0] || '', role: 'Energy Policy Expert', priority: 0, customRoleId: undefined },
              { id: 'p2', modelId: starterModels[1] || '', role: 'Nuclear Physicist', priority: 1, customRoleId: undefined },
              { id: 'p3', modelId: starterModels[2] || '', role: 'Environmental Activist', priority: 2, customRoleId: undefined },
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
              { id: 'p1', modelId: proModels[0] || '', role: 'Bioethicist', priority: 0, customRoleId: undefined },
              { id: 'p2', modelId: proModels[1] || '', role: 'Geneticist', priority: 1, customRoleId: undefined },
              { id: 'p3', modelId: proModels[2] || '', role: 'Disability Rights Advocate', priority: 2, customRoleId: undefined },
              ...(proModels[3] ? [{ id: 'p4', modelId: proModels[3] || '', role: 'Medical Ethicist', priority: 3, customRoleId: undefined }] : []),
            ],
          },
          {
            title: 'Can artificial general intelligence be aligned with human values?',
            prompt: 'If we create AGI smarter than us, can we ensure it shares our values? Or is catastrophic misalignment inevitable?',
            mode: 'analyzing',
            participants: [
              { id: 'p1', modelId: proModels[1] || '', role: 'AI Safety Researcher', priority: 0, customRoleId: undefined },
              { id: 'p2', modelId: proModels[0] || '', role: 'Machine Learning Engineer', priority: 1, customRoleId: undefined },
              { id: 'p3', modelId: proModels[2] || '', role: 'Ethics Philosopher', priority: 2, customRoleId: undefined },
              ...(proModels[3] ? [{ id: 'p4', modelId: proModels[3] || '', role: 'Systems Architect', priority: 3, customRoleId: undefined }] : []),
            ],
          },
          {
            title: 'Is infinite economic growth possible on a finite planet?',
            prompt: 'Capitalism demands perpetual growth, but Earth has limits. Must we choose between prosperity and survival, or can we transcend this paradox?',
            mode: 'debating',
            participants: [
              { id: 'p1', modelId: proModels[2] || '', role: 'Ecological Economist', priority: 0, customRoleId: undefined },
              { id: 'p2', modelId: proModels[0] || '', role: 'Free Market Theorist', priority: 1, customRoleId: undefined },
              { id: 'p3', modelId: proModels[1] || '', role: 'Systems Thinker', priority: 2, customRoleId: undefined },
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
              { id: 'p1', modelId: powerModels[0] || '', role: 'Planetary Scientist', priority: 0, customRoleId: undefined },
              { id: 'p2', modelId: powerModels[1] || '', role: 'Exobiologist', priority: 1, customRoleId: undefined },
              { id: 'p3', modelId: powerModels[2] || '', role: 'Space Ethicist', priority: 2, customRoleId: undefined },
              ...(powerModels[3] ? [{ id: 'p4', modelId: powerModels[3] || '', role: 'Space Policy Expert', priority: 3, customRoleId: undefined }] : []),
              ...(powerModels[4] ? [{ id: 'p5', modelId: powerModels[4] || '', role: 'Astrogeologist', priority: 4, customRoleId: undefined }] : []),
              ...(powerModels[5] ? [{ id: 'p6', modelId: powerModels[5] || '', role: 'Astrobiologist', priority: 5, customRoleId: undefined }] : []),
            ],
          },
          {
            title: 'Is objective morality possible without a higher power?',
            prompt: 'Can moral truths exist in a purely materialist universe without divine authority? Or are ethics just evolutionary programming and social contracts?',
            mode: 'analyzing',
            participants: [
              { id: 'p1', modelId: powerModels[1] || '', role: 'Moral Philosopher', priority: 0, customRoleId: undefined },
              { id: 'p2', modelId: powerModels[0] || '', role: 'Evolutionary Psychologist', priority: 1, customRoleId: undefined },
              { id: 'p3', modelId: powerModels[2] || '', role: 'Theologian', priority: 2, customRoleId: undefined },
              ...(powerModels[3] ? [{ id: 'p4', modelId: powerModels[3] || '', role: 'Neuroscientist', priority: 3, customRoleId: undefined }] : []),
              ...(powerModels[4] ? [{ id: 'p5', modelId: powerModels[4] || '', role: 'Cognitive Scientist', priority: 4, customRoleId: undefined }] : []),
              ...(powerModels[5] ? [{ id: 'p6', modelId: powerModels[5] || '', role: 'Ethics Scholar', priority: 5, customRoleId: undefined }] : []),
            ],
          },
          {
            title: 'Should we create conscious AI even if we can\'t guarantee their wellbeing?',
            prompt: 'If we develop sentient AI, do we have moral obligations to them? Could creating digital consciousness be the greatest crime or the greatest gift?',
            mode: 'debating',
            participants: [
              { id: 'p1', modelId: powerModels[0] || '', role: 'AI Consciousness Researcher', priority: 0, customRoleId: undefined },
              { id: 'p2', modelId: powerModels[1] || '', role: 'Digital Rights Advocate', priority: 1, customRoleId: undefined },
              { id: 'p3', modelId: powerModels[2] || '', role: 'Bioethicist', priority: 2, customRoleId: undefined },
              ...(powerModels[3] ? [{ id: 'p4', modelId: powerModels[3] || '', role: 'Philosophy of Mind Expert', priority: 3, customRoleId: undefined }] : []),
              ...(powerModels[4] ? [{ id: 'p5', modelId: powerModels[4] || '', role: 'Computational Consciousness Expert', priority: 4, customRoleId: undefined }] : []),
              ...(powerModels[5] ? [{ id: 'p6', modelId: powerModels[5] || '', role: 'AI Ethics Researcher', priority: 5, customRoleId: undefined }] : []),
            ],
          },
        ]
      : [];
    let tierSuggestions: QuickStartSuggestion[];
    if (userTier === 'free') {
      tierSuggestions = freeTierSuggestions;
    } else if (userTier === 'starter') {
      tierSuggestions = starterTierSuggestions;
    } else if (userTier === 'pro') {
      tierSuggestions = proTierSuggestions;
    } else {
      tierSuggestions = powerTierSuggestions;
    }
    return tierSuggestions;
  }, [userTier, modelsLoading, accessibleModels, modelsByProvider.size, selectUniqueProviderModels]);
  const getModeConfig = (mode: ChatModeId) => {
    switch (mode) {
      case 'debating':
        return {
          icon: Users,
          label: 'Debate',
          color: 'text-blue-400',
          bgColor: 'bg-blue-500/10',
          borderColor: 'border-blue-500/20',
        };
      case 'analyzing':
        return {
          icon: MessageSquare,
          label: 'Analyze',
          color: 'text-purple-400',
          bgColor: 'bg-purple-500/10',
          borderColor: 'border-purple-500/20',
        };
      default:
        return {
          icon: MessageSquare,
          label: 'Chat',
          color: 'text-gray-400',
          bgColor: 'bg-gray-500/10',
          borderColor: 'border-gray-500/20',
        };
    }
  };
  const renderParticipant = (participant: ParticipantConfig) => {
    const model = allModels.find(m => m.id === participant.modelId);
    if (!model)
      return null;
    const isAccessible = model.is_accessible_to_user ?? true;
    const provider = model.provider || model.id.split('/')[0] || 'unknown';
    return (
      <div
        key={participant.id}
        className={cn(
          'flex items-center gap-1.5 shrink-0',
          !isAccessible && 'opacity-50',
        )}
      >
        <Avatar className="size-4 shrink-0">
          <AvatarImage src={getProviderIcon(provider)} alt={model.name} />
          <AvatarFallback className="text-[8px] bg-white/10">
            {model.name.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span className="text-xs text-white/70 whitespace-nowrap">
          {participant.role}
        </span>
      </div>
    );
  };
  return (
    <div className={cn('w-full relative z-20', className)}>
      <div className="flex flex-col gap-3">
        {suggestions.map((suggestion, index) => {
          const modeConfig = getModeConfig(suggestion.mode);
          const ModeIcon = modeConfig.icon;
          return (
            <motion.button
              key={suggestion.title}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.4,
                delay: index * 0.1,
                ease: [0.25, 0.46, 0.45, 0.94],
              }}
              onClick={() => onSuggestionClick(suggestion.prompt, suggestion.mode, suggestion.participants)}
              className="w-full text-left p-4 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 active:bg-white/15 transition-all duration-200 focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:outline-none"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="text-sm font-medium text-white/95 leading-snug flex-1">
                  {suggestion.title}
                </h3>
                <div className={cn(
                  'flex items-center gap-1 text-xs shrink-0',
                  modeConfig.color,
                )}
                >
                  <ModeIcon className="size-3" />
                  <span>{modeConfig.label}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
                {suggestion.participants
                  .sort((a, b) => a.priority - b.priority)
                  .map(participant => renderParticipant(participant))}
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
