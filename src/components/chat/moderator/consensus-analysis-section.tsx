'use client';

import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { AgreementStatuses } from '@/api/core/enums';
import type { ConsensusAnalysis } from '@/api/routes/chat/schema';
import type { ChartConfig } from '@/components/ui/chart';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
} from '@/components/ui/chart';

import { getAgreementIcon } from './moderator-ui-utils';

type ConsensusAnalysisSectionProps = {
  analysis: ConsensusAnalysis;
  isStreaming?: boolean;
};

/**
 * ConsensusAnalysisSection - Multi-AI Deliberation Framework
 *
 * Displays consensus patterns with simplified layout:
 * - Alignment summary
 * - Agreement matrix (simplified)
 * - Argument strength radar chart
 */
export function ConsensusAnalysisSection({
  analysis,
  isStreaming: _isStreaming = false,
}: ConsensusAnalysisSectionProps) {
  const t = useTranslations('moderator');

  if (!analysis) {
    return null;
  }

  const { alignmentSummary, agreementHeatmap, argumentStrengthProfile } = analysis;

  // Build radar data
  const metrics = ['Logic', 'Risk', 'Creativity', 'Consensus', 'Evidence'];
  const fullRadarData = argumentStrengthProfile
    ? metrics.map((metric) => {
        const dataPoint: Record<string, string | number> = { metric };
        Object.entries(argumentStrengthProfile).forEach(([role, profile]) => {
          const metricKey = metric.toLowerCase();
          if (metricKey === 'logic')
            dataPoint[role] = profile.logic;
          else if (metricKey === 'risk')
            dataPoint[role] = profile.riskAwareness;
          else if (metricKey === 'creativity')
            dataPoint[role] = profile.creativity;
          else if (metricKey === 'consensus')
            dataPoint[role] = profile.consensus;
          else if (metricKey === 'evidence')
            dataPoint[role] = profile.evidence;
        });
        return dataPoint;
      })
    : [];

  // Chart config using shadcn CSS variables
  const chartColors = [
    'var(--chart-1)',
    'var(--chart-2)',
    'var(--chart-3)',
    'var(--chart-4)',
    'var(--chart-5)',
  ];
  const chartConfig: ChartConfig = argumentStrengthProfile
    ? Object.keys(argumentStrengthProfile).reduce((acc, role, index) => {
        acc[role] = { label: role, color: chartColors[index % chartColors.length] };
        return acc;
      }, {} as ChartConfig)
    : {};

  const contributors = agreementHeatmap && agreementHeatmap.length > 0
    ? Object.keys(agreementHeatmap[0]?.perspectives || {})
    : [];

  return (
    <div className="space-y-4">
      {/* Alignment Summary */}
      <div className="text-sm">
        <span className="text-muted-foreground">Alignment: </span>
        <span className="font-medium">
          {alignmentSummary.majorAlignment}
          {' '}
          of
          {' '}
          {alignmentSummary.totalClaims}
          {' '}
          claims
        </span>
        {alignmentSummary.contestedClaims > 0 && (
          <span className="text-amber-500 ml-2">
            <AlertTriangle className="inline size-3.5 -mt-0.5 mr-1" />
            {alignmentSummary.contestedClaims}
            {' '}
            contested
          </span>
        )}
      </div>

      {/* Contested Claims */}
      {alignmentSummary.contestedClaimsList && alignmentSummary.contestedClaimsList.length > 0 && (
        <div className="space-y-1.5">
          {alignmentSummary.contestedClaimsList.map((contested, contestedIndex) => (
            <div key={`contested-${contestedIndex}`} className="flex items-start gap-2 text-sm">
              <AlertTriangle className="size-3.5 mt-0.5 shrink-0 text-amber-500" />
              <span className="text-muted-foreground">{contested.claim}</span>
            </div>
          ))}
        </div>
      )}

      {/* Agreement Matrix - Simplified */}
      {agreementHeatmap && agreementHeatmap.length > 0 && contributors.length > 0 && (
        <div className="space-y-2">
          <span className="text-sm font-medium">{t('consensusAnalysis.agreementHeatmap')}</span>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Claim</th>
                  {contributors.map(contributor => (
                    <th key={contributor} className="text-center py-2 px-2 text-muted-foreground font-medium">
                      {contributor}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {agreementHeatmap.map((row, rowIndex) => (
                  <tr key={`heatmap-row-${rowIndex}`} className="border-b border-border/50">
                    <td className="py-2 pr-4 text-foreground/80">{row.claim}</td>
                    {contributors.map((contributor) => {
                      const status = row.perspectives[contributor] ?? AgreementStatuses.AGREE;
                      return (
                        <td key={`${rowIndex}-${contributor}`} className="py-2 px-2">
                          <div className="flex justify-center items-center">
                            {getAgreementIcon(status)}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Argument Strength Radar */}
      {argumentStrengthProfile && Object.keys(argumentStrengthProfile).length > 0 && (
        <div className="space-y-2">
          <span className="text-sm font-medium">{t('consensusAnalysis.argumentStrength')}</span>
          <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[280px]">
            <RadarChart data={fullRadarData}>
              <PolarGrid className="stroke-border/30" />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              {Object.keys(argumentStrengthProfile).map((role, index) => (
                <Radar
                  key={role}
                  dataKey={role}
                  fill={chartColors[index % chartColors.length]}
                  fillOpacity={0.2}
                  stroke={chartColors[index % chartColors.length]}
                  strokeWidth={1.5}
                />
              ))}
              <ChartLegend content={<ChartLegendContent />} />
            </RadarChart>
          </ChartContainer>
        </div>
      )}
    </div>
  );
}
