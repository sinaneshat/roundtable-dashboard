'use client';

import { motion } from 'framer-motion';
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  GitBranch,
  Lightbulb,
  ListChecks,
  Scale,
  Target,
  Users,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { RecommendedAction, RoundSummary } from '@/api/routes/chat/schema';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { extractModelName, getModelIconInfo } from '@/lib/utils/ai-display';

type RoundSummarySectionProps = {
  roundSummary: Partial<RoundSummary>;
  onActionClick?: (action: RecommendedAction) => void;
  isStreaming?: boolean;
};

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: [0.4, 0, 0.2, 1] as const },
};

const staggerChildren = {
  animate: { transition: { staggerChildren: 0.05 } },
};

const itemFade = {
  initial: { opacity: 0, x: -10 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.3 } },
};

type ModelSuggestionBadgeProps = {
  modelId: string;
  role?: string;
};

function ModelSuggestionBadge({ modelId, role }: ModelSuggestionBadgeProps) {
  const { icon, providerName } = getModelIconInfo(modelId);
  const modelName = extractModelName(modelId);

  return (
    <div className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-2 py-1.5">
      <Avatar className="size-5 flex-shrink-0">
        <AvatarImage src={icon} alt={modelName} />
        <AvatarFallback className="text-[10px]">
          {providerName.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-xs font-medium truncate">{modelName}</span>
        {role && (
          <span className="text-[10px] text-muted-foreground truncate">
            Role:
            {' '}
            {role}
          </span>
        )}
      </div>
    </div>
  );
}

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
        <motion.div {...fadeInUp} className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Lightbulb className="size-4" />
            {t('keyInsights')}
          </h3>
          <motion.ul className="space-y-2" variants={staggerChildren} initial="initial" animate="animate">
            {keyInsights.map(insight => (
              <motion.li
                key={insight}
                variants={itemFade}
                className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground"
              >
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                <span>{insight}</span>
              </motion.li>
            ))}
          </motion.ul>
        </motion.div>
      )}

      {/* Consensus Points */}
      {consensusPoints && consensusPoints.length > 0 && (
        <motion.div {...fadeInUp} className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <ListChecks className="size-4" />
            {t('consensusPoints')}
          </h3>
          <motion.ul className="space-y-2" variants={staggerChildren} initial="initial" animate="animate">
            {consensusPoints.map(point => (
              <motion.li
                key={point}
                variants={itemFade}
                className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground"
              >
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                <span>{point}</span>
              </motion.li>
            ))}
          </motion.ul>
        </motion.div>
      )}

      {/* Divergent Approaches */}
      {divergentApproaches && divergentApproaches.length > 0 && (
        <motion.div {...fadeInUp} className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <GitBranch className="size-4" />
            {t('divergentApproaches')}
          </h3>
          <div className="space-y-4">
            {divergentApproaches.map((approach, approachIdx) => (
              <div key={approach.topic || `approach-${approachIdx}`} className="space-y-2">
                {approach.topic && (
                  <h4 className="text-sm font-medium">{approach.topic}</h4>
                )}
                {approach.perspectives && approach.perspectives.length > 0 && (
                  <ul className="space-y-1.5 pl-4">
                    {approach.perspectives.map(perspective => (
                      <li key={perspective} className="text-sm leading-relaxed text-muted-foreground">
                        •
                        {' '}
                        {perspective}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Comparative Analysis */}
      {comparativeAnalysis && (
        <motion.div {...fadeInUp} className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Scale className="size-4" />
            {t('comparativeAnalysis')}
          </h3>
          <div className="space-y-4">
            {comparativeAnalysis.strengthsByCategory && comparativeAnalysis.strengthsByCategory.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium">{t('strengthsByCategory')}</h4>
                <div className="space-y-2">
                  {comparativeAnalysis.strengthsByCategory.map((strength, strengthIdx) => (
                    <div key={strength.category || `strength-${strengthIdx}`} className="flex flex-wrap items-center gap-2">
                      {strength.category && (
                        <span className="text-sm font-medium">
                          {strength.category}
                          :
                        </span>
                      )}
                      {strength.participants && strength.participants.length > 0 && strength.participants.map(participant => (
                        <Badge key={participant} variant="outline" className="text-xs">
                          {participant}
                        </Badge>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {comparativeAnalysis.tradeoffs && comparativeAnalysis.tradeoffs.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">{t('tradeoffs')}</h4>
                <ul className="space-y-1.5">
                  {comparativeAnalysis.tradeoffs.map(tradeoff => (
                    <li key={tradeoff} className="text-sm text-muted-foreground">
                      •
                      {' '}
                      {tradeoff}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Decision Framework */}
      {decisionFramework && (
        <motion.div {...fadeInUp} className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Target className="size-4" />
            {t('decisionFramework')}
          </h3>
          <div className="space-y-4">
            {decisionFramework.criteriaToConsider && decisionFramework.criteriaToConsider.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">{t('criteriaToConsider')}</h4>
                <ul className="space-y-1.5">
                  {decisionFramework.criteriaToConsider.map(criteria => (
                    <li key={criteria} className="text-sm text-muted-foreground">
                      •
                      {' '}
                      {criteria}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {decisionFramework.scenarioRecommendations && decisionFramework.scenarioRecommendations.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium">{t('scenarioRecommendations')}</h4>
                {decisionFramework.scenarioRecommendations.map((scenario, scenarioIdx) => (
                  <div key={scenario.scenario || `scenario-${scenarioIdx}`} className="space-y-1.5 rounded-lg bg-purple-500/10 p-3">
                    {scenario.scenario && (
                      <p className="text-sm font-medium text-purple-400">{scenario.scenario}</p>
                    )}
                    {scenario.recommendation && (
                      <p className="text-sm text-muted-foreground">{scenario.recommendation}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Overall Summary */}
      {overallSummary && (
        <motion.div {...fadeInUp} className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="size-4" />
            {t('summary')}
          </h3>
          <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {overallSummary}
          </p>
        </motion.div>
      )}

      {/* Conclusion */}
      {conclusion && (
        <motion.div {...fadeInUp} className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-primary">
            <ArrowRight className="size-4" />
            {t('conclusion')}
          </h3>
          <p className="whitespace-pre-line text-sm leading-relaxed">
            {conclusion}
          </p>
        </motion.div>
      )}

      {/* Recommended Actions */}
      {recommendedActions && recommendedActions.length > 0 && (
        <motion.div {...fadeInUp} className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Users className="size-4" />
            {t('recommendedActions')}
          </h3>
          <div className="space-y-2">
            {recommendedActions.map((action) => {
              // Skip incomplete actions during streaming
              if (!action.action || !action.rationale) {
                return null;
              }

              return (
                <motion.div
                  key={action.action}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                >
                  <Button
                    variant="ghost"
                    className="h-auto w-full justify-start gap-3 p-4 text-left border-0 transition-all hover:bg-muted/50"
                    onClick={() => onActionClick?.(action)}
                    disabled={isStreaming}
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <p className="text-sm font-medium leading-snug break-words whitespace-normal">
                        {action.action}
                      </p>
                      <p className="text-xs leading-relaxed text-muted-foreground break-words whitespace-normal">
                        {action.rationale}
                      </p>
                      {(action.suggestedMode || (action.suggestedModels && action.suggestedModels.length > 0)) && (
                        <div className="flex flex-col gap-2 pt-1">
                          {action.suggestedMode && (
                            <Badge variant="outline" className="text-xs w-fit">
                              Mode:
                              {' '}
                              {action.suggestedMode}
                            </Badge>
                          )}
                          {action.suggestedModels && action.suggestedModels.length > 0 && (
                            <div className="flex flex-col gap-1.5">
                              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                                Suggested Models
                              </span>
                              {action.suggestedModels.map((modelId, index) => {
                                const role = action.suggestedRoles?.[index];
                                return (
                                  <ModelSuggestionBadge key={modelId} modelId={modelId} role={role} />
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </Button>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}
    </div>
  );
}
