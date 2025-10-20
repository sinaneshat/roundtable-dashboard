'use client';

/**
 * SkillsComparisonChart Component
 *
 * ✅ RADAR/SPIDER CHART PATTERN:
 * - Uses radar chart (spider/pentagon chart) for skills matrix visualization
 * - Perfect for comparing multiple dimensions/skills across participants
 * - Creates distinctive pentagon/spider web shape showing strengths/weaknesses
 * - Each participant is a colored layer on the radar chart
 *
 * ✅ RECHARTS V3 PATTERNS (Context7 Documentation):
 * - Uses RadarChart with PolarGrid and PolarAngleAxis
 * - Accessibility built-in with Recharts v3 (keyboard navigation)
 * - ChartContainer with ChartConfig for theme-aware colors
 * - Multiple Radar series for participant comparison
 *
 * ✅ FRONTEND PATTERNS:
 * - Uses shadcn/ui chart components (ChartContainer, ChartLegend, etc.)
 * - Different colors for each participant using golden ratio distribution
 * - Safe null/undefined handling for partial AI-generated data
 * - Responsive square aspect ratio for optimal radar visualization
 *
 * Reference: /recharts/recharts/v3_2_1 (Context7)
 */

import { motion } from 'framer-motion';
import { Target } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import type { ChartConfig } from '@/components/ui/chart';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
} from '@/components/ui/chart';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useModelsQuery } from '@/hooks/queries/models';
import { getAvatarPropsFromModelId } from '@/lib/utils/ai-display';

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
 * SkillsComparisonChart - Radar/spider chart comparing participant skills
 *
 * Visualizes skills matrix as a pentagon/radar chart where each participant
 * is represented as a colored layer showing their ratings across all skills.
 *
 * @param props - Component props
 * @param props.participants - Array of participant skill data
 */
export function SkillsComparisonChart({ participants }: SkillsComparisonChartProps) {
  const t = useTranslations('moderator');

  // ✅ SINGLE SOURCE OF TRUTH: Fetch models from backend
  const { data: modelsData } = useModelsQuery();
  const allModels = modelsData?.data?.items || [];

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
    <div className="space-y-2">
      {/* Header Section */}
      <div className="flex items-center gap-2 px-1">
        <Target className="size-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">{t('skillsComparison')}</h3>
        <Badge variant="secondary" className="text-xs h-5">
          {skillNames.length}
          {' '}
          skills
        </Badge>
      </div>

      {/* Two-Column Layout: Model List (Left) + Radar Chart (Right) */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="flex gap-4"
      >
        {/* Left Column: Model Names with Inline Scroll - Minimal Design */}
        <ScrollArea className="h-[400px] w-[120px] flex-shrink-0">
          <div className="space-y-1.5 pr-2">
            {participants.map((participant, index) => {
              const avatarProps = getAvatarPropsFromModelId('assistant', participant.modelId ?? '');
              const model = allModels.find(m => m.id === participant.modelId);
              const color = generateParticipantColor(index);

              return (
                <div
                  key={`model-${participant.participantIndex ?? index}`}
                  className="flex items-center gap-2 p-1.5 hover:bg-background/5 transition-colors rounded"
                >
                  {/* Color indicator dot */}
                  <div className="size-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />

                  {/* Avatar - No borders or wrappers */}
                  <img
                    src={avatarProps.src}
                    alt={avatarProps.name}
                    className="size-5 flex-shrink-0 object-contain"
                  />

                  {/* Model Name and Provider */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-medium text-foreground/90 truncate leading-tight">
                      {participant.modelName}
                    </p>
                    {model?.provider && (
                      <p className="text-[8px] text-muted-foreground/70 truncate leading-tight">
                        {model.provider}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {/* Right Column: Radar Chart - Skills labeled at each vertex (BIGGER) */}
        <div className="flex-1 min-w-0">
          <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[400px] w-full">
            <RadarChart data={chartData} margin={{ top: 40, right: 40, bottom: 40, left: 40 }}>
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent indicator="line" />}
              />
              <PolarAngleAxis
                dataKey="skill"
                tick={{
                  fontSize: 13,
                  fill: 'hsl(var(--foreground))',
                  fontWeight: 700,
                }}
                tickLine={false}
                stroke="hsl(var(--foreground))"
              />
              <PolarGrid
                className="stroke-border/30"
                gridType="polygon"
                polarRadius={[0, 25, 50, 75, 100]}
              />
              {participants.map((participant, index) => {
                const key = `participant${participant?.participantIndex ?? index}`;
                const color = generateParticipantColor(index);

                return (
                  <Radar
                    key={key}
                    dataKey={key}
                    stroke={color}
                    fill={color}
                    fillOpacity={0.2}
                    strokeWidth={2}
                    dot={{
                      r: 4,
                      fill: color,
                      strokeWidth: 2,
                      stroke: 'hsl(var(--background))',
                    }}
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
