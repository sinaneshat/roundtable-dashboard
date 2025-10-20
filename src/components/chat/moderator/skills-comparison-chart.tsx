'use client';

/**
 * SkillsComparisonChart Component
 *
 * ✅ ENHANCED RADAR CHART PATTERN:
 * - Borderless design with horizontal layout
 * - ScrollArea legend on left, radar chart on right
 * - Vibrant, see-through colors using chroma-js for distinctive overlapping visualization
 * - Multiple overlapping Radar series for participant comparison
 * - Space-efficient horizontal layout
 *
 * ✅ COLOR GENERATION:
 * - Uses chroma.js for vibrant, distinctive color palette
 * - HSL color space for better perceptual distribution
 * - 30% opacity for see-through overlapping effect
 *
 * ✅ RECHARTS V3 PATTERNS:
 * - Uses RadarChart with PolarGrid and PolarAngleAxis
 * - Multiple Radar series with transparent fill for overlap visibility
 *
 * Reference: @shadcn/chart-radar-multiple, @shadcn/scroll-area
 */

import chroma from 'chroma-js';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { PolarAngleAxis, PolarGrid, Radar, RadarChart } from 'recharts';

import type { ChartConfig } from '@/components/ui/chart';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { ScrollArea } from '@/components/ui/scroll-area';

type ParticipantSkills = {
  participantIndex: number;
  modelId?: string;
  modelName: string;
  skillsMatrix: Array<{
    skillName: string;
    rating: number;
  }>;
};

type SkillsComparisonChartProps = {
  participants: ParticipantSkills[];
};

/**
 * SkillsComparisonChart - Radar/spider chart comparing participant skills
 *
 * Visualizes skills matrix as a radar chart where each participant
 * is represented as a vibrant, see-through colored layer showing their ratings.
 * Horizontal layout: scrollable legend (left) + radar chart (right).
 *
 * @param props - Component props
 * @param props.participants - Array of participant skill data
 */
export function SkillsComparisonChart({ participants }: SkillsComparisonChartProps) {
  const t = useTranslations('moderator');

  // ✅ BRAND COLORS: Use design system colors with transparency for overlapping areas
  const vibrantColors = useMemo(() => {
    // Create a color scale using chroma.js with brand-aligned professional colors
    // Transparent colors allow see-through effect when areas overlap
    const colorCount = participants.length;

    if (colorCount === 0)
      return [];

    // Generate colors using chroma.scale with brand-aligned nude tones
    const scale = chroma
      .scale([
        '#2563eb', // Primary Blue
        '#f59e0b', // Warm Amber
        '#64748b', // Slate Gray
        '#3b82f6', // Accent Blue
        '#8b5cf6', // Soft Purple
        '#06b6d4', // Soft Cyan
        '#84cc16', // Soft Lime
        '#ec4899', // Soft Rose
      ])
      .mode('lch') // Use LCH color space for perceptually uniform colors
      .colors(colorCount);

    return scale;
  }, [participants.length]);

  if (participants.length === 0) {
    return null;
  }

  // ✅ AI SDK V5 PATTERN: Handle partial objects with safe access
  const skillNames = (participants[0]?.skillsMatrix?.map(s => s?.skillName).filter((name): name is string => Boolean(name)) || []) as string[];

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

  // ✅ VIBRANT COLOR CONFIG: Use chroma.js generated colors
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
    <div className="space-y-3">
      {/* Header */}
      <h3 className="text-sm font-semibold px-1">{t('skillsComparison')}</h3>

      {/* Horizontal Layout: Legend (left) + Chart (right) */}
      <div className="flex gap-4 items-start w-full">
        {/* Left: ScrollArea Legend */}
        <ScrollArea className="h-[300px] w-full max-w-[240px]">
          <div className="space-y-2 pr-4">
            {participants.map((participant, index) => {
              const key = `participant${participant?.participantIndex ?? index}`;
              const color = vibrantColors[index] ?? vibrantColors[0]!;

              return (
                <div
                  key={key}
                  className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/50 transition-colors"
                >
                  <div
                    className="size-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-xs font-medium text-foreground/90 truncate">
                    {participant?.modelName ?? 'Unknown'}
                  </span>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {/* Right: Radar Chart */}
        <div className="flex-1">
          <ChartContainer
            config={chartConfig}
            className="mx-auto aspect-square max-h-[300px]"
          >
            <RadarChart data={chartData}>
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent indicator="line" />}
              />
              <PolarAngleAxis dataKey="skill" className="text-xs" />
              <PolarGrid strokeDasharray="3 3" className="stroke-muted" />
              {participants.map((participant, index) => {
                const key = `participant${participant?.participantIndex ?? index}`;
                const color = vibrantColors[index] ?? vibrantColors[0]!;

                return (
                  <Radar
                    key={key}
                    dataKey={key}
                    stroke={color}
                    fill={color}
                    fillOpacity={0.3}
                    strokeWidth={2}
                  />
                );
              })}
            </RadarChart>
          </ChartContainer>
        </div>
      </div>
    </div>
  );
}
