'use client';

import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { RecommendedAction, RoundSummary } from '@/api/routes/chat/schema';
import { AnimatedListItem } from '@/components/ui/animated-card';
import { Badge } from '@/components/ui/badge';
import { FadeInText, TypingText } from '@/components/ui/typing-text';
import { cn } from '@/lib/ui/cn';

import { ModelBadge } from '../model-badge';

type RoundSummarySectionProps = {
  roundSummary: Partial<RoundSummary>;
  onActionClick?: (action: RecommendedAction) => void;
  isStreaming?: boolean;
};

export function RoundSummarySection({
  roundSummary,
  onActionClick,
  isStreaming = false,
}: RoundSummarySectionProps) {
  const t = useTranslations('moderator');

  const {
    keyInsights,
    consensusPoints,
    divergentApproaches,
    comparativeAnalysis,
    decisionFramework,
    overallSummary,
    conclusion,
    recommendedActions,
  } = roundSummary;

  const hasAnyContent = (keyInsights && keyInsights.length > 0)
    || (consensusPoints && consensusPoints.length > 0)
    || (divergentApproaches && divergentApproaches.length > 0)
    || comparativeAnalysis
    || decisionFramework
    || overallSummary
    || conclusion
    || (recommendedActions && recommendedActions.length > 0);

  if (!hasAnyContent) {
    return null;
  }

  return (
    <div className="space-y-4 pt-3">
      {/* Key Insights */}
      {keyInsights && keyInsights.length > 0 && (
        <div className="space-y-1.5">
          <FadeInText delay={0.05}>
            <h4 className="text-xs font-medium text-muted-foreground">{t('keyInsights')}</h4>
          </FadeInText>
          <div className="space-y-1">
            {keyInsights.map((insight, index) => (
              <AnimatedListItem key={insight} index={index} className="flex items-start gap-2">
                <span className="shrink-0 mt-0.5 text-primary">•</span>
                <p className="text-sm leading-relaxed text-foreground/90 flex-1">
                  <TypingText text={insight} speed={8} delay={index * 50 + 100} enabled={isStreaming} />
                </p>
              </AnimatedListItem>
            ))}
          </div>
        </div>
      )}

      {/* Consensus Points */}
      {consensusPoints && consensusPoints.length > 0 && (
        <div className="space-y-1.5">
          <FadeInText delay={0.15}>
            <h4 className="text-xs font-medium text-muted-foreground">{t('consensusPoints')}</h4>
          </FadeInText>
          <div className="space-y-1">
            {consensusPoints.map((point, index) => (
              <AnimatedListItem key={point} index={index} className="flex items-start gap-2">
                <span className="shrink-0 mt-0.5 text-primary">•</span>
                <p className="text-sm leading-relaxed text-foreground/90 flex-1">
                  <TypingText text={point} speed={8} delay={index * 50 + 200} enabled={isStreaming} />
                </p>
              </AnimatedListItem>
            ))}
          </div>
        </div>
      )}

      {/* Divergent Approaches */}
      {divergentApproaches && divergentApproaches.length > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-xs font-medium text-muted-foreground">{t('divergentApproaches')}</h4>
          <div className="space-y-2">
            {divergentApproaches.map((approach, approachIdx) => (
              <div key={approach.topic || `approach-${approachIdx}`} className="space-y-1">
                {approach.topic && (
                  <p className="text-sm font-medium text-foreground">{approach.topic}</p>
                )}
                {approach.perspectives && approach.perspectives.length > 0 && (
                  <div className="space-y-0.5 pl-3">
                    {approach.perspectives.map(perspective => (
                      <div key={perspective} className="flex items-start gap-1.5">
                        <span className="shrink-0 mt-0.5 text-muted-foreground">-</span>
                        <p className="text-sm leading-relaxed text-muted-foreground flex-1">
                          {perspective}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Comparative Analysis */}
      {comparativeAnalysis && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground">{t('comparativeAnalysis')}</h4>
          <div className="space-y-2">
            {comparativeAnalysis.strengthsByCategory && comparativeAnalysis.strengthsByCategory.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">{t('strengthsByCategory')}</p>
                <div className="space-y-1.5 pl-3">
                  {comparativeAnalysis.strengthsByCategory.map((strength, strengthIdx) => (
                    <div key={strength.category || `strength-${strengthIdx}`} className="space-y-1">
                      {strength.category && (
                        <p className="text-sm text-foreground/90">
                          {strength.category}
                        </p>
                      )}
                      {strength.participants && strength.participants.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {strength.participants.map(participant => (
                            <Badge key={participant} variant="outline" className="text-xs">
                              {participant}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {comparativeAnalysis.tradeoffs && comparativeAnalysis.tradeoffs.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{t('tradeoffs')}</p>
                <div className="space-y-0.5 pl-3">
                  {comparativeAnalysis.tradeoffs.map(tradeoff => (
                    <div key={tradeoff} className="flex items-start gap-1.5">
                      <span className="shrink-0 mt-0.5 text-muted-foreground">-</span>
                      <p className="text-sm leading-relaxed text-muted-foreground flex-1">
                        {tradeoff}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Decision Framework */}
      {decisionFramework && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground">{t('decisionFramework')}</h4>
          <div className="space-y-2">
            {decisionFramework.criteriaToConsider && decisionFramework.criteriaToConsider.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{t('criteriaToConsider')}</p>
                <div className="space-y-0.5 pl-3">
                  {decisionFramework.criteriaToConsider.map(criteria => (
                    <div key={criteria} className="flex items-start gap-1.5">
                      <span className="shrink-0 mt-0.5 text-muted-foreground">-</span>
                      <p className="text-sm leading-relaxed text-muted-foreground flex-1">
                        {criteria}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {decisionFramework.scenarioRecommendations && decisionFramework.scenarioRecommendations.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">{t('scenarioRecommendations')}</p>
                <div className="space-y-1.5 pl-3">
                  {decisionFramework.scenarioRecommendations.map((scenario, scenarioIdx) => (
                    <div
                      key={scenario.scenario || `scenario-${scenarioIdx}`}
                      className="space-y-0.5"
                    >
                      {scenario.scenario && (
                        <p className="text-sm font-medium text-foreground">{scenario.scenario}</p>
                      )}
                      {scenario.recommendation && (
                        <p className="text-sm leading-relaxed text-muted-foreground">{scenario.recommendation}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Overall Summary */}
      {overallSummary && (
        <div className="space-y-1.5">
          <FadeInText delay={0.25}>
            <h4 className="text-xs font-medium text-muted-foreground">{t('summary')}</h4>
          </FadeInText>
          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/80">
            <TypingText text={overallSummary} speed={10} delay={300} enabled={isStreaming} />
          </p>
        </div>
      )}

      {/* Conclusion */}
      {conclusion && (
        <div className="space-y-1.5">
          <FadeInText delay={0.35}>
            <h4 className="text-xs font-medium text-primary">{t('conclusion')}</h4>
          </FadeInText>
          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
            <TypingText text={conclusion} speed={10} delay={400} enabled={isStreaming} />
          </p>
        </div>
      )}

      {/* Recommended Actions */}
      {recommendedActions && recommendedActions.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground">{t('recommendedActions')}</h4>
          <div className="space-y-2">
            {recommendedActions.map((action) => {
              // Skip incomplete actions during streaming
              if (!action.action || !action.rationale) {
                return null;
              }

              return (
                <button
                  type="button"
                  key={action.action}
                  onClick={() => !isStreaming && onActionClick?.(action)}
                  disabled={isStreaming}
                  className={cn(
                    'w-full text-left p-3 rounded-md',
                    'bg-background/5 hover:bg-background/10',
                    'transition-colors',
                    'group',
                    isStreaming && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <p className="text-sm font-medium leading-snug text-foreground">
                        {action.action}
                      </p>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {action.rationale}
                      </p>

                      {(action.suggestedMode || (action.suggestedModels && action.suggestedModels.length > 0)) && (
                        <div className="flex flex-col gap-1.5 pt-1">
                          {action.suggestedMode && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-medium text-muted-foreground uppercase">
                                Mode
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {action.suggestedMode}
                              </Badge>
                            </div>
                          )}
                          {action.suggestedModels && action.suggestedModels.length > 0 && (
                            <div className="flex flex-col gap-1">
                              <span className="text-[10px] font-medium text-muted-foreground uppercase">
                                Models
                              </span>
                              <div className="flex flex-wrap gap-1">
                                {action.suggestedModels.map((modelId, index) => {
                                  const role = action.suggestedRoles?.[index];
                                  return (
                                    <ModelBadge key={modelId} modelId={modelId} role={role} />
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground/50 group-hover:text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
