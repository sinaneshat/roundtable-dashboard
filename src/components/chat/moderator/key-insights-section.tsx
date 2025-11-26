'use client';

import { CheckCircle, MessageSquare, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';

import type { Recommendation } from '@/api/routes/chat/schema';
import { ModelBadge } from '@/components/chat/model-badge';
import { cn } from '@/lib/ui/cn';

type KeyInsightsSectionProps = {
  summary?: string;
  recommendations?: Recommendation[];
  onActionClick?: (action: Recommendation) => void;
  isStreaming?: boolean;
};

/**
 * KeyInsightsSection - Multi-AI Deliberation Framework
 *
 * Displays key insights and actionable recommendations:
 * - Summary text (high-level synthesis)
 * - Glass card recommendations with model badges and actionable prompts
 */
export function KeyInsightsSection({
  summary,
  recommendations,
  onActionClick,
  isStreaming: _isStreaming = false,
}: KeyInsightsSectionProps) {
  const hasContent = summary || (recommendations && recommendations.length > 0);

  if (!hasContent) {
    return null;
  }

  // Check if any recommendation has actionable suggestions
  const hasActionableRecs = recommendations?.some(
    rec => rec.suggestedModels?.length || rec.suggestedPrompt,
  );

  return (
    <div className="space-y-4">
      {/* Summary */}
      {summary && (
        <p className="text-sm leading-relaxed text-foreground/90">
          {summary}
        </p>
      )}

      {/* Recommendations */}
      {recommendations && recommendations.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="size-4 text-emerald-500" />
            <span className="text-sm font-medium">Recommended Next Steps</span>
          </div>

          <div className="flex flex-col gap-2">
            {recommendations.map((rec, index) => {
              const hasModels = rec.suggestedModels && rec.suggestedModels.length > 0;
              const hasPrompt = rec.suggestedPrompt;
              const isClickable = hasModels || hasPrompt || rec.suggestedMode;

              return (
                <motion.button
                  key={`rec-${rec.title}`}
                  type="button"
                  onClick={() => onActionClick?.(rec)}
                  disabled={!onActionClick || !isClickable}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  transition={{
                    duration: 0.2,
                    delay: index * 0.05,
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

                    {/* Mode and Models inline */}
                    {(rec.suggestedMode || hasModels) && (
                      <div className="flex items-center gap-2 flex-wrap">
                        {rec.suggestedMode && (
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-2xl bg-white/[0.04] border border-white/[0.06]">
                            <MessageSquare className="size-3 text-muted-foreground" />
                            <span className="text-[11px] font-medium text-white/80">{rec.suggestedMode}</span>
                          </div>
                        )}
                        {hasModels && rec.suggestedModels!.map((modelId, modelIndex) => (
                          <ModelBadge
                            key={`${rec.title}-model-${modelId}`}
                            modelId={modelId}
                            role={rec.suggestedRoles?.[modelIndex]}
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
