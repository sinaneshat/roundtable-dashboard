'use client';

/**
 * SkillsRadarChart Component
 *
 * ✅ FOLLOWS FRONTEND PATTERNS:
 * - Uses shadcn/ui chart components (ChartContainer from @/components/ui/chart)
 * - Uses Recharts for radar chart visualization
 * - Follows component architecture patterns from frontend-patterns.md
 * - Uses useTranslations for all text
 * - Responsive design with proper sizing
 *
 * Displays a radar chart visualizing skill ratings (1-10) for a participant.
 * Used within ParticipantAnalysisCard to show skills matrix.
 */

import { PolarAngleAxis, PolarGrid, Radar, RadarChart } from 'recharts';

import type { ChartConfig } from '@/components/ui/chart';
import { ChartContainer } from '@/components/ui/chart';

type SkillRating = {
  skillName: string;
  rating: number;
};

type SkillsRadarChartProps = {
  skillsMatrix: SkillRating[];
  modelName?: string;
};

/**
 * SkillsRadarChart - Radar chart for participant skills
 *
 * @param props - Component props
 * @param props.skillsMatrix - Array of skill ratings (skillName, rating 1-10)
 * @param props.modelName - Optional model name for chart labeling
 */
export function SkillsRadarChart({ skillsMatrix, modelName }: SkillsRadarChartProps) {
  // Transform data for Recharts
  const chartData = skillsMatrix.map(skill => ({
    skill: skill.skillName,
    rating: skill.rating,
  }));

  // Chart configuration for colors and styling
  const chartConfig = {
    rating: {
      label: modelName || 'Rating',
      color: 'hsl(var(--chart-1))',
    },
  } satisfies ChartConfig;

  return (
    <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[280px] w-full">
      <RadarChart data={chartData}>
        <PolarGrid className="stroke-white/30" strokeWidth={1.5} />
        <PolarAngleAxis
          dataKey="skill"
          className="text-xs"
          tick={{
            fill: '#ffffff',
            fontSize: 12,
            fontWeight: 600,
          }}
        />
        <Radar
          dataKey="rating"
          fill="#ffffff"
          fillOpacity={0.2}
          stroke="#ffffff"
          strokeWidth={3}
        />
      </RadarChart>
    </ChartContainer>
  );
}
