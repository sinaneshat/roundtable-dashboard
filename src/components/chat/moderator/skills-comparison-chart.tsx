'use client';

/**
 * SkillsComparisonChart Component
 *
 * ✅ COMPACT HORIZONTAL LAYOUT:
 * - Uses horizontal bar chart for vertical space efficiency
 * - Model names in compact ScrollArea on the left side
 * - Chart on the right showing all skills in one view
 * - Vertical efficiency: ~200px max height instead of 320px
 *
 * ✅ RECHARTS V3 PATTERNS (Context7 Documentation):
 * - Uses BarChart with horizontal orientation
 * - Accessibility built-in with Recharts v3 (keyboard navigation)
 * - ChartContainer with ChartConfig for theme-aware colors
 * - Multiple Bar series for participant comparison
 *
 * ✅ FRONTEND PATTERNS:
 * - Uses shadcn/ui chart components (ChartContainer, ChartLegend, etc.)
 * - Different colors for each participant (up to 6)
 * - Safe null/undefined handling for partial AI-generated data
 *
 * Reference: /recharts/recharts/v3_2_1 (Context7)
 */

import { motion } from 'framer-motion';
import { BarChart as BarChartIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import type { ChartConfig } from '@/components/ui/chart';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  XAxis,
  YAxis,
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
 * SkillsComparisonChart - Compact horizontal bar chart comparing all participants
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
        <BarChartIcon className="size-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">{t('skillsComparison')}</h3>
        <Badge variant="secondary" className="text-xs h-5">
          {skillNames.length}
          {' '}
          skills
        </Badge>
      </div>

      {/* Horizontal Layout: Model List + Chart */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="flex gap-3"
      >
        {/* Left: Model Names (Compact ScrollArea) */}
        <ScrollArea className="h-[200px] w-[140px] flex-shrink-0 rounded-lg border border-border/40 bg-background/5">
          <div className="space-y-1 p-2">
            {participants.map((participant, index) => {
              const avatarProps = getAvatarPropsFromModelId('assistant', participant.modelId ?? '');
              const model = allModels.find(m => m.id === participant.modelId);
              const color = generateParticipantColor(index);

              return (
                <div
                  key={`model-${participant.participantIndex ?? index}`}
                  className="flex items-center gap-2 rounded-md p-1.5 hover:bg-background/10"
                >
                  {/* Color indicator */}
                  <div className="size-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />

                  {/* Avatar */}
                  <Avatar className="size-6 ring-1 ring-border/40">
                    <AvatarImage src={avatarProps.src} alt={avatarProps.name} />
                    <AvatarFallback className="text-[9px] font-semibold">
                      {avatarProps.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  {/* Model Name */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-semibold text-foreground truncate">
                      {participant.modelName}
                    </p>
                    {model?.provider && (
                      <p className="text-[8px] text-muted-foreground truncate">
                        {model.provider}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {/* Right: Horizontal Bar Chart */}
        <div className="flex-1 min-w-0">
          <ChartContainer config={chartConfig} className="h-[200px] w-full">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 5, right: 10, left: 5, bottom: 5 }}
              accessibilityLayer
              barGap={1}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" horizontal={false} />
              <XAxis
                type="number"
                domain={[0, 10]}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis
                type="category"
                dataKey="skill"
                tickLine={false}
                axisLine={false}
                width={80}
                tick={{ fontSize: 9, fill: 'hsl(var(--foreground))', fontWeight: 600 }}
              />
              <ChartTooltip
                cursor={{ fill: 'hsl(var(--muted))', opacity: 0.2 }}
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0)
                    return null;

                  return (
                    <div className="rounded-lg border border-border/50 bg-background px-2 py-1.5 shadow-lg">
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-foreground mb-1">
                          {payload[0]?.payload?.skill}
                        </p>
                        {payload.map((entry, index) => {
                          const participant = participants[index];
                          const color = generateParticipantColor(index);

                          return (
                            <div key={entry.dataKey} className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-1.5">
                                <div className="size-2 rounded-full" style={{ backgroundColor: color }} />
                                <span className="text-[10px] text-muted-foreground">
                                  {participant?.modelName ?? 'Unknown'}
                                </span>
                              </div>
                              <span className="text-xs font-bold tabular-nums">
                                {Number(entry.value).toFixed(1)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                }}
              />
              {participants.map((participant, index) => {
                const key = `participant${participant?.participantIndex ?? index}`;
                const color = generateParticipantColor(index);

                return (
                  <Bar
                    key={key}
                    dataKey={key}
                    fill={color}
                    radius={[0, 2, 2, 0]}
                    maxBarSize={16}
                    opacity={0.8}
                  />
                );
              })}
              <ChartLegend content={<ChartLegendContent />} />
            </BarChart>
          </ChartContainer>
        </div>
      </motion.div>
    </div>
  );
}
