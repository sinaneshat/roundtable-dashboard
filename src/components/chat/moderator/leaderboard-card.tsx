'use client';

/**
 * LeaderboardCard Component - Compact Horizontal Bar Chart
 *
 * ✅ REDESIGN GOALS:
 * - ULTRA COMPACT: Minimal vertical space with clean horizontal bars
 * - INLINE MODEL LIST: Models shown in left column with scroll support
 * - SIDE-BY-SIDE LAYOUT: Model list + chart in same row
 * - SPACE EFFICIENT: Takes ~250px height instead of 400px+
 * - SHADCN PATTERNS: Follows official horizontal bar chart patterns
 *
 * ✅ VISUALIZATION APPROACH:
 * - Left: ScrollArea with model names, avatars, rank badges
 * - Right: Simple horizontal bar chart showing ratings
 * - Color-coded bars based on rating performance (green/yellow/orange/red)
 * - Medal icons for top 3 positions
 * - Compact, information-dense layout
 *
 * ✅ ZERO HARDCODING: Import types from RPC schema
 */

import { motion } from 'framer-motion';
import { Award, Medal, Trophy } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { LeaderboardEntry } from '@/api/routes/chat/schema';
import { Badge } from '@/components/ui/badge';
import type { ChartConfig } from '@/components/ui/chart';
import {
  Bar,
  BarChart,
  Cell,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  XAxis,
  YAxis,
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
 * Get bar color based on rating performance
 */
function getBarColor(rating: number): string {
  if (rating >= 8)
    return 'hsl(142, 76%, 36%)'; // Green for excellent
  if (rating >= 6)
    return 'hsl(48, 96%, 53%)'; // Yellow for good
  if (rating >= 4)
    return 'hsl(25, 95%, 53%)'; // Orange for moderate
  return 'hsl(0, 72%, 51%)'; // Red for poor
}

/**
 * Generate golden-ratio distributed color for participant
 */
function generateParticipantColor(index: number): string {
  const goldenRatioConjugate = 0.618033988749895;
  const hue = Math.round((index * goldenRatioConjugate * 360) % 360);
  const saturation = 70;
  const lightness = 60;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

/**
 * LeaderboardCard - Chart-based visualization with bar chart
 */
export function LeaderboardCard({ leaderboard }: LeaderboardCardProps) {
  const t = useTranslations('moderator');

  // ✅ SINGLE SOURCE OF TRUTH: Fetch models from backend
  const { data: modelsData } = useModelsQuery();
  const allModels = modelsData?.data?.items || [];

  // If no leaderboard data, don't render anything
  if (leaderboard.length === 0) {
    return null;
  }

  // Transform data for BarChart
  const chartData = leaderboard
    .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
    .map((entry) => {
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
      };
    });

  // ✅ CHART CONFIG: Define chart styling
  const chartConfig = chartData.reduce(
    (config, entry, index) => {
      const key = `participant${entry.participantIndex}`;
      config[key] = {
        label: entry.modelName,
        color: generateParticipantColor(index),
      };
      return config;
    },
    {} as Record<string, { label: string; color: string }>,
  ) satisfies ChartConfig;

  return (
    <div className="space-y-2">
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

      {/* Two-Column Layout: Model List (Left) + Bar Chart (Right) */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="flex gap-4"
      >
        {/* Left Column: Model Rankings with Inline Scroll - Minimal Design */}
        <ScrollArea className="h-[260px] w-[160px] flex-shrink-0">
          <div className="space-y-1 pr-2">
            {chartData.map((entry) => {
              const rankIcon = getRankIcon(entry.rank);

              return (
                <div
                  key={`rank-${entry.participantIndex}`}
                  className="flex items-center gap-2 p-1 hover:bg-background/5 transition-colors rounded"
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

                  {/* Avatar - No borders or wrappers */}
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
                    <div className="flex items-center gap-1">
                      {entry.provider && (
                        <p className="text-[8px] text-muted-foreground/70 truncate leading-tight">
                          {entry.provider}
                        </p>
                      )}
                      <span className="text-[8px] font-bold text-foreground tabular-nums">
                        {entry.rating.toFixed(1)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {/* Right Column: Horizontal Bar Chart */}
        <div className="flex-1 min-w-0">
          <ChartContainer config={chartConfig} className="h-[260px] w-full">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
              accessibilityLayer
            >
              <XAxis
                type="number"
                domain={[0, 10]}
                hide
              />
              <YAxis
                type="category"
                dataKey="modelName"
                tickLine={false}
                tickMargin={10}
                axisLine={false}
                tick={{ fontSize: 10, fill: 'hsl(var(--foreground))', fontWeight: 600 }}
                tickFormatter={value => value.toString().slice(0, 12)}
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent hideLabel />}
              />
              <Bar dataKey="rating" radius={4} maxBarSize={28}>
                {chartData.map(entry => (
                  <Cell
                    key={`cell-${entry.participantIndex}`}
                    fill={getBarColor(entry.rating)}
                    className="transition-opacity hover:opacity-80"
                  />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </div>
      </motion.div>
    </div>
  );
}
