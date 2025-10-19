'use client';

/**
 * SkillsComparisonChart Component
 *
 * ✅ RECHARTS V3 PATTERNS (Context7 Documentation):
 * - Uses ResponsiveContainer for fluid chart sizing
 * - Accessibility built-in with Recharts v3 (keyboard navigation)
 * - RadarChart for multi-dimensional skill comparison
 * - ChartContainer with ChartConfig for theme-aware colors
 * - Multiple Radar series for participant overlay visualization
 *
 * ✅ FRONTEND PATTERNS:
 * - Uses shadcn/ui chart components (ChartContainer, ChartLegend, etc.)
 * - Different colors for each participant (up to 6)
 * - Custom PolarAngleAxis tick styling for white skill labels
 * - Safe null/undefined handling for partial AI-generated data
 *
 * Reference: /recharts/recharts/v3_2_1 (Context7)
 */

import type { ChartConfig } from '@/components/ui/chart';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
} from '@/components/ui/chart';

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

/**
 * Generate a visually distinct color for a participant using HSL color space
 *
 * ✅ STRATEGY:
 * - Uses golden ratio (0.618034) to distribute hues evenly across the color wheel
 * - Keeps saturation (70%) and lightness (60%) consistent for visual harmony
 * - Deterministic based on index for consistency across re-renders
 * - Supports unlimited participants with unique colors
 *
 * @param index - Participant index (0-based)
 * @returns HSL color string (e.g., "hsl(210, 70%, 60%)")
 */
function generateParticipantColor(index: number): string {
  // Golden ratio conjugate for evenly distributed hues
  const goldenRatioConjugate = 0.618033988749895;

  // Calculate hue (0-360 degrees) using golden ratio
  // This ensures maximum visual distinction between adjacent colors
  const hue = Math.round((index * goldenRatioConjugate * 360) % 360);

  // Fixed saturation and lightness for consistent visual appearance
  const saturation = 70; // 70% saturation for vibrant colors
  const lightness = 60; // 60% lightness for good contrast on dark backgrounds

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

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

  // ✅ OFFICIAL SHADCN PATTERN: Use 'satisfies ChartConfig' instead of explicit typing
  // Generate unique colors for each participant using golden ratio distribution
  const chartConfig = participants.reduce(
    (config, participant, index) => {
      const key = `participant${participant?.participantIndex ?? index}`;
      const color = generateParticipantColor(index);

      config[key] = {
        label: participant?.modelName ?? 'Unknown',
        color,
      };

      return config;
    },
    {} as Record<string, { label: string; color: string }>,
  ) satisfies ChartConfig;

  return (
    <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[320px] w-full">
      <RadarChart
        data={chartData}
        margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
      >
        {/* ✅ RECHARTS V3: PolarGrid for radar chart background */}
        <PolarGrid className="stroke-white/30" strokeWidth={1} />

        {/* ✅ RECHARTS V3: PolarAngleAxis for skill labels around the perimeter */}
        <PolarAngleAxis
          dataKey="skill"
          className="text-xs"
          tick={{
            fill: '#ffffff',
            fontSize: 11,
            fontWeight: 600,
          }}
        />

        {/* ✅ RECHARTS V3 PATTERN: Multiple Radar series for participant overlay
            Each Radar represents one participant's skill ratings across all dimensions */}
        {participants.map((participant, index) => {
          const key = `participant${participant?.participantIndex ?? index}`;
          const color = generateParticipantColor(index);

          return (
            <Radar
              key={key}
              name={participant?.modelName ?? 'Unknown'} // ✅ V3: name for tooltip/legend
              dataKey={key}
              stroke={color}
              fill={color}
              fillOpacity={0.15}
              strokeWidth={2}
              dot={{ r: 3, fill: color }} // ✅ V3: Add dots for data points
              activeDot={{ r: 5, strokeWidth: 0 }} // ✅ V3: Larger dots on hover
            />
          );
        })}

        {/* ✅ RECHARTS V3: Custom legend content with theme support */}
        <ChartLegend content={<ChartLegendContent />} />
      </RadarChart>
    </ChartContainer>
  );
}
