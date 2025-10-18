'use client';

/**
 * SkillsComparisonChart Component
 *
 * ✅ FOLLOWS FRONTEND PATTERNS:
 * - Uses shadcn/ui chart components (ChartContainer from @/components/ui/chart)
 * - Uses Recharts for radar chart visualization
 * - Overlays multiple participants for visual comparison
 * - Different colors for each participant
 * - White text for skill labels
 */

import { PolarAngleAxis, PolarGrid, Radar, RadarChart } from 'recharts';

import type { ChartConfig } from '@/components/ui/chart';
import { ChartContainer, ChartLegend, ChartLegendContent } from '@/components/ui/chart';

type ParticipantSkills = {
  participantIndex: number;
  modelName: string;
  skillsMatrix: Array<{
    skillName: string;
    rating: number;
  }>;
};

type SkillsComparisonChartProps = {
  participants: ParticipantSkills[];
};

// Color palette for up to 6 participants
const PARTICIPANT_COLORS = [
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f59e0b', // amber
  '#10b981', // emerald
  '#f97316', // orange
];

/**
 * SkillsComparisonChart - Overlay radar chart comparing all participants
 *
 * @param props - Component props
 * @param props.participants - Array of participant skill data
 */
export function SkillsComparisonChart({ participants }: SkillsComparisonChartProps) {
  if (participants.length === 0) {
    return null;
  }

  // ✅ AI SDK V5 PATTERN: Handle partial objects with safe access
  const skillNames = participants[0]?.skillsMatrix?.map(s => s?.skillName).filter(Boolean) || [];

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

  // Chart configuration for colors and styling
  const chartConfig: ChartConfig = participants.reduce(
    (config, participant, index) => {
      const key = `participant${participant?.participantIndex ?? index}`;
      config[key] = {
        label: participant?.modelName ?? 'Unknown',
        color: PARTICIPANT_COLORS[index % PARTICIPANT_COLORS.length],
      };
      return config;
    },
    {} as ChartConfig,
  );

  return (
    <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[320px] w-full">
      <RadarChart data={chartData}>
        <PolarGrid className="stroke-white/30" strokeWidth={1} />
        <PolarAngleAxis
          dataKey="skill"
          className="text-xs"
          tick={{
            fill: '#ffffff',
            fontSize: 11,
            fontWeight: 600,
          }}
        />

        {/* Render a Radar for each participant */}
        {participants.map((participant, index) => {
          const key = `participant${participant?.participantIndex ?? index}`;
          const color = PARTICIPANT_COLORS[index % PARTICIPANT_COLORS.length];

          return (
            <Radar
              key={key}
              dataKey={key}
              stroke={color}
              fill={color}
              fillOpacity={0.15}
              strokeWidth={2}
            />
          );
        })}

        <ChartLegend content={<ChartLegendContent />} />
      </RadarChart>
    </ChartContainer>
  );
}
