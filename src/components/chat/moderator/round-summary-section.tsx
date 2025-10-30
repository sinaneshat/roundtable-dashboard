'use client';

import { motion } from 'framer-motion';
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  FileText,
  GitBranch,
  Lightbulb,
  ListChecks,
  Scale,
  Sparkles,
  Target,
  Users,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { RecommendedAction, RoundSummary } from '@/api/routes/chat/schema';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/ui/cn';
import { glassCard } from '@/lib/ui/glassmorphism';

import { ModelBadge } from '../model-badge';
import { AnalysisSection, animationVariants } from './analysis-section';

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
    <div className="space-y-6 pt-4">
      {/* Key Insights */}
      {keyInsights && keyInsights.length > 0 && (
        <AnalysisSection title={t('keyInsights')} icon={Lightbulb} enableStagger>
          <div className="space-y-2">
            {keyInsights.map(insight => (
              <motion.div
                key={insight}
                variants={animationVariants.itemFade}
                className="flex items-start gap-2.5"
              >
                <CheckCircle2 className="size-4 shrink-0 mt-0.5 text-primary" />
                <p className="text-sm leading-relaxed text-foreground/90 flex-1">
                  {insight}
                </p>
              </motion.div>
            ))}
          </div>
        </AnalysisSection>
      )}

      {/* Consensus Points */}
      {consensusPoints && consensusPoints.length > 0 && (
        <AnalysisSection title={t('consensusPoints')} icon={ListChecks} enableStagger>
          <div className="space-y-2">
            {consensusPoints.map(point => (
              <motion.div
                key={point}
                variants={animationVariants.itemFade}
                className="flex items-start gap-2.5"
              >
                <CheckCircle2 className="size-4 shrink-0 mt-0.5 text-primary" />
                <p className="text-sm leading-relaxed text-foreground/90 flex-1">
                  {point}
                </p>
              </motion.div>
            ))}
          </div>
        </AnalysisSection>
      )}

      {/* Divergent Approaches */}
      {divergentApproaches && divergentApproaches.length > 0 && (
        <>
          {(keyInsights || consensusPoints) && <Separator className="my-6" />}
          <AnalysisSection title={t('divergentApproaches')} icon={GitBranch}>
            <div className="space-y-3">
              {divergentApproaches.map((approach, approachIdx) => (
                <div key={approach.topic || `approach-${approachIdx}`} className="space-y-2">
                  {approach.topic && (
                    <h4 className="text-sm font-semibold text-foreground">{approach.topic}</h4>
                  )}
                  {approach.perspectives && approach.perspectives.length > 0 && (
                    <div className="space-y-1.5 pl-4">
                      {approach.perspectives.map(perspective => (
                        <div key={perspective} className="flex items-start gap-2">
                          <div className="mt-1.5 size-1 rounded-full bg-muted-foreground/60 shrink-0" />
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
          </AnalysisSection>
        </>
      )}

      {/* Comparative Analysis */}
      {comparativeAnalysis && (
        <>
          {divergentApproaches && <Separator className="my-6" />}
          <AnalysisSection title={t('comparativeAnalysis')} icon={Scale}>
            <div className="space-y-3">
              {comparativeAnalysis.strengthsByCategory && comparativeAnalysis.strengthsByCategory.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-3.5 text-primary" />
                    <h4 className="text-sm font-semibold text-foreground">{t('strengthsByCategory')}</h4>
                  </div>
                  <div className="space-y-2 pl-4">
                    {comparativeAnalysis.strengthsByCategory.map((strength, strengthIdx) => (
                      <div key={strength.category || `strength-${strengthIdx}`} className="space-y-1.5">
                        {strength.category && (
                          <p className="text-sm font-medium text-foreground/90">
                            {strength.category}
                          </p>
                        )}
                        {strength.participants && strength.participants.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
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
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Scale className="size-3.5 text-primary" />
                    <h4 className="text-sm font-semibold text-foreground">{t('tradeoffs')}</h4>
                  </div>
                  <div className="space-y-1.5 pl-4">
                    {comparativeAnalysis.tradeoffs.map(tradeoff => (
                      <div key={tradeoff} className="flex items-start gap-2">
                        <div className="mt-1.5 size-1 rounded-full bg-muted-foreground/60 shrink-0" />
                        <p className="text-sm leading-relaxed text-muted-foreground flex-1">
                          {tradeoff}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </AnalysisSection>
        </>
      )}

      {/* Decision Framework */}
      {decisionFramework && (
        <>
          {comparativeAnalysis && <Separator className="my-6" />}
          <AnalysisSection title={t('decisionFramework')} icon={Target}>
            <div className="space-y-3">
              {decisionFramework.criteriaToConsider && decisionFramework.criteriaToConsider.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Target className="size-3.5 text-primary" />
                    <h4 className="text-sm font-semibold text-foreground">{t('criteriaToConsider')}</h4>
                  </div>
                  <div className="space-y-1.5 pl-4">
                    {decisionFramework.criteriaToConsider.map(criteria => (
                      <div key={criteria} className="flex items-start gap-2">
                        <div className="mt-1.5 size-1 rounded-full bg-muted-foreground/60 shrink-0" />
                        <p className="text-sm leading-relaxed text-muted-foreground flex-1">
                          {criteria}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {decisionFramework.scenarioRecommendations && decisionFramework.scenarioRecommendations.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-3.5 text-primary" />
                    <h4 className="text-sm font-semibold text-foreground">{t('scenarioRecommendations')}</h4>
                  </div>
                  <div className="space-y-2 pl-4">
                    {decisionFramework.scenarioRecommendations.map((scenario, scenarioIdx) => (
                      <div
                        key={scenario.scenario || `scenario-${scenarioIdx}`}
                        className="space-y-1"
                      >
                        {scenario.scenario && (
                          <p className="text-sm font-semibold text-foreground">{scenario.scenario}</p>
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
          </AnalysisSection>
        </>
      )}

      {/* Overall Summary */}
      {overallSummary && (
        <>
          <Separator className="my-6" />
          <AnalysisSection title={t('summary')} icon={FileText}>
            <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/80">
              {overallSummary}
            </p>
          </AnalysisSection>
        </>
      )}

      {/* Conclusion */}
      {conclusion && (
        <>
          <Separator className="my-6" />
          <AnalysisSection
            title={t('conclusion')}
            icon={ArrowRight}
            titleClassName="text-primary"
          >
            <p className="whitespace-pre-line text-sm leading-relaxed text-foreground font-medium">
              {conclusion}
            </p>
          </AnalysisSection>
        </>
      )}

      {/* Recommended Actions */}
      {recommendedActions && recommendedActions.length > 0 && (
        <>
          <Separator className="my-6" />
          <AnalysisSection title={t('recommendedActions')} icon={Users}>
            <div className="space-y-2.5">
              {recommendedActions.map((action) => {
                // Skip incomplete actions during streaming
                if (!action.action || !action.rationale) {
                  return null;
                }

                return (
                  <motion.div
                    key={action.action}
                    {...animationVariants.actionFade}
                  >
                    <Card
                      className={cn(
                        glassCard('medium'),
                        'border cursor-pointer group',
                        isStreaming && 'opacity-50 cursor-not-allowed',
                      )}
                      onClick={() => !isStreaming && onActionClick?.(action)}
                      role="button"
                      tabIndex={isStreaming ? -1 : 0}
                      onKeyDown={(e) => {
                        if (!isStreaming && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          onActionClick?.(action);
                        }
                      }}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-start gap-2.5">
                          <Sparkles className="size-4 shrink-0 mt-0.5 text-primary" />
                          <div className="flex-1 min-w-0 space-y-2.5">
                            <div className="space-y-1.5">
                              <p className="text-sm font-semibold leading-snug text-foreground break-words">
                                {action.action}
                              </p>
                              <p className="text-xs leading-relaxed text-muted-foreground break-words">
                                {action.rationale}
                              </p>
                            </div>

                            {(action.suggestedMode || (action.suggestedModels && action.suggestedModels.length > 0)) && (
                              <div className="flex flex-col gap-2 pt-1.5 border-t border-border/30">
                                {action.suggestedMode && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                                      Mode
                                    </span>
                                    <Badge variant="outline" className="text-xs">
                                      {action.suggestedMode}
                                    </Badge>
                                  </div>
                                )}
                                {action.suggestedModels && action.suggestedModels.length > 0 && (
                                  <div className="flex flex-col gap-1.5">
                                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                                      Suggested Models
                                    </span>
                                    <div className="flex flex-wrap gap-2">
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
                          <ChevronRight className="size-4 shrink-0 text-muted-foreground/50 group-hover:text-muted-foreground group-hover:translate-x-0.5 transition-all" />
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          </AnalysisSection>
        </>
      )}
    </div>
  );
}
