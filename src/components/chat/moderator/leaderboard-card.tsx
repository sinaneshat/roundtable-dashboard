'use client';

/**
 * LeaderboardCard Component - Dynamic Horizontal Bar Chart
 *
 * ✅ REDESIGN GOALS:
 * - DYNAMIC HEIGHT: Scales based on participant count (~32px per bar)
 * - SHOWS ALL PARTICIPANTS: No cutoff regardless of participant count
 * - VIBRANT COLORS: Uses chroma.js for distinctive color generation
 * - SHADCN PATTERNS: Follows shadcn/ui chart best practices
 *
 * ✅ VISUALIZATION APPROACH:
 * - Horizontal bar chart showing rankings at a glance
 * - Dynamic container height calculation (participantCount * barHeight + padding)
 * - Automatic scrolling for very tall charts (>400px)
 * - Medal icons for top 3 positions
 * - Thin, compact bars with maxBarSize={20}
 * - LabelList showing "X.X/10" scores on each bar
 *
 * ✅ LABELS (shadcn pattern):
 * - Uses Recharts LabelList component for proper label positioning
 * - Shows rating as "X.X/10" format aligned to the right of bars
 * - 60px right margin to accommodate labels
 * - XAxis shows scale from 0-10 with visible ticks
 *
 * ✅ DYNAMIC SIZING (shadcn pattern):
 * - Container height: max(180px, participantCount * 32px + 40px)
 * - ScrollArea enabled when height exceeds 400px
 * - Recharts auto-calculates bar spacing based on available space
 *
 * ✅ COLOR GENERATION:
 * - Uses chroma.js for vibrant, distinctive color palette
 * - Same color system as SkillsComparisonChart for consistency
 *
 * ✅ ZERO HARDCODING: Import types from RPC schema
 */

import chroma from 'chroma-js';
import { motion } from 'framer-motion';
import { Award, Medal, Trophy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { Bar, BarChart, Cell, LabelList, XAxis, YAxis } from 'recharts';

import type { LeaderboardEntry } from '@/api/routes/chat/schema';
import { Badge } from '@/components/ui/badge';
import type { ChartConfig } from '@/components/ui/chart';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useModelsQuery } from '@/hooks/queries/models';
import { cn } from '@/lib/ui/cn';
import { getAvatarPropsFromModelId } from '@/lib/utils/ai-display';

type LeaderboardCardProps = {
  leaderboard: LeaderboardEntry[];
};

/**
 * Get medal icon and color for top 3 ranks
 */
function getRankIcon(rank: number) {
  switch (rank) {
    case 1:
      return { Icon: Trophy, color: 'text-yellow-500', bgColor: 'bg-yellow-500/20' };
    case 2:
      return { Icon: Medal, color: 'text-gray-400', bgColor: 'bg-gray-400/20' };
    case 3:
      return { Icon: Award, color: 'text-orange-600', bgColor: 'bg-orange-600/20' };
    default:
      return null;
  }
}

/**
 * LeaderboardCard - Compact horizontal bar chart for quick ranking overview
 */
