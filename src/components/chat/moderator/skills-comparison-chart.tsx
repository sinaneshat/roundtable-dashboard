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
import { ScrollArea } from '@/components/ui/scroll-area';
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

  // ✅ DYNAMIC HEIGHT CALCULATION: Similar to LeaderboardCard
  const participantCount = participants.length;
  const itemHeight = 32; // Height per participant item
  const containerPadding = 40;
  const calculatedHeight = Math.max(280, participantCount * itemHeight + containerPadding);
  const shouldUseScroll = calculatedHeight > 400;
  const finalHeight = shouldUseScroll ? 400 : calculatedHeight;

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

  return (
    <div className="space-y-3">
      {/* Header */}
      <h3 className="text-sm font-semibold px-1">{t('skillsComparison')}</h3>

      {/* Horizontal Layout: Participant List (left) + Radar Chart (right) */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="flex gap-4 w-full"
      >
        {/* Left: Participant List with Color Legend */}
        <ScrollArea
          className="w-full max-w-[240px]"
          style={{ height: `${finalHeight}px` }}
        >
          <div className="space-y-1.5 pr-4">
            {participantData.map((entry) => {
              return (
                <div
                  key={`legend-${entry.participantIndex}`}
                  className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/30 transition-colors"
                >
                  {/* Color Indicator */}
                  <div
                    className="size-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: entry.color }}
                  />

                  {/* Avatar */}
                  <img
                    src={entry.avatarSrc}
                    alt={entry.avatarName}
                    className="size-5 flex-shrink-0 object-contain"
                  />

                  {/* Model Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-medium text-foreground/90 truncate leading-tight">
                      {entry.modelName}
                    </p>
                    {entry.provider && (
                      <p className="text-[8px] text-muted-foreground truncate">
                        {entry.provider}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {/* Right: Radar Chart */}
        <div className="flex-1 flex items-center justify-center">
          <ChartContainer
            config={chartConfig}
            className="mx-auto aspect-square max-h-[280px] w-full max-w-[280px]"
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
            </RadarChart>
          </ChartContainer>
        </div>
      </motion.div>
    </div>
  );
}
