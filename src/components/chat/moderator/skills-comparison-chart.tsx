'use client';
import chroma from 'chroma-js';
import { motion } from 'framer-motion';
import Image from 'next/image';
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
import { BRAND } from '@/constants/brand';
import { useModelsQuery } from '@/hooks/queries/models';
import { getAvatarPropsFromModelId } from '@/lib/utils/ai-display';

type SkillsComparisonChartProps = {
  participants: ParticipantAnalysis[];
};
export function SkillsComparisonChart({ participants }: SkillsComparisonChartProps) {
  const t = useTranslations('moderator');
  const { data: modelsData } = useModelsQuery();
  const allModels = modelsData?.data?.items || [];
  const vibrantColors = useMemo(() => {
    const colorCount = participants.length;
    if (colorCount === 0)
      return [];
    if (colorCount <= BRAND.logoGradient.length) {
      return BRAND.logoGradient.slice(0, colorCount);
    }
    return chroma
      .scale(BRAND.logoGradient)
      .mode('lch')
      .correctLightness()
      .colors(colorCount);
  }, [participants.length]);
  if (participants.length === 0) {
    return null;
  }
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
  const chartData = skillNames.map((skillName) => {
    const dataPoint: Record<string, string | number> = { skill: skillName };
    participants.forEach((participant) => {
      const skill = participant?.skillsMatrix?.find(s => s?.skillName === skillName);
      const participantIndex = participant?.participantIndex ?? 0;
      dataPoint[`participant${participantIndex}`] = skill?.rating ?? 0;
    });
    return dataPoint;
  });
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
  const participantData = participants.map((participant, index) => {
    const avatarProps = getAvatarPropsFromModelId('assistant', participant?.modelId ?? '');
    const model = allModels.find(m => m.id === participant?.modelId);
    return {
      participantIndex: participant?.participantIndex ?? index,
      modelId: participant?.modelId ?? '',
      modelName: participant?.modelName ?? avatarProps.name,
      provider: model?.provider ?? '',
      avatarSrc: avatarProps.src,
      avatarName: avatarProps.name,
      color: vibrantColors[index] ?? vibrantColors[0]!,
    };
  });
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="space-y-3"
    >
      <h3 className="text-sm font-semibold px-1">{t('skillsComparison')}</h3>
      <div className="flex flex-wrap justify-center gap-2 px-1">
        {participantData.map((entry) => {
          return (
            <div
              key={`legend-${entry.participantIndex}`}
              className="flex items-center gap-2 px-2 py-1 rounded-full bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <div
                className="size-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              <Image
                src={entry.avatarSrc}
                alt={entry.avatarName}
                className="size-4 flex-shrink-0 object-contain"
                width={16}
                height={16}
                unoptimized
              />
              <p className="text-[10px] font-medium text-foreground/90 whitespace-nowrap">
                {entry.modelName}
              </p>
            </div>
          );
        })}
      </div>
      <div className="mx-auto w-full max-w-[300px]">
        <ChartContainer
          config={chartConfig}
          className="aspect-square w-full"
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
              const fillOpacity = index === 0 ? 0.45 : 0.25;
              const strokeWidth = index === 0 ? 2.5 : 2;
              return (
                <Radar
                  key={key}
                  dataKey={key}
                  fill={`var(--color-${key})`}
                  fillOpacity={fillOpacity}
                  stroke={`var(--color-${key})`}
                  strokeWidth={strokeWidth}
                />
              );
            })}
          </RadarChart>
        </ChartContainer>
      </div>
    </motion.div>
  );
}
