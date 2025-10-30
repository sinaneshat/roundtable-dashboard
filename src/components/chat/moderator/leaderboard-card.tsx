'use client';
import { motion } from 'framer-motion';
import { Award, Medal, Trophy } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';

import type { LeaderboardEntry } from '@/api/routes/chat/schema';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useModelsQuery } from '@/hooks/queries/models';
import { cn } from '@/lib/ui/cn';
import { getAvatarPropsFromModelId } from '@/lib/utils/ai-display';

type LeaderboardCardProps = {
  leaderboard: LeaderboardEntry[];
};
function getRankStyling(rank: number) {
  switch (rank) {
    case 1:
      return {
        Icon: Trophy,
        iconColor: 'text-yellow-500',
        bgColor: 'bg-yellow-500/10',
        borderColor: 'border-yellow-500/30',
        progressColor: 'bg-yellow-500',
        textColor: 'text-yellow-500',
      };
    case 2:
      return {
        Icon: Medal,
        iconColor: 'text-slate-400',
        bgColor: 'bg-slate-400/10',
        borderColor: 'border-slate-400/30',
        progressColor: 'bg-slate-400',
        textColor: 'text-slate-400',
      };
    case 3:
      return {
        Icon: Award,
        iconColor: 'text-orange-500',
        bgColor: 'bg-orange-500/10',
        borderColor: 'border-orange-500/30',
        progressColor: 'bg-orange-500',
        textColor: 'text-orange-500',
      };
    default:
      return {
        Icon: null,
        iconColor: '',
        bgColor: 'bg-muted/30',
        borderColor: 'border-border/50',
        progressColor: 'bg-primary',
        textColor: 'text-muted-foreground',
      };
  }
}
export function LeaderboardCard({ leaderboard }: LeaderboardCardProps) {
  const t = useTranslations('moderator');
  const { data: modelsData } = useModelsQuery();
  const allModels = modelsData?.data?.items || [];
  if (leaderboard.length === 0) {
    return null;
  }
  const rankedParticipants = leaderboard
    .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
    .map((entry) => {
      const avatarProps = getAvatarPropsFromModelId('assistant', entry.modelId ?? '');
      const model = allModels.find(m => m.id === entry.modelId);
      const styling = getRankStyling(entry.rank ?? 999);
      return {
        participantIndex: entry.participantIndex,
        modelId: entry.modelId ?? '',
        modelName: avatarProps.name,
        provider: model?.provider ?? '',
        rank: entry.rank ?? 999,
        rating: entry.overallRating ?? 0,
        badge: entry.badge ?? '',
        avatarSrc: avatarProps.src,
        avatarName: avatarProps.name,
        ...styling,
      };
    });
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="space-y-3"
    >
      <div className="flex items-center gap-2 px-1">
        <Trophy className="size-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">{t('leaderboard')}</h3>
        <Badge variant="secondary" className="text-xs h-5">
          {leaderboard.length}
          {' '}
          models
        </Badge>
      </div>
      <div className="space-y-2">
        {rankedParticipants.map((participant, index) => (
          <motion.div
            key={`participant-${participant.participantIndex}`}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05, ease: 'easeOut' }}
            className={cn(
              'group relative rounded-lg border p-3 transition-all duration-200',
              'hover:shadow-md',
              participant.borderColor,
              participant.bgColor,
            )}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="flex items-center justify-center w-7 flex-shrink-0">
                {participant.Icon
                  ? (
                      <div className="flex items-center justify-center size-7 rounded-full bg-background/50 backdrop-blur-sm">
                        <participant.Icon className={cn('size-4', participant.iconColor)} />
                      </div>
                    )
                  : (
                      <div className="flex items-center justify-center size-7 rounded-full bg-muted">
                        <span className="text-xs font-bold text-muted-foreground">
                          {participant.rank}
                        </span>
                      </div>
                    )}
              </div>
              <Image
                src={participant.avatarSrc}
                alt={participant.avatarName}
                className="size-7 flex-shrink-0 object-contain"
                width={28}
                height={28}
                unoptimized
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {participant.modelName}
                </p>
                {participant.provider && (
                  <p className="text-xs text-muted-foreground truncate">
                    {participant.provider}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end flex-shrink-0">
                <span className={cn('text-base font-bold tabular-nums', participant.textColor)}>
                  {participant.rating.toFixed(1)}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  / 10
                </span>
              </div>
            </div>
            <div className="relative">
              <Progress
                value={(participant.rating / 10) * 100}
                className={cn('h-2', participant.rank <= 3 && 'bg-background/50')}
              />
              {participant.rank <= 3 && (
                <div
                  className={cn(
                    'absolute top-0 left-0 h-2 rounded-full transition-all',
                    participant.progressColor,
                  )}
                  style={{ width: `${(participant.rating / 10) * 100}%` }}
                />
              )}
            </div>
            {participant.badge && (
              <div className="mt-2 flex items-center gap-1">
                <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                  {participant.badge}
                </Badge>
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
