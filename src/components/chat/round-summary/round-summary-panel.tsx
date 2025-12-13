'use client';

import {
  AlertTriangle,
  CheckCircle2,
  GitMerge,
  Info,
  Lightbulb,
  Users,
  XCircle,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { AnalysisStatuses } from '@/api/core/enums';
import type { ArticleRecommendation, StoredModeratorAnalysis } from '@/api/routes/chat/schema';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { extractModelName, getModelIconInfo } from '@/lib/utils/ai-display';
import { hasAnalysisData } from '@/lib/utils/analysis-utils';
import { getRoleBadgeStyle } from '@/lib/utils/role-colors';

import { CollapsibleSection } from './collapsible-section';
import { KeyInsightsSection } from './key-insights-section';
import { RoundOutcomeHeader } from './round-outcome-header';
import { getResolutionBadgeVariant, getStanceIcon } from './round-summary-utils';

/** Section open states for demo mode control */
export type DemoSectionOpenStates = {
  keyInsights?: boolean;
  modelVoices?: boolean;
  consensusTable?: boolean;
  minorityViews?: boolean;
  convergenceDivergence?: boolean;
  aboutFramework?: boolean;
};

type RoundSummaryPanelProps = {
  analysis: StoredModeratorAnalysis;
  onActionClick?: (action: ArticleRecommendation) => void;
  /** Demo mode controlled section open states */
  demoSectionStates?: DemoSectionOpenStates;
};

export function RoundSummaryPanel({
  analysis,
  onActionClick,
  demoSectionStates,
}: RoundSummaryPanelProps) {
  const t = useTranslations('moderator');

  if (analysis.status === AnalysisStatuses.PENDING || analysis.status === AnalysisStatuses.STREAMING) {
    return null;
  }

  if (analysis.status === AnalysisStatuses.FAILED) {
    return (
      <div className="flex items-center gap-2 py-2 text-sm text-destructive">
        <span className="size-1.5 rounded-full bg-destructive/80" />
        <span>{t('errorAnalyzing')}</span>
      </div>
    );
  }

  if (!hasAnalysisData(analysis.analysisData)) {
    return (
      <div className="py-2 text-sm text-destructive">
        {t('errorAnalyzing')}
      </div>
    );
  }

  const data = analysis.analysisData;

  // Calculate counts for subtitles
  const recommendationCount = data.recommendations?.length ?? 0;
  const modelVoicesCount = data.modelVoices?.length ?? 0;
  const consensusTopicCount = data.consensusTable?.length ?? 0;
  const minorityViewCount = data.minorityViews?.length ?? 0;

  return (
    <div className="space-y-4">
      {/* Round Outcome Header - Updated for new schema */}
      <RoundOutcomeHeader
        confidence={data.confidence}
        modelVoices={data.modelVoices}
      />

      {/* Collapsible Sections */}
      <div className="space-y-2">
        {/* Key Insights & Recommendations (Article Summary) */}
        {(data.article || (data.recommendations && data.recommendations.length > 0)) && (
          <CollapsibleSection
            icon={<Lightbulb className="size-4" />}
            title={t('keyInsights.title')}
            subtitle={recommendationCount > 0 ? t('keyInsights.insightsIdentified', { count: recommendationCount }) : undefined}
            defaultOpen
            demoOpen={demoSectionStates?.keyInsights}
          >
            <KeyInsightsSection
              article={data.article}
              recommendations={data.recommendations}
              onActionClick={onActionClick}
            />
          </CollapsibleSection>
        )}

        {/* Model Voices - Chat-style with avatar */}
        {data.modelVoices && data.modelVoices.length > 0 && (
          <CollapsibleSection
            icon={<Users className="size-4" />}
            title={t('modelVoices.title')}
            subtitle={t('modelVoices.contributorCount', { count: modelVoicesCount })}
            demoOpen={demoSectionStates?.modelVoices}
          >
            <div className="space-y-3">
              {data.modelVoices.map((voice) => {
                const { icon, providerName } = getModelIconInfo(voice.modelId);
                const modelName = extractModelName(voice.modelId);
                return (
                  <div key={`voice-${voice.modelId}-${voice.participantIndex}`} className="flex items-start gap-3">
                    <Avatar className="size-8 flex-shrink-0">
                      <AvatarImage src={icon} alt={modelName} />
                      <AvatarFallback className="text-xs">{providerName.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{modelName}</span>
                        {voice.role && (
                          <Badge
                            className="text-[10px] px-1.5 py-0"
                            style={getRoleBadgeStyle(voice.role)}
                          >
                            {voice.role}
                          </Badge>
                        )}
                      </div>
                      {voice.position && (
                        <p className="text-sm text-muted-foreground">{voice.position}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CollapsibleSection>
        )}

        {/* Consensus Table - Compact */}
        {data.consensusTable && data.consensusTable.length > 0 && (
          <CollapsibleSection
            icon={<CheckCircle2 className="size-4" />}
            title={t('consensusTable.title')}
            subtitle={t('consensusTable.topicCount', { count: consensusTopicCount })}
            demoOpen={demoSectionStates?.consensusTable}
          >
            <div className="space-y-3">
              {data.consensusTable.map(entry => (
                <div key={`consensus-${entry.topic}`} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{entry.topic}</span>
                    <Badge
                      variant={getResolutionBadgeVariant(entry.resolution)}
                      className="text-xs"
                    >
                      {entry.resolution}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {entry.positions.map(pos => (
                      <span key={`pos-${entry.topic}-${pos.modelName}`} className="flex items-center gap-1">
                        {getStanceIcon(pos.stance)}
                        <span className="font-medium">{pos.modelName}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* Minority Views - Compact */}
        {data.minorityViews && data.minorityViews.length > 0 && (
          <CollapsibleSection
            icon={<AlertTriangle className="size-4" />}
            title={t('minorityViews.title')}
            subtitle={t('minorityViews.viewCount', { count: minorityViewCount })}
            demoOpen={demoSectionStates?.minorityViews}
          >
            <div className="space-y-2">
              {data.minorityViews.map(view => (
                <div key={`minority-${view.modelName}`} className="flex items-start gap-2 text-sm">
                  <AlertTriangle className="size-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                  <span>
                    <span className="font-medium">
                      {view.modelName}
                      :
                    </span>
                    {' '}
                    <span className="text-muted-foreground">{view.view}</span>
                  </span>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* Convergence/Divergence - Compact */}
        {/* ✅ FIX: Check for actual content, not just truthy object (empty {} would render accordion) */}
        {data.convergenceDivergence && (data.convergenceDivergence.convergedOn?.length || data.convergenceDivergence.divergedOn?.length || data.convergenceDivergence.evolved?.length) && (
          <CollapsibleSection
            icon={<GitMerge className="size-4" />}
            title={t('convergenceDivergence.title')}
            demoOpen={demoSectionStates?.convergenceDivergence}
          >
            <div className="space-y-3 text-sm">
              {data.convergenceDivergence.convergedOn?.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
                  <CheckCircle2 className="size-3.5 text-green-500 flex-shrink-0" />
                  <span className="font-medium text-green-600 dark:text-green-400 mr-1">
                    {t('convergenceDivergence.agreed')}
                    :
                  </span>
                  <span className="text-muted-foreground">
                    {data.convergenceDivergence.convergedOn.join(' • ')}
                  </span>
                </div>
              )}
              {data.convergenceDivergence.divergedOn?.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
                  <XCircle className="size-3.5 text-orange-500 flex-shrink-0" />
                  <span className="font-medium text-orange-600 dark:text-orange-400 mr-1">
                    {t('convergenceDivergence.split')}
                    :
                  </span>
                  <span className="text-muted-foreground">
                    {data.convergenceDivergence.divergedOn.join(' • ')}
                  </span>
                </div>
              )}
              {data.convergenceDivergence.evolved?.length > 0 && (
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">{t('convergenceDivergence.evolved')}</span>
                  {data.convergenceDivergence.evolved.map(evolution => (
                    <div key={`evolved-${evolution.point}`} className="flex items-center gap-1.5 text-xs">
                      <span className="font-medium">
                        {evolution.point}
                        :
                      </span>
                      <span className="text-orange-500">{evolution.initialState}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="text-green-500">{evolution.finalState}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CollapsibleSection>
        )}

        {/* About This Framework */}
        <CollapsibleSection
          icon={<Info className="size-4" />}
          title={t('aboutFramework.title')}
          demoOpen={demoSectionStates?.aboutFramework}
        >
          <div className="text-sm text-muted-foreground space-y-2">
            <p>
              This analysis synthesizes perspectives from
              {modelVoicesCount}
              {' '}
              AI models participating in a collaborative
              {analysis.mode}
              {' '}
              discussion.
            </p>
            <p>The consensus table shows where models agreed and disagreed, while minority views highlight important dissenting opinions that may warrant further consideration.</p>
          </div>
        </CollapsibleSection>
      </div>
    </div>
  );
}
