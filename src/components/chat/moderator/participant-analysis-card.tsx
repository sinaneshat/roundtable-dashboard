'use client';

/**
 * ParticipantAnalysisCard Component
 *
 * ✅ CLEAN MINIMALIST DESIGN:
 * - NO separators or borders
 * - NO count badges
 * - Uses getAvatarPropsFromModelId for proper icon loading
 * - Simple card with pros/cons and summary
 * - High contrast text
 * ✅ ZERO HARDCODING: Import types from RPC schema
 */

import { motion } from 'framer-motion';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { ParticipantAnalysis } from '@/api/routes/chat/schema';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getAvatarPropsFromModelId } from '@/lib/ai/avatar-helpers';
import { cn } from '@/lib/ui/cn';

type ParticipantAnalysisCardProps = {
  analysis: ParticipantAnalysis;
  rank?: number;
};

/**
 * ParticipantAnalysisCard - Minimal, borderless card for participant summary
 *
 * @param props - Component props
 * @param props.analysis - Participant analysis data
 * @param props.rank - Optional rank in leaderboard
 */
export function ParticipantAnalysisCard({ analysis, rank }: ParticipantAnalysisCardProps) {
  const t = useTranslations('moderator');

  // ✅ Use getAvatarPropsFromModelId to get proper model icon
  const avatarProps = getAvatarPropsFromModelId('assistant', analysis.modelId);

  // Format rating for display
  const ratingDisplay = analysis.overallRating.toFixed(1);
  const ratingColor = analysis.overallRating >= 8
    ? 'text-green-500'
    : analysis.overallRating >= 6
      ? 'text-yellow-500'
      : 'text-orange-500';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="relative w-full"
    >
      {/* Minimal container - NO borders */}
      <div className="relative flex flex-col gap-3 p-3 rounded-lg bg-background/5">
        {/* Header: Avatar + Model Info + Rating */}
        <div className="flex items-center gap-3">
          {/* Model Avatar with rank badge */}
          <div className="relative flex-shrink-0">
            <Avatar className="size-10 ring-1 ring-white/10">
              <AvatarImage src={avatarProps.src} alt={avatarProps.name} />
              <AvatarFallback className="text-xs font-semibold">
                {avatarProps.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {rank && rank <= 3 && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring' }}
                className={cn(
                  'absolute -top-1 -right-1 size-5 rounded-full flex items-center justify-center text-[10px] font-bold',
                  rank === 1 && 'bg-yellow-500 text-black',
                  rank === 2 && 'bg-gray-400 text-black',
                  rank === 3 && 'bg-orange-600 text-white',
                )}
              >
                {rank}
              </motion.div>
            )}
          </div>

          {/* Model Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-foreground">
                {avatarProps.name}
              </h3>
              {analysis.participantRole && (
                <span className="text-xs text-foreground/60">
                  •
                  {' '}
                  {analysis.participantRole}
                </span>
              )}
            </div>
          </div>

          {/* Rating Badge - Compact */}
          <div className="flex-shrink-0">
            <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-background/20">
              <span className={cn('text-lg font-bold', ratingColor)}>
                {ratingDisplay}
              </span>
              <span className="text-[10px] text-foreground/60">/10</span>
            </div>
          </div>
        </div>

        {/* Pros & Cons Grid - Compact */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          {/* Pros */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="size-3 text-green-500 flex-shrink-0" />
              <h4 className="text-xs font-semibold text-foreground">{t('strengths')}</h4>
            </div>
            <ul className="space-y-1 text-foreground/80">
              {analysis.pros.slice(0, 3).map(pro => (
                <li
                  key={`pro-${analysis.participantIndex}-${pro.substring(0, 20)}`}
                  className="flex items-start gap-1.5"
                >
                  <span className="text-green-500 flex-shrink-0 text-[10px]">✓</span>
                  <span className="flex-1 leading-tight">{pro}</span>
                </li>
              ))}
              {analysis.pros.length > 3 && (
                <li className="text-foreground/50 text-[10px]">
                  +
                  {analysis.pros.length - 3}
                  {' '}
                  more
                </li>
              )}
            </ul>
          </div>

          {/* Cons */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <XCircle className="size-3 text-orange-500 flex-shrink-0" />
              <h4 className="text-xs font-semibold text-foreground">{t('areasForImprovement')}</h4>
            </div>
            <ul className="space-y-1 text-foreground/80">
              {analysis.cons.slice(0, 3).map(con => (
                <li
                  key={`con-${analysis.participantIndex}-${con.substring(0, 20)}`}
                  className="flex items-start gap-1.5"
                >
                  <span className="text-orange-500 flex-shrink-0 text-[10px]">!</span>
                  <span className="flex-1 leading-tight">{con}</span>
                </li>
              ))}
              {analysis.cons.length > 3 && (
                <li className="text-foreground/50 text-[10px]">
                  +
                  {analysis.cons.length - 3}
                  {' '}
                  more
                </li>
              )}
            </ul>
          </div>
        </div>

        {/* Summary - Compact */}
        <div className="space-y-1">
          <h4 className="text-xs font-semibold text-foreground">{t('summary')}</h4>
          <p className="text-xs text-foreground/80 leading-relaxed">
            {analysis.summary}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
