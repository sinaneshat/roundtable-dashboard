'use client';

/**
 * SkillsComparisonChart Component
 *
 * ✅ SHADCN RADAR CHART PATTERN:
 * - Follows @shadcn/chart-radar-multiple example
 * - Horizontal layout matching LeaderboardCard pattern
 * - Participants list on left with ScrollArea, radar chart on right
 * - Multiple overlapping Radar series for participant comparison
 *
 * Reference: @shadcn/chart-radar-multiple + LeaderboardCard layout
 */

import chroma from 'chroma-js';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { PolarAngleAxis, PolarGrid, Radar, RadarChart } from 'recharts';

import type { ParticipantAnalysis } from '@/api/routes/chat/schema';
import type { ChartConfig } from '@/components/ui/chart';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { useModelsQuery } from '@/hooks/queries/models';
import { getAvatarPropsFromModelId } from '@/lib/utils/ai-display';

type SkillsComparisonChartProps = {
  participants: ParticipantAnalysis[];
};

/**
 * SkillsComparisonChart - Radar/spider chart comparing participant skills
 *
 * Visualizes skills matrix as a radar chart where each participant
 * is represented as a colored layer showing their ratings.
 *
 * Layout pattern matches LeaderboardCard:
 * - Left: Participant list with avatars and names in ScrollArea
 * - Right: Radar chart with color-coded skill comparison
 */
export function SkillsComparisonChart({ participants }: SkillsComparisonChartProps) {
  const t = useTranslations('moderator');

  // ✅ SINGLE SOURCE OF TRUTH: Fetch models from backend
  const { data: modelsData } = useModelsQuery();
  const allModels = modelsData?.data?.items || [];

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

  // Configure chart colors and labels - using hsl() format like shadcn examples
  const chartConfig = participants.reduce(
    (config, participant, index) => {
      const key = `participant${participant?.participantIndex ?? index}`;
      const color = vibrantColors[index] ?? vibrantColors[0]!;

      config[key] = {
        label: participant?.modelName ?? 'Unknown',
        color, // Already in hex format, will work with var()
      };

      return config;
    },
    {} as Record<string, { label: string; color: string }>,
  ) satisfies ChartConfig;

  // Prepare participant data for legend
  const participantData = participants.map((participant, index) => {
    const avatarProps = getAvatarPropsFromModelId('assistant', participant?.modelId ?? '');
    const model = allModels.find(m => m.id === participant?.modelId);

    return {
      participantIndex: participant?.participantIndex ?? index,
      modelId: participant?.modelId ?? '',
      modelName: avatarProps.name,
      provider: model?.provider ?? '',
      avatarSrc: avatarProps.src,
      avatarName: avatarProps.name,
      color: vibrantColors[index] ?? vibrantColors[0]!,
    };
  });

  // ✅ DEBUG: Log chart data to verify structure
  console.log('[SkillsComparisonChart] Rendering with data:', {
    participants: participants.length,
    skillNames,
    chartData,
    chartConfig,
    participantData,
    chartConfigKeys: Object.keys(chartConfig),
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="space-y-3"
    >
      {/* Header */}
      <h3 className="text-sm font-semibold px-1">{t('skillsComparison')}</h3>

      {/* Participant Legend - Centered and responsive */}
      <div className="flex flex-wrap justify-center gap-2 px-1">
        {participantData.map((entry) => {
          return (
            <div
              key={`legend-${entry.participantIndex}`}
              className="flex items-center gap-2 px-2 py-1 rounded-full bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              {/* Color Indicator */}
              <div
                className="size-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: entry.color }}
              />

              {/* Avatar */}
              <img
                src={entry.avatarSrc}
                alt={entry.avatarName}
                className="size-4 flex-shrink-0 object-contain"
              />

              {/* Model Name */}
              <p className="text-[10px] font-medium text-foreground/90 whitespace-nowrap">
                {entry.modelName}
              </p>
            </div>
          );
        })}
      </div>

      {/* Radar Chart - Following exact shadcn pattern */}
      <ChartContainer
        config={chartConfig}
        className="mx-auto aspect-square max-h-[250px]"
      >
        <RadarChart data={chartData}>
          <ChartTooltip
            cursor={false}
            content={<ChartTooltipContent indicator="line" />}
          />
          <PolarAngleAxis dataKey="skill" />
          <PolarGrid />
          {participants.map((participant, index) => {
            const key = `participant${participant?.participantIndex ?? index}`;
            const fillOpacity = index === 0 ? 0.6 : 0.3;

            return (
              <Radar
                key={key}
                dataKey={key}
                fill={`var(--color-${key})`}
                fillOpacity={fillOpacity}
              />
            );
          })}
        </RadarChart>
      </ChartContainer>
    </motion.div>
  );
}
