'use client';
import { motion } from 'framer-motion';
import { CheckCircle2, XCircle } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';

import type { ParticipantAnalysis } from '@/api/routes/chat/schema';
import { cn } from '@/lib/ui/cn';
import { getAvatarPropsFromModelId } from '@/lib/utils/ai-display';

type ParticipantAnalysisCardProps = {
  analysis: ParticipantAnalysis;
  rank?: number;
};
export function ParticipantAnalysisCard({ analysis, rank }: ParticipantAnalysisCardProps) {
  const t = useTranslations('moderator');
  const avatarProps = getAvatarPropsFromModelId('assistant', analysis.modelId ?? '');
  const ratingDisplay = analysis.overallRating?.toFixed(1) ?? '–';
  const ratingColor = analysis.overallRating
    ? analysis.overallRating >= 8
      ? 'text-green-500'
      : analysis.overallRating >= 6
        ? 'text-yellow-500'
        : 'text-orange-500'
    : 'text-foreground/60';
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="relative w-full"
    >
      <div className="relative flex flex-col gap-3 p-3 rounded-lg bg-background/5">
        <div className="flex items-center gap-3">
          <div className="relative flex-shrink-0">
            <div className="relative w-10 h-10 flex items-center justify-center">
              <Image
                src={avatarProps.src}
                alt={avatarProps.name}
                width={40}
                height={40}
                className="w-full h-full object-contain [image-rendering:crisp-edges]"
                unoptimized
              />
            </div>
            {rank && rank <= 3 && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.1, type: 'spring' }}
                className={cn(
                  'absolute -top-0.5 -right-0.5 size-5 rounded-full flex items-center justify-center text-[10px] font-bold',
                  rank === 1 && 'bg-yellow-500 text-black',
                  rank === 2 && 'bg-gray-400 text-black',
                  rank === 3 && 'bg-orange-600 text-white',
                )}
              >
                {rank}
              </motion.div>
            )}
          </div>
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
          <div className="flex-shrink-0">
            <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-background/20">
              <span className={cn('text-lg font-bold', ratingColor)}>
                {ratingDisplay}
              </span>
              <span className="text-[10px] text-foreground/60">/10</span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-3.5 text-green-500 flex-shrink-0" />
              <h4 className="text-xs font-semibold text-foreground">{t('strengths')}</h4>
            </div>
            <ul className="space-y-1 text-foreground/80">
              {(analysis.pros ?? []).slice(0, 3).map(pro => (
                <li
                  key={`pro-${analysis.participantIndex ?? 'unknown'}-${pro.substring(0, 50)}`}
                  className="flex items-start gap-2"
                >
                  <span className="text-green-500 flex-shrink-0 text-xs mt-0.5">✓</span>
                  <span className="flex-1 leading-relaxed text-xs">{pro}</span>
                </li>
              ))}
              {(analysis.pros?.length ?? 0) > 3 && (
                <li className="text-foreground/50 text-[10px]">
                  +
                  {(analysis.pros?.length ?? 0) - 3}
                  {' '}
                  more
                </li>
              )}
            </ul>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <XCircle className="size-3.5 text-orange-500 flex-shrink-0" />
              <h4 className="text-xs font-semibold text-foreground">{t('areasForImprovement')}</h4>
            </div>
            <ul className="space-y-1 text-foreground/80">
              {(analysis.cons ?? []).slice(0, 3).map(con => (
                <li
                  key={`con-${analysis.participantIndex ?? 'unknown'}-${con.substring(0, 50)}`}
                  className="flex items-start gap-2"
                >
                  <span className="text-orange-500 flex-shrink-0 text-xs mt-0.5">!</span>
                  <span className="flex-1 leading-relaxed text-xs">{con}</span>
                </li>
              ))}
              {(analysis.cons?.length ?? 0) > 3 && (
                <li className="text-foreground/50 text-[10px]">
                  +
                  {(analysis.cons?.length ?? 0) - 3}
                  {' '}
                  more
                </li>
              )}
            </ul>
          </div>
        </div>
        {analysis.summary && (
          <div className="space-y-1">
            <h4 className="text-xs font-semibold text-foreground">{t('summary')}</h4>
            <p className="text-xs text-foreground/80 leading-relaxed">
              {analysis.summary}
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
