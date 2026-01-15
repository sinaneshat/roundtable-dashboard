'use client';
import { motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ChatMode, SubscriptionTier } from '@/api/core/enums';
import { AvatarSizes, ChatModes, PlanTypes, SubscriptionTiers } from '@/api/core/enums';
import type { EnhancedModelResponse } from '@/api/routes/models/schema';
import { AvatarGroup } from '@/components/chat/avatar-group';
import { Skeleton } from '@/components/ui/skeleton';
import { useModelsQuery, useUsageStatsQuery } from '@/hooks/queries';
import { getChatModeLabel, MIN_PARTICIPANTS_REQUIRED } from '@/lib/config';
import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';
import { cn } from '@/lib/ui/cn';

type PromptTemplate = {
  title: string;
  prompt: string;
  mode: ChatMode;
  roles: string[];
};

const PROMPT_POOL: PromptTemplate[] = [
  // CEO/Executive
  {
    title: 'Our competitor got acquired. Seek a buyer or raise to compete?',
    prompt: 'We\'re a $4M ARR B2B SaaS (project management, 40 employees). Our main competitor just got acquired by Microsoft for $200M. We have 18 months runway and 15% MoM growth. Seek acquisition while market is hot, raise Series A to compete, or stay bootstrapped and niche down?',
    mode: ChatModes.DEBATING,
    roles: ['Strategic Advisor', 'M&A Expert', 'Growth Strategist'],
  },
  {
    title: 'Cash-flow positive but growth slowing. Cut costs or invest?',
    prompt: 'We\'re a $6M ARR fintech startup, profitable at $400K/year but growth dropped from 8% to 3% MoM. We have $2M in the bank, 50 employees. Cut 20% of staff to extend runway to 3 years, or spend reserves on sales/marketing to reignite growth?',
    mode: ChatModes.ANALYZING,
    roles: ['CFO Advisor', 'Growth Expert', 'Operations Analyst'],
  },
  {
    title: 'Key executive leaving for competitor. Counter-offer or let go?',
    prompt: 'Our VP of Engineering (5 years, built the whole platform) just got a $450K offer from our main competitor. He currently makes $280K + 1.5% equity. Counter-offer with a $350K + 0.5% refresh, let him go gracefully, or remind him of his 2-year non-compete?',
    mode: ChatModes.DEBATING,
    roles: ['HR Strategist', 'Legal Counsel', 'Culture Advisor'],
  },
  {
    title: 'Market consolidating. Acquire a smaller player or be acquired?',
    prompt: 'We\'re #3 in our market ($8M ARR). #1 and #2 just merged. A smaller competitor ($2M ARR) is available for $5M. We have $3M cash. Take debt to acquire them and become #2, focus on profitability to become attractive acquisition target, or keep competing as is?',
    mode: ChatModes.ANALYZING,
    roles: ['M&A Advisor', 'Market Analyst', 'Strategic Planner'],
  },
  // Product Management
  {
    title: 'Users want feature X, but it conflicts with strategy. Build it?',
    prompt: 'Our top 5 enterprise customers ($1.2M combined ARR) are demanding Salesforce integration. Building it requires 3 months and pulls us away from our AI roadmap which we believe is our moat. They\'ve hinted they\'ll churn without it. Build the integration, hold firm on AI strategy, or offer a discount to buy time?',
    mode: ChatModes.DEBATING,
    roles: ['Product Strategist', 'Customer Success Lead', 'Tech Lead'],
  },
  {
    title: 'Competitor launched our roadmap feature. Pivot or execute better?',
    prompt: 'We planned to launch AI-powered analytics next quarter—our main differentiator. Competitor just shipped it last week, getting press coverage. We\'re 2 months from launch with arguably better implementation. Ship anyway and compete on quality, pivot to a different AI feature, or accelerate launch and cut scope?',
    mode: ChatModes.ANALYZING,
    roles: ['Competitive Analyst', 'Product Lead', 'UX Strategist'],
  },
  {
    title: 'Enterprise wants on-prem but it slows velocity 40%. Worth it?',
    prompt: 'Three Fortune 500 prospects ($800K combined ACV) require on-premises deployment. Engineering estimates 6 months to build and 40% slower feature velocity ongoing. Current ARR is $3M, all cloud. Accept the architectural complexity for $800K, decline and stay cloud-only, or offer a hybrid compromise?',
    mode: ChatModes.DEBATING,
    roles: ['Enterprise Advisor', 'Engineering Lead', 'Revenue Strategist'],
  },
  {
    title: 'Free tier cannibalizing paid. Kill it or lean into viral growth?',
    prompt: 'Our free tier has 50K users with 2% converting to paid ($50/mo). Conversion dropped from 4% as free features expanded. Free users cost $3/mo to serve. Kill free tier entirely, add aggressive limits (storage, exports), or double down on viral features hoping volume compensates?',
    mode: ChatModes.ANALYZING,
    roles: ['Growth Analyst', 'Monetization Expert', 'Product Strategist'],
  },
  // Legal
  {
    title: 'Cease & desist on trademark. Fight, rebrand, or negotiate?',
    prompt: 'We\'re \'Beacon Analytics\' (2 years old, $2M brand investment). Received C&D from \'Beacon Insurance\' (Fortune 500). Our lawyer says we\'d likely win (different industries) but litigation costs $300K+. Rebrand for ~$500K, fight it, or offer coexistence agreement with geographic/industry restrictions?',
    mode: ChatModes.DEBATING,
    roles: ['IP Attorney', 'Brand Strategist', 'Risk Advisor'],
  },
  {
    title: 'Employee alleges wrongful termination. Settle or litigate?',
    prompt: 'Terminated employee (sales, 18 months tenure, documented performance issues) is threatening wrongful termination suit claiming discrimination. Their lawyer is asking $150K to settle. Our lawyer estimates $80K to litigate with 70% win probability. Settle quickly to avoid PR, litigate to avoid setting precedent, or counter-offer at $75K?',
    mode: ChatModes.ANALYZING,
    roles: ['Employment Counsel', 'HR Advisor', 'PR Strategist'],
  },
  {
    title: 'Patent troll lawsuit. Settle, fight, or find prior art?',
    prompt: 'Patent troll is suing us for $2M over a vague \'data synchronization\' patent. They\'ve settled with 12 other companies for $200-400K each. Our tech clearly differs but litigation costs $500K+. Pay $300K to settle, fight to set precedent for the industry, or spend $100K on prior art search first?',
    mode: ChatModes.DEBATING,
    roles: ['Patent Attorney', 'Litigation Strategist', 'Technical Expert'],
  },
  // Healthcare
  {
    title: 'New treatment promising but limited data. Recommend to patient?',
    prompt: 'Stage 4 pancreatic cancer patient, 68yo, otherwise healthy. Standard chemo offers 8% 2-year survival. New immunotherapy trial shows 22% in early data (n=45) but severe side effects in 30% of cases. Patient has good insurance, wants to fight. Recommend trial, standard treatment, or palliative care focus?',
    mode: ChatModes.ANALYZING,
    roles: ['Oncologist', 'Medical Ethicist', 'Patient Advocate'],
  },
  {
    title: 'Conflicting specialist opinions on treatment. How to proceed?',
    prompt: 'Patient with complex cardiac + kidney issues. Cardiologist recommends surgery (15% mortality risk, fixes heart). Nephrologist says surgery will accelerate kidney failure requiring dialysis within a year. Patient is 58, active, values quality of life. Surgery with kidney risk, medical management only, or seek third opinion and delay?',
    mode: ChatModes.DEBATING,
    roles: ['Chief Medical Officer', 'Care Coordinator', 'Risk Analyst'],
  },
  {
    title: 'Staff burnout crisis. Cut capacity or hire expensive travel nurses?',
    prompt: 'ICU at 95% capacity for 8 weeks. Nursing turnover hit 40% annually. Travel nurses cost $150/hr vs $45/hr for staff. Options: reduce beds by 20% (losing $2M/month revenue), hire travel nurses ($800K/month extra), or mandatory overtime with retention bonuses ($200K/month). Which approach for the next 6 months?',
    mode: ChatModes.ANALYZING,
    roles: ['Healthcare Administrator', 'HR Director', 'Finance Lead'],
  },
  // General Board Room
  {
    title: 'Need to cut 20% of costs. Where do we cut without killing growth?',
    prompt: 'Board mandated 20% cost reduction ($2M annually). Current spend: Engineering $4M, Sales $3M, Marketing $1.5M, G&A $1.5M. Growth is 30% YoY, mostly from sales team. Cut engineering (slow product), cut sales (slow growth), cut marketing (hurt brand), or across-the-board 20% including layoffs?',
    mode: ChatModes.ANALYZING,
    roles: ['CFO Advisor', 'Operations Expert', 'Strategic Planner'],
  },
  {
    title: 'Our industry is being disrupted by AI. Adapt, pivot, or ignore?',
    prompt: 'We run a $10M content writing agency (200 writers). AI tools now produce 70% quality content at 5% of our cost. Revenue down 15% this year. Options: pivot to AI-assisted premium content (layoff 150 writers), become an AI tools reseller, double down on human-only quality positioning, or exit the business while we still can?',
    mode: ChatModes.DEBATING,
    roles: ['Innovation Lead', 'Industry Analyst', 'Strategy Advisor'],
  },
  {
    title: 'Key customer with 40% revenue demanding exclusivity. Accept terms?',
    prompt: 'Our largest customer ($3M of $7.5M ARR) wants exclusive rights to our product in their industry for 3 years. They\'ll pay 25% premium ($750K/year extra). But it blocks us from 4 known prospects worth ~$1M ARR combined. Accept exclusivity, negotiate narrower terms, or decline and risk them churning?',
    mode: ChatModes.DEBATING,
    roles: ['Revenue Strategist', 'Risk Advisor', 'Legal Counsel'],
  },
  {
    title: 'PR crisis: executive misconduct allegation. Response strategy?',
    prompt: 'Our COO (co-founder, 10 years) accused of harassment by former employee. Story broke on Twitter, 500K views. No police report, but two other employees corroborated privately. COO denies everything. Suspend immediately pending investigation, issue statement supporting COO, hire external investigator and say nothing, or ask for resignation?',
    mode: ChatModes.ANALYZING,
    roles: ['Crisis Manager', 'Legal Counsel', 'Communications Lead'],
  },
];

