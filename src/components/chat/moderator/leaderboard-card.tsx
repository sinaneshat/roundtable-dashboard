'use client';

/**
 * LeaderboardCard Component - Chart-Based Redesign
 *
 * ✅ REDESIGN GOALS:
 * - NO BORDERS: Clean, minimal design without card borders
 * - VERTICAL EFFICIENCY: Compact bar chart visualization
 * - BETTER INSIGHTS: Side-by-side comparison with bar chart
 * - CONSISTENT SIZING: Uniform avatars and elements
 * - CHART-BASED: Uses Recharts BarChart for comparative visualization
 *
 * ✅ VISUALIZATION APPROACH:
 * - Horizontal bar chart showing all participants in one view
 * - Medal icons for top 3 positions
 * - Color-coded bars based on rating performance
 * - Compact, information-dense layout
 * - Avatar integration for visual identification
 *
 * ✅ ZERO HARDCODING: Import types from RPC schema
 */

import { motion } from 'framer-motion';
import { Award, Medal, Trophy } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { LeaderboardEntry } from '@/api/routes/chat/schema';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import type { ChartConfig } from '@/components/ui/chart';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ChartContainer,
  ChartTooltip,
  XAxis,
  YAxis,
} from '@/components/ui/chart';
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
    <div className="space-y-3">
      {/* Header Section */}
      <div className="flex items-center gap-2 px-1">
        <Trophy className="size-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">{t('leaderboard')}</h3>
        <Badge variant="secondary" className="text-xs h-5">
          {leaderboard.length}
        </Badge>
      </div>

      {/* Bar Chart Visualization - NO BORDERS */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="space-y-2"
      >
        <ChartContainer config={chartConfig} className="h-[200px] w-full">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
            accessibilityLayer
            barGap={2}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" horizontal={false} />
            <XAxis
              type="number"
              domain={[0, 10]}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            />
            <YAxis
              type="category"
              dataKey="modelName"
              tickLine={false}
              axisLine={false}
              width={140}
              tick={(props) => {
                const { x, y, payload, index } = props as {
                  x: number;
                  y: number;
                  payload: { value: string };
                  index: number;
                };
                const entry = chartData[index];
                if (!entry) {
                  return <g />;
                }

                const rankIcon = getRankIcon(entry.rank);

                return (
                  <g transform={`translate(${x},${y})`}>
                    {/* Avatar */}
                    <foreignObject x={5} y={-12} width={24} height={24}>
                      <Avatar className="size-6 ring-1 ring-border/40">
                        <AvatarImage src={entry.avatarSrc} alt={entry.avatarName} />
                        <AvatarFallback className="text-[9px] font-semibold bg-muted/50">
                          {entry.avatarName.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </foreignObject>

                    {/* Model Name */}
                    <text
                      x={34}
                      y={0}
                      textAnchor="start"
                      fontSize={10}
                      fontWeight={600}
                      fill="hsl(var(--foreground))"
                      className="truncate"
                    >
                      {payload.value.toString().slice(0, 14)}
                    </text>

                    {/* Rank Badge */}
                    {rankIcon
                      ? (
                          <foreignObject x={34} y={4} width={24} height={14}>
                            <div className="flex items-center gap-0.5">
                              <rankIcon.Icon className={cn('size-2', rankIcon.color)} />
                              <span className={cn('text-[8px] font-bold', rankIcon.color)}>
                                #
                                {entry.rank}
                              </span>
                            </div>
                          </foreignObject>
                        )
                      : (
                          <text
                            x={34}
                            y={12}
                            textAnchor="start"
                            fontSize={8}
                            fontWeight={700}
                            fill="hsl(var(--muted-foreground))"
                          >
                            #
                            {entry.rank}
                          </text>
                        )}
                  </g>
                );
              }}
            />
            <ChartTooltip
              cursor={{ fill: 'hsl(var(--muted))', opacity: 0.2 }}
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0)
                  return null;

                const data = payload[0]?.payload;
                if (!data)
                  return null;

                return (
                  <div className="rounded-lg border border-border/50 bg-background px-2.5 py-1.5 shadow-lg">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Avatar className="size-7 ring-1 ring-border/40">
                          <AvatarImage src={data.avatarSrc} alt={data.avatarName} />
                          <AvatarFallback className="text-[10px] font-semibold">
                            {data.avatarName.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-xs font-semibold text-foreground">{data.modelName}</p>
                          {data.provider && (
                            <p className="text-[10px] text-muted-foreground">{data.provider}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-3 pt-0.5">
                        <span className="text-[10px] text-muted-foreground">Rating</span>
                        <span className="text-xs font-bold tabular-nums text-foreground">
                          {data.rating.toFixed(1)}
                          /10
                        </span>
                      </div>
                      {data.participantRole && (
                        <div className="flex items-center justify-between gap-3 border-t border-border/30 pt-0.5">
                          <span className="text-[10px] text-muted-foreground">Role</span>
                          <span className="text-[10px] font-medium text-foreground">
                            {data.participantRole}
                          </span>
                        </div>
                      )}
                      {data.badge && (
                        <Badge variant="secondary" className="text-[9px] h-4 mt-0.5">
                          {data.badge}
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              }}
            />
            <Bar dataKey="rating" radius={[0, 3, 3, 0]} maxBarSize={24}>
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

        {/* Legend - Provider distribution */}
        <div className="flex flex-wrap items-center justify-center gap-3 px-1 pt-1">
          {Array.from(new Set(chartData.map(d => d.provider)))
            .filter(Boolean)
            .map(provider => (
              <div key={provider} className="flex items-center gap-1.5">
                <div className="size-2 rounded-full bg-muted-foreground/40" />
                <span className="text-xs text-muted-foreground">{provider}</span>
              </div>
            ))}
        </div>
      </motion.div>
    </div>
  );
}
