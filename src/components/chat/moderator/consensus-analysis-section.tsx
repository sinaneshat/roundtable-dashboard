'use client';

import { AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';
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

/**
 * Radar chart data point type for argument strength visualization.
 * Recharts requires dynamic keys for each data series, so index signature is
 * necessary to allow role names as keys dynamically added from argumentStrengthProfile.
 * The 'metric' field is the category axis label; role name keys hold numeric scores.
 *
 * Example: { metric: 'Logic', 'The Ideator': 85, 'The Critic': 72 }
 */
type RadarDataPoint = {
  metric: string;
  [roleKey: string]: string | number;
};

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
 * Items animate in top-to-bottom order with 40ms stagger.
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

  // Metric keys mapping to schema fields and translation keys
  const metricConfig = [
    { key: 'logic', field: 'logic' as const },
    { key: 'evidence', field: 'evidence' as const },
    { key: 'riskAwareness', field: 'riskAwareness' as const },
    { key: 'consensus', field: 'consensus' as const },
    { key: 'creativity', field: 'creativity' as const },
  ];

  // Build radar data dynamically from argumentStrengthProfile
  const fullRadarData = argumentStrengthProfile && Object.keys(argumentStrengthProfile).length > 0
    ? metricConfig.map(({ key, field }) => {
        const dataPoint: RadarDataPoint = { metric: t(`consensusAnalysis.profile${key.charAt(0).toUpperCase() + key.slice(1)}`) };
        Object.entries(argumentStrengthProfile).forEach(([role, profile]) => {
          dataPoint[role] = profile[field];
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

  // Build chart config using Object.fromEntries for type-safe construction
  const chartConfig = argumentStrengthProfile
    ? Object.fromEntries(
      Object.keys(argumentStrengthProfile).map((role, index) => [
        role,
        { label: role, color: chartColors[index % chartColors.length] },
      ]),
    ) satisfies ChartConfig
    : ({} satisfies ChartConfig);

  const contributors = agreementHeatmap && agreementHeatmap.length > 0
    ? Object.keys(agreementHeatmap[0]?.perspectives || {})
    : [];

  // Only render if we have alignment data
  const hasAlignmentData = alignmentSummary && alignmentSummary.totalClaims > 0;
  const hasAgreementData = agreementHeatmap && agreementHeatmap.length > 0;
  const hasStrengthData = argumentStrengthProfile && Object.keys(argumentStrengthProfile).length > 0;

  // Don't render if no data
  if (!hasAlignmentData && !hasAgreementData && !hasStrengthData) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Alignment Summary - only if data exists */}
      {hasAlignmentData && (
        <div className="text-sm">
          <span className="text-muted-foreground">
            {t('consensusAnalysis.alignmentSummary')}
            :
            {' '}
          </span>
          <span className="font-medium">
            {alignmentSummary.majorAlignment}
            {' '}
            /
            {alignmentSummary.totalClaims}
            {' '}
            {t('consensusAnalysis.totalClaims').toLowerCase()}
          </span>
          {alignmentSummary.contestedClaims > 0 && (
            <span className="text-amber-500 ml-2">
              <AlertTriangle className="inline size-3.5 -mt-0.5 mr-1" />
              {alignmentSummary.contestedClaims}
              {' '}
              {t('consensusAnalysis.contested').toLowerCase()}
            </span>
          )}
        </div>
      )}

      {/* Contested Claims */}
      {alignmentSummary.contestedClaimsList && alignmentSummary.contestedClaimsList.length > 0 && (
        <div className="space-y-1.5">
          {alignmentSummary.contestedClaimsList.map((contested, index) => (
            <motion.div
              key={contested.claim}
              className="flex items-start gap-2 text-sm"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.2,
                delay: index * 0.04,
                ease: 'easeOut',
              }}
            >
              <AlertTriangle className="size-3.5 mt-0.5 shrink-0 text-amber-500" />
              <span className="text-muted-foreground">{contested.claim}</span>
            </motion.div>
          ))}
        </div>
      )}

      {/* Agreement Matrix - only if data exists */}
      {hasAgreementData && contributors.length > 0 && (
        <div className="space-y-2">
          <span className="text-sm font-medium">{t('consensusAnalysis.agreementHeatmap')}</span>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4 text-muted-foreground font-medium">{t('consensusAnalysis.claim')}</th>
                  {contributors.map(contributor => (
                    <th key={contributor} className="text-center py-2 px-2 text-muted-foreground font-medium">
                      {contributor}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {agreementHeatmap.map((row, rowIndex) => (
                  <motion.tr
                    key={row.claim}
                    className="border-b border-border/50"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.2,
                      delay: rowIndex * 0.04,
                      ease: 'easeOut',
                    }}
                  >
                    <td className="py-2 pr-4 text-foreground/80">{row.claim}</td>
                    {contributors.map((contributor) => {
                      const status = row.perspectives[contributor] ?? AgreementStatuses.AGREE;
                      return (
                        <td key={`${row.claim}-${contributor}`} className="py-2 px-2">
                          <div className="flex justify-center items-center">
                            {getAgreementIcon(status)}
                          </div>
                        </td>
                      );
                    })}
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Argument Strength Radar - only if data exists */}
      {hasStrengthData && fullRadarData.length > 0 && (
        <div className="space-y-2">
          <span className="text-sm font-medium">{t('consensusAnalysis.argumentStrength')}</span>
          {/* Mobile-optimized chart container with responsive sizing */}
          <ChartContainer
            config={chartConfig}
            className="mx-auto aspect-square w-full max-w-[240px] sm:max-w-[280px] max-h-[240px] sm:max-h-[280px]"
          >
            <RadarChart data={fullRadarData}>
              <PolarGrid className="stroke-border/30" />
              {/* Responsive font size for axis labels */}
              <PolarAngleAxis
                dataKey="metric"
                tick={{ fontSize: 10, className: 'sm:text-[11px]' }}
                tickLine={false}
              />
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
              <ChartLegend content={<ChartLegendContent className="text-[10px] sm:text-xs" />} />
            </RadarChart>
          </ChartContainer>
        </div>
      )}
    </div>
  );
}