// Simple seeded random for deterministic selection across server/client
function seededRandom(seed: number): () => number {
  return () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
}

// Get daily seed to rotate prompts each day while keeping server/client in sync
function getDailySeed(): number {
  const now = new Date();
  return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
}

function getRandomPrompts(count: number): PromptTemplate[] {
  const seed = getDailySeed();
  const random = seededRandom(seed);
  const shuffled = [...PROMPT_POOL].sort(() => random() - 0.5);
  return shuffled.slice(0, count);
}

function getDailyOffset(): number {
  return getDailySeed() % 10;
}

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
export function QuickStartSkeleton({ className }: { className?: string }) {
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
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-3">
              <Skeleton className="h-5 w-3/4 bg-white/10" />
              <div className="flex items-center gap-2.5 shrink-0">
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
  // ✅ HYDRATION FIX: Initialize with null, set on client via useEffect
  // Previously used useState initializers with new Date() which caused hydration
  // mismatch when server and client were in different timezones or time rolled over
  const [randomPrompts, setRandomPrompts] = useState<PromptTemplate[] | null>(null);
  const [initialProviderOffset, setInitialProviderOffset] = useState<number | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- Hydration: null on server, set on client
    setRandomPrompts(getRandomPrompts(3));
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- Hydration: null on server, set on client
    setInitialProviderOffset(getDailyOffset());
  }, []);
  const { data: usageData, isLoading: isUsageLoading } = useUsageStatsQuery();
  const { data: modelsResponse, isLoading: isModelsLoading } = useModelsQuery();

  // Include null randomPrompts in loading check to avoid hydration mismatch
  const isLoading = isModelsLoading || isUsageLoading || randomPrompts === null;

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
    // Guard against null during initial hydration - must be before any usage
    if (accessibleModels.length === 0 || !randomPrompts || initialProviderOffset === null) {
      return [];
    }

    const idealCount = userTier === SubscriptionTiers.FREE
      ? MIN_PARTICIPANTS_REQUIRED
      : 4;

    // Capture checked offset for TypeScript narrowing
    const providerOffset = initialProviderOffset;

    // Build each suggestion with a DIFFERENT provider offset for maximum diversity
    const buildSuggestion = (
      template: PromptTemplate,
      suggestionIndex: number,
    ): QuickStartSuggestion => {
      // Combine initial random offset with suggestion index for variety on each page load
      // while still ensuring diversity across the 3 suggestions
      const models = selectUniqueProviderModels(idealCount, providerOffset + suggestionIndex);

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