export function LeaderboardCard({ leaderboard }: LeaderboardCardProps) {
  const t = useTranslations('moderator');

  // ✅ SINGLE SOURCE OF TRUTH: Fetch models from backend
  const { data: modelsData } = useModelsQuery();
  const allModels = modelsData?.data?.items || [];

  // ✅ DYNAMIC HEIGHT CALCULATION: Scale based on participant count
  // Following shadcn pattern: ~40-50px per bar + padding
  const participantCount = leaderboard.length;
  const barHeight = 32; // Height per bar in pixels
  const containerPadding = 40; // Top + bottom padding
  const calculatedHeight = Math.max(180, participantCount * barHeight + containerPadding);
  const shouldUseScroll = calculatedHeight > 400; // Use scroll for very tall charts
  const finalHeight = shouldUseScroll ? 400 : calculatedHeight;

  // ✅ BRAND COLORS: Use design system colors
  const vibrantColors = useMemo(() => {
    const colorCount = leaderboard.length;

    if (colorCount === 0)
      return [];

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
      .mode('lch')
      .colors(colorCount);

    return scale;
  }, [leaderboard.length]);

  // If no leaderboard data, don't render anything
  if (leaderboard.length === 0) {
    return null;
  }

  // Transform data for horizontal BarChart - sort by rank
  const chartData = leaderboard
    .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
    .map((entry, index) => {
      const avatarProps = getAvatarPropsFromModelId('assistant', entry.modelId ?? '');
      const model = allModels.find(m => m.id === entry.modelId);

      return {
        participantIndex: entry.participantIndex,
        modelId: entry.modelId ?? '',
        modelName: avatarProps.name,
        provider: model?.provider ?? '',
        rank: entry.rank ?? 999,
        rating: entry.overallRating ?? 0,
        participantRole: entry.participantRole ?? '',
        badge: entry.badge ?? '',
        avatarSrc: avatarProps.src,
        avatarName: avatarProps.name,
        fill: vibrantColors[index] ?? vibrantColors[0]!,
      };
    });

  // ✅ VIBRANT COLOR CONFIG: Use chroma.js generated colors
  const chartConfig = chartData.reduce(
    (config, entry, index) => {
      const key = `model${entry.participantIndex}`;
      const color = vibrantColors[index] ?? vibrantColors[0]!;

      config[key] = {
        label: entry.modelName,
        color,
      };
      return config;
    },
    {
      rating: {
        label: 'Rating',
      },
    } as Record<string, { label: string; color?: string }>,
  ) satisfies ChartConfig;

  return (
    <div className="space-y-3">
      {/* Header Section */}
      <div className="flex items-center gap-2 px-1">
        <Trophy className="size-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">{t('leaderboard')}</h3>
        <Badge variant="secondary" className="text-xs h-5">
          {leaderboard.length}
          {' '}
          models
        </Badge>
      </div>

      {/* Horizontal Layout: Model List (left) + Bar Chart (right) */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="flex gap-4 w-full"
      >
        {/* Left: Compact Model List with ScrollArea */}
        <ScrollArea
          className="w-full max-w-[240px]"
          style={{ height: `${finalHeight}px` }}
        >
          <div className="space-y-1.5 pr-4">
            {chartData.map((entry) => {
              const rankIcon = getRankIcon(entry.rank);

              return (
                <div
                  key={`legend-${entry.participantIndex}`}
                  className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/30 transition-colors"
                >
                  {/* Rank Badge/Icon */}
                  <div className="flex items-center justify-center w-5 flex-shrink-0">
                    {rankIcon
                      ? (
                          <div className={cn('flex items-center justify-center size-5 rounded-full', rankIcon.bgColor)}>
                            <rankIcon.Icon className={cn('size-3', rankIcon.color)} />
                          </div>
                        )
                      : (
                          <div className="flex items-center justify-center size-5 rounded-full bg-muted/30">
                            <span className="text-[8px] font-bold text-muted-foreground">
                              {entry.rank}
                            </span>
                          </div>
                        )}
                  </div>

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
                    <span className="text-[8px] font-bold text-foreground/70 tabular-nums">
                      {entry.rating.toFixed(1)}
                      /10
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {/* Right: Horizontal Bar Chart */}
        <div className="flex-1">
          <ChartContainer
            config={chartConfig}
            style={{ height: `${finalHeight}px` }}
          >
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ left: 0, right: 60, top: 10, bottom: 10 }}
            >
              <XAxis
                type="number"
                domain={[0, 10]}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10 }}
                tickFormatter={value => `${value}`}
              />
              <YAxis
                dataKey="modelName"
                type="category"
                hide
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent hideLabel />}
              />
              <Bar
                dataKey="rating"
                radius={4}
                maxBarSize={20}
              >
                {chartData.map(entry => (
                  <Cell
                    key={`cell-${entry.participantIndex}`}
                    fill={entry.fill}
                  />
                ))}
                <LabelList
                  dataKey="rating"
                  position="right"
                  offset={8}
                  className="fill-foreground text-[10px] font-semibold"
                  formatter={(value: unknown) => `${Number(value).toFixed(1)}/10`}
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        </div>
      </motion.div>
    </div>
  );
}
