'use client';

/**
 * SkillsComparisonChart Component
 *
 * ✅ SHADCN RADAR CHART PATTERN:
 * - Follows @shadcn/chart-radar-multiple example
 * - Fixed-size container with proper aspect ratio
 * - Multiple overlapping Radar series for participant comparison
 *
 * Reference: @shadcn/chart-radar-multiple
 */

import chroma from 'chroma-js';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { PolarAngleAxis, PolarGrid, Radar, RadarChart } from 'recharts';

import type { ParticipantAnalysis } from '@/api/routes/chat/schema';
import type { ChartConfig } from '@/components/ui/chart';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';

type SkillsComparisonChartProps = {
  participants: ParticipantAnalysis[];
};

/**
 * SkillsComparisonChart - Radar/spider chart comparing participant skills
 *
 * Visualizes skills matrix as a radar chart where each participant
 * is represented as a colored layer showing their ratings.
 */
export function SkillsComparisonChart({ participants }: SkillsComparisonChartProps) {
  const t = useTranslations('moderator');

  // Generate vibrant colors for each participant
  const vibrantColors = useMemo(() => {
    const colorCount = participants.length;
    if (colorCount === 0)
      return [];

    const scale = chroma
      .scale([
        '#2563eb', // Primary Blue
        '#f59e0b', // Warm Amber
        '#8b5cf6', // Soft Purple
        '#06b6d4', // Soft Cyan
        '#84cc16', // Soft Lime
        '#ec4899', // Soft Rose
        '#64748b', // Slate Gray
        '#3b82f6', // Accent Blue
      ])
      .mode('lch')
      .colors(colorCount);

    return scale;
  }, [participants.length]);

  if (participants.length === 0) {
    return null;
  }

  // Extract skill names from first participant
  const skillNames = (participants[0]?.skillsMatrix?.map(s => s?.skillName).filter((name): name is string => Boolean(name)) || []) as string[];

  if (skillNames.length === 0) {
    return (
      <div className="space-y-3 p-4 border border-dashed border-muted-foreground/20 rounded-lg">
        <h3 className="text-sm font-semibold px-1">{t('skillsComparison')}</h3>
        <p className="text-xs text-muted-foreground italic">
          No skills data available for comparison
        </p>
      </div>
    );
  }

  // Transform data for Recharts - one object per skill with all participant ratings
  const chartData = skillNames.map((skillName) => {
    const dataPoint: Record<string, string | number> = { skill: skillName };

    participants.forEach((participant) => {
      const skill = participant?.skillsMatrix?.find(s => s?.skillName === skillName);
      const participantIndex = participant?.participantIndex ?? 0;
      dataPoint[`participant${participantIndex}`] = skill?.rating ?? 0;
    });

    return dataPoint;
  });

  // Configure chart colors and labels
  const chartConfig = participants.reduce(
    (config, participant, index) => {
      const key = `participant${participant?.participantIndex ?? index}`;
      const color = vibrantColors[index] ?? vibrantColors[0]!;

      config[key] = {
        label: participant?.modelName ?? 'Unknown',
        color,
      };

      return config;
    },
    {} as Record<string, { label: string; color: string }>,
  ) satisfies ChartConfig;

  return (
    <div className="space-y-3 pb-0">
      {/* Header */}
      <h3 className="text-sm font-semibold px-1">{t('skillsComparison')}</h3>

      {/* Chart Container - Following shadcn pattern */}
      <div className="pb-0">
        <ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square max-h-[250px] w-full"
        >
          <RadarChart
            data={chartData}
            margin={{
              top: -40,
              right: 0,
              bottom: -10,
              left: 0,
            }}
          >
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator="line" />}
            />
            <PolarAngleAxis dataKey="skill" />
            <PolarGrid />
            {participants.map((participant, index) => {
              const key = `participant${participant?.participantIndex ?? index}`;
              const color = vibrantColors[index] ?? vibrantColors[0]!;

              return (
                <Radar
                  key={key}
                  dataKey={key}
                  fill={color}
                  fillOpacity={0.6}
                  stroke={color}
                  strokeWidth={2}
                />
              );
            })}
            <ChartLegend className="mt-8" content={<ChartLegendContent />} />
          </RadarChart>
        </ChartContainer>
      </div>
    </div>
  );
}
