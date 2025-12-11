'use client';

import type { DeepPartial } from 'ai';
import { CheckCircle, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo } from 'react';

import type { ArticleNarrative, ArticleRecommendation } from '@/api/routes/chat/schema';
import { canAccessModelByPricing, subscriptionTierSchema } from '@/api/services/product-logic.service';
import { ModelBadge } from '@/components/chat/model-badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { StreamingCursor } from '@/components/ui/streaming-text';
import { useModelsQuery } from '@/hooks/queries/models';
import { cn } from '@/lib/ui/cn';

/**
 * Props accept both full types (from panel) and partial types (from streaming)
 * Following established pattern from analysis-utils.ts
 */
type KeyInsightsSectionProps = {
  article?: ArticleNarrative | DeepPartial<ArticleNarrative>;
  recommendations?: ArticleRecommendation[] | DeepPartial<ArticleRecommendation[]>;
  onActionClick?: (action: ArticleRecommendation) => void;
  isStreaming?: boolean;
};

/**
 * KeyInsightsSection - Article-Style Analysis
 *
 * Displays the article summary and actionable recommendations:
 * - Article headline and key takeaway
 * - Narrative text (2-4 paragraph synthesis)
 * - Glass card recommendations with model badges and actionable prompts
 * - ✅ TIER-AWARE: Only shows models accessible to user's subscription tier
 */
