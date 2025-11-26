'use client';

import {
  FileText,
  GitBranch,
  Info,
  Lightbulb,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { AnalysisStatuses } from '@/api/core/enums';
import type { Recommendation, StoredModeratorAnalysis } from '@/api/routes/chat/schema';
import { hasAnalysisData } from '@/lib/utils/analysis-utils';

import { AboutFrameworkSection } from './about-framework-section';
import { AlternativesSection } from './alternatives-section';
import { CollapsibleSection } from './collapsible-section';
import { ConsensusAnalysisSection } from './consensus-analysis-section';
import { ContributorPerspectivesSection } from './contributor-perspectives-section';
import { EvidenceReasoningSection } from './evidence-reasoning-section';
import { KeyInsightsSection } from './key-insights-section';
import { RoundOutcomeHeader } from './round-outcome-header';
import { RoundSummarySection } from './round-summary-section';

type ModeratorAnalysisPanelProps = {
  analysis: StoredModeratorAnalysis;
  onActionClick?: (action: Recommendation) => void;
};

export function ModeratorAnalysisPanel({
  analysis,
  onActionClick,
}: ModeratorAnalysisPanelProps) {
  const t = useTranslations('moderator');

  if (analysis.status === AnalysisStatuses.PENDING || analysis.status === AnalysisStatuses.STREAMING) {
    return null;
  }

  if (analysis.status === AnalysisStatuses.FAILED) {
    return (
      <div className="flex items-center gap-2 py-2 text-sm text-destructive">
        <span className="size-1.5 rounded-full bg-destructive/80" />
        <span>{analysis.errorMessage || t('errorAnalyzing')}</span>
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
  const claimsInfo = data.consensusAnalysis?.alignmentSummary;
  const evidenceCount = data.evidenceAndReasoning?.evidenceCoverage?.length ?? 0;
  const alternativeCount = data.alternatives?.length ?? 0;

  return (
    <div className="space-y-4">
      {/* Round Outcome Header */}
      <RoundOutcomeHeader
        roundConfidence={data.roundConfidence}
        confidenceWeighting={data.confidenceWeighting}
        consensusEvolution={data.consensusEvolution}
        contributors={data.contributorPerspectives}
      />

      {/* Collapsible Sections */}
      <div className="space-y-1">
        {/* Key Insights & Recommendations */}
        {(data.summary || (data.recommendations && data.recommendations.length > 0)) && (
          <CollapsibleSection
            icon={<Lightbulb className="size-4" />}
            title={t('keyInsights.title')}
            subtitle={recommendationCount > 0 ? t('keyInsights.insightsIdentified', { count: recommendationCount }) : undefined}
            defaultOpen
          >
            <KeyInsightsSection
              summary={data.summary}
              recommendations={data.recommendations}
              onActionClick={onActionClick}
            />
          </CollapsibleSection>
        )}

        {/* Contributor Perspectives */}
        {data.contributorPerspectives && data.contributorPerspectives.length > 0 && (
          <CollapsibleSection
            icon={<Users className="size-4" />}
            title={t('contributorPerspectives.title')}
            subtitle={`${data.contributorPerspectives.map(p => p.modelName).join(', ')} — ${data.roundConfidence ?? 0}% convergence`}
          >
            <ContributorPerspectivesSection perspectives={data.contributorPerspectives} />
          </CollapsibleSection>
        )}

        {/* Consensus Analysis */}
        {data.consensusAnalysis && (
          <CollapsibleSection
            icon={<TrendingUp className="size-4" />}
            title={t('consensusAnalysis.title')}
            subtitle={claimsInfo ? `${claimsInfo.majorAlignment} of ${claimsInfo.totalClaims} claims reached consensus` : undefined}
          >
            <ConsensusAnalysisSection analysis={data.consensusAnalysis} />
          </CollapsibleSection>
        )}

        {/* Evidence & Reasoning */}
        {data.evidenceAndReasoning && (
          <CollapsibleSection
            icon={<FileText className="size-4" />}
            title={t('evidenceReasoning.title')}
            subtitle={evidenceCount > 0 ? `Evidence covers ${evidenceCount} major claims` : undefined}
          >
            <EvidenceReasoningSection evidenceAndReasoning={data.evidenceAndReasoning} />
          </CollapsibleSection>
        )}

        {/* Explore Alternatives */}
        {data.alternatives && data.alternatives.length > 0 && (
          <CollapsibleSection
            icon={<GitBranch className="size-4" />}
            title={t('alternatives.title')}
            subtitle={`${alternativeCount} alternative scenarios modeled`}
          >
            <AlternativesSection alternatives={data.alternatives} />
          </CollapsibleSection>
        )}

        {/* Round Summary */}
        {data.roundSummary && (
          <CollapsibleSection
            icon={<FileText className="size-4" />}
            title={t('roundSummary.title')}
            subtitle={t('roundSummary.closingSynthesis')}
          >
            <RoundSummarySection roundSummary={data.roundSummary} onActionClick={onActionClick} />
          </CollapsibleSection>
        )}

        {/* About This Framework */}
        <CollapsibleSection
          icon={<Info className="size-4" />}
          title={t('aboutFramework.title')}
        >
          <AboutFrameworkSection />
        </CollapsibleSection>
      </div>
    </div>
  );
}
