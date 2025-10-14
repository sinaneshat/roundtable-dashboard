'use client';

/**
 * LeaderboardCard Component
 *
 * ✅ MINIMAL HORIZONTAL-FIRST DESIGN:
 * - Horizontal scrolling cards (NO vertical stacking)
 * - NO borders on individual cards
 * - Proper model icons using getAvatarPropsFromModelId
 * - High contrast text
 * - Compact, minimal design
 * - Framer motion animations
 * ✅ ZERO HARDCODING: Import types from RPC schema
 */

import { motion } from 'framer-motion';
import { Award, Medal, Trophy } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { LeaderboardEntry } from '@/api/routes/chat/schema';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
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
 * Get rating color based on score
 */
function getRatingColor(rating: number): string {
  if (rating >= 8)
    return 'text-green-500';
  if (rating >= 6)
    return 'text-yellow-500';
  return 'text-orange-500';
}

/**
 * LeaderboardCard - Horizontal scrolling participant cards
 */
export function LeaderboardCard({ leaderboard }: LeaderboardCardProps) {
  const t = useTranslations('moderator');

  // ✅ SINGLE SOURCE OF TRUTH: Fetch models from backend
  const { data: modelsData } = useModelsQuery();
  const allModels = modelsData?.data?.models || [];

  // If no leaderboard data, don't render anything
  if (leaderboard.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Trophy className="size-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">{t('leaderboard')}</h3>
        <Badge variant="secondary" className="text-xs">
          {leaderboard.length}
        </Badge>
      </div>

      {/* Horizontal scrolling container with shadcn ScrollArea */}
      <ScrollArea className="w-full">
        <div className="flex gap-3 pb-4">
          {leaderboard.map((entry, index) => {
            const rankIcon = getRankIcon(entry.rank);
            const isTopThree = entry.rank <= 3;

            // ✅ Use getAvatarPropsFromModelId for proper icon loading
            const avatarProps = getAvatarPropsFromModelId('assistant', entry.modelId);
            const model = allModels.find(m => m.id === entry.modelId);
            const provider = model?.provider;
            const ratingColor = getRatingColor(entry.overallRating);

            return (
              <motion.div
                key={entry.participantIndex}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05, duration: 0.2 }}
                className={cn(
                  'flex flex-col gap-3 p-3 rounded-lg w-[220px] shrink-0',
                  'bg-background/5',
                  isTopThree && 'ring-1 ring-primary/30',
                )}
              >
                {/* Rank Badge - Inside Card at Top */}
                <div className="flex items-center justify-between">
                  {rankIcon
                    ? (
                        <div className="flex items-center gap-2">
                          <div className={cn('p-1.5 rounded-full', rankIcon.bgColor)}>
                            <rankIcon.Icon className={cn('size-4', rankIcon.color)} />
                          </div>
                          <span className="text-xs font-semibold text-foreground/70">
                            #
                            {entry.rank}
                          </span>
                        </div>
                      )
                    : (
                        <div className="flex items-center gap-2">
                          <div className="size-6 flex items-center justify-center rounded-full bg-background/50 text-xs font-bold text-foreground/70">
                            {entry.rank}
                          </div>
                        </div>
                      )}
                </div>

                {/* Avatar + Model Name */}
                <div className="flex flex-col items-center gap-2">
                  <Avatar className="size-12 ring-2 ring-white/10">
                    <AvatarImage src={avatarProps.src} alt={avatarProps.name} />
                    <AvatarFallback className="text-xs font-semibold">
                      {avatarProps.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="text-center space-y-1">
                    <p className="text-sm font-medium text-foreground truncate max-w-[180px]">
                      {avatarProps.name}
                    </p>
                    {provider && (
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                        {provider}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Rating - Prominent */}
                <div className="flex flex-col items-center gap-1 py-2 rounded-md bg-background/20">
                  <span className={cn('text-2xl font-bold', ratingColor)}>
                    {entry.overallRating.toFixed(1)}
                  </span>
                  <span className="text-xs text-foreground/60">/10</span>
                </div>

                {/* Role Badge (if present) */}
                {entry.participantRole && (
                  <div className="text-center">
                    <p className="text-xs text-foreground/60 truncate">
                      {entry.participantRole}
                    </p>
                  </div>
                )}

                {/* Custom Badge (if present) */}
                {entry.badge && (
                  <Badge variant="secondary" className="text-[10px] mx-auto">
                    {entry.badge}
                  </Badge>
                )}
              </motion.div>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