export function KeyInsightsSection({
  article,
  recommendations,
  onActionClick,
  isStreaming = false,
}: KeyInsightsSectionProps) {
  // Get user tier and models for filtering
  const { data: modelsData } = useModelsQuery();
  const userTier = modelsData?.data?.user_tier_config?.tier;
  const allModels = modelsData?.data?.items;

  // Filter recommendations to only show tier-accessible models
  const filteredRecommendations = useMemo(() => {
    if (!recommendations || !userTier || !allModels) {
      return recommendations;
    }

    const tierResult = subscriptionTierSchema.safeParse(userTier);
    if (!tierResult.success) {
      return recommendations;
    }
    const validTier = tierResult.data;

    return recommendations.map((rec) => {
      if (!rec?.suggestedModels?.length) {
        return rec;
      }

      // Filter to only tier-accessible models
      const accessibleModels = rec.suggestedModels.filter((modelId) => {
        if (!modelId)
          return false;
        const modelData = allModels.find(m => m.id === modelId);
        return modelData && canAccessModelByPricing(validTier, modelData);
      });

      // Filter roles to match accessible models
      const accessibleRoles = rec.suggestedRoles?.filter((_, index) => {
        const modelId = rec.suggestedModels?.[index];
        if (!modelId)
          return false;
        const modelData = allModels.find(m => m.id === modelId);
        return modelData && canAccessModelByPricing(validTier, modelData);
      });

      return {
        ...rec,
        suggestedModels: accessibleModels.length > 0 ? accessibleModels : undefined,
        suggestedRoles: accessibleRoles?.length ? accessibleRoles : undefined,
      };
    });
  }, [recommendations, userTier, allModels]);

  const hasContent = article || (filteredRecommendations && filteredRecommendations.length > 0);

  if (!hasContent) {
    return null;
  }

  // Check if any recommendation has actionable suggestions
  const hasActionableRecs = filteredRecommendations?.some(
    rec => rec?.suggestedModels?.length || rec?.suggestedPrompt,
  );

  return (
    <div className="space-y-4">
      {/* Article Section */}
      {article && (
        <div className="space-y-3">
          {/* Headline */}
          {article.headline && (
            <h3 className="text-base font-semibold text-foreground leading-tight">
              {article.headline}
            </h3>
          )}

          {/* Key Takeaway */}
          {article.keyTakeaway && (
            <div className="px-3 py-2 rounded-lg bg-primary/10 border border-primary/20">
              <p className="text-sm font-medium text-primary">
                {article.keyTakeaway}
              </p>
            </div>
          )}

          {/* Narrative */}
          {article.narrative && (
            <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-line">
              {article.narrative}
              {isStreaming && <StreamingCursor />}
            </p>
          )}
        </div>
      )}

      {/* Recommendations */}
      {filteredRecommendations && filteredRecommendations.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="size-4 text-emerald-500" />
            <span className="text-sm font-medium">Recommended Next Steps</span>
          </div>

          <div className="flex flex-col gap-2">
            {filteredRecommendations.map((rec, recIndex) => {
              if (!rec?.title)
                return null;

              const hasModels = rec.suggestedModels && rec.suggestedModels.length > 0;
              const hasPrompt = rec.suggestedPrompt;
              const isClickable = hasModels || hasPrompt;

              return (
                <motion.button
                  key={rec.title || `insight-${recIndex}`}
                  type="button"
                  onClick={() => rec.title && rec.description && onActionClick?.({
                    title: rec.title,
                    description: rec.description,
                    suggestedPrompt: rec.suggestedPrompt,
                    suggestedModels: rec.suggestedModels?.filter((m): m is string => !!m),
                    suggestedRoles: rec.suggestedRoles?.filter((r): r is string => !!r),
                  })}
                  disabled={!onActionClick || !isClickable}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  transition={{
                    duration: 0.2,
                    delay: recIndex * 0.04,
                    ease: 'easeOut',
                  }}
                  className={cn(
                    'group/rec w-full text-left rounded-2xl px-4 py-3 cursor-pointer',
                    // Glass hover effect - matching chat-quick-start
                    'hover:bg-white/10 hover:backdrop-blur-md',
                    'active:bg-white/[0.15]',
                    // Focus state
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20',
                    // Transition
                    'transition-all duration-200 ease-out touch-manipulation',
                    // Disabled state
                    'disabled:cursor-default disabled:hover:bg-transparent',
                  )}
                >
                  <div className="flex flex-col gap-2.5">
                    {/* Title and description */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-normal text-white leading-snug">
                        {rec.title}
                      </h3>
                      {rec.description && (
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                          {rec.description}
                        </p>
                      )}
                    </div>

                    {/* Suggested Prompt */}
                    {hasPrompt && (
                      <div className="flex items-start gap-2">
                        <Sparkles className="size-3.5 text-primary/70 flex-shrink-0 mt-0.5 group-hover/rec:text-primary transition-colors" />
                        <p className="text-xs text-foreground/60 italic leading-relaxed group-hover/rec:text-foreground/80 transition-colors">
                          &ldquo;
                          {rec.suggestedPrompt}
                          &rdquo;
                        </p>
                      </div>
                    )}

                    {/* Models - horizontal scroll on mobile, wrap on desktop */}
                    {hasModels && (
                      <ScrollArea className="w-full sm:hidden">
                        <div className="flex items-center gap-2 pb-2">
                          {rec.suggestedModels?.map((modelId, modelIndex) => modelId && (
                            <div key={`${rec.title}-model-${modelId}-role-${rec.suggestedRoles?.[modelIndex] ?? 'default'}`} className="flex-shrink-0">
                              <ModelBadge
                                modelId={modelId}
                                role={rec.suggestedRoles?.[modelIndex] ?? undefined}
                                size="sm"
                              />
                            </div>
                          ))}
                        </div>
                        <ScrollBar orientation="horizontal" className="h-1.5" />
                      </ScrollArea>
                    )}
                    {/* Desktop: wrap normally */}
                    {hasModels && (
                      <div className="hidden sm:flex items-center gap-2 flex-wrap">
                        {rec.suggestedModels?.map((modelId, modelIndex) => modelId && (
                          <ModelBadge
                            key={`${rec.title}-model-${modelId}-role-${rec.suggestedRoles?.[modelIndex] ?? 'default'}`}
                            modelId={modelId}
                            role={rec.suggestedRoles?.[modelIndex] ?? undefined}
                            size="sm"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </motion.button>
              );
            })}
          </div>

          {hasActionableRecs && (
            <p className="text-[11px] text-muted-foreground/60 text-center pt-1">
              Select a recommendation to continue the conversation
            </p>
          )}
        </div>
      )}
    </div>
  );
}
