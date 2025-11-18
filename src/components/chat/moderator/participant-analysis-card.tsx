'use client';
import Image from 'next/image';
import { useTranslations } from 'next-intl';

import type { ParticipantAnalysis } from '@/api/routes/chat/schema';
import { AnimatedBadge } from '@/components/ui/animated-card';
import { FadeInText, TypingText } from '@/components/ui/typing-text';
import { cn } from '@/lib/ui/cn';
import { getAvatarPropsFromModelId } from '@/lib/utils/ai-display';

type ParticipantAnalysisCardProps = {
  analysis: ParticipantAnalysis;
  rank?: number;
  isStreaming?: boolean;
};
export function ParticipantAnalysisCard({ analysis, rank, isStreaming = false }: ParticipantAnalysisCardProps) {
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
    <div className="relative w-full flex flex-col gap-2.5 py-2">
      <div className="flex items-center gap-3">
        <FadeInText delay={0.05}>
          <div className="relative flex-shrink-0">
            <div className="relative w-8 h-8 flex items-center justify-center">
              <Image
                src={avatarProps.src}
                alt={avatarProps.name}
                width={32}
                height={32}
                className="w-full h-full object-contain [image-rendering:crisp-edges]"
                unoptimized
              />
            </div>
            {rank && rank <= 3 && (
              <AnimatedBadge delay={0.1}>
                <div
                  className={cn(
                    'absolute -top-0.5 -right-0.5 size-4 rounded-full flex items-center justify-center text-[9px] font-bold',
                    rank === 1 && 'bg-yellow-500 text-black',
                    rank === 2 && 'bg-gray-400 text-black',
                    rank === 3 && 'bg-orange-600 text-white',
                  )}
                >
                  {rank}
                </div>
              </AnimatedBadge>
            )}
          </div>
        </FadeInText>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <FadeInText delay={0.1}>
              <h3 className="text-sm font-medium text-foreground">
                {analysis.modelName ?? avatarProps.name}
              </h3>
            </FadeInText>
            {analysis.participantRole && (
              <FadeInText delay={0.15}>
                <span className="text-xs text-muted-foreground">
                  •
                  {' '}
                  {analysis.participantRole}
                </span>
              </FadeInText>
            )}
          </div>
        </div>
        <FadeInText delay={0.2}>
          <div className="flex-shrink-0">
            <span className={cn('text-base font-semibold', ratingColor)}>
              {ratingDisplay}
              <span className="text-[10px] text-muted-foreground">/10</span>
            </span>
          </div>
        </FadeInText>
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="space-y-1">
          <FadeInText delay={0.25}>
            <h4 className="text-xs font-medium text-muted-foreground">{t('strengths')}</h4>
          </FadeInText>
          <ul className="space-y-0.5 text-foreground/80">
            {(analysis.pros ?? []).slice(0, 3).map((pro, idx) => (
              <FadeInText
                key={`pro-${analysis.participantIndex ?? 'unknown'}-${pro.substring(0, 50)}`}
                delay={0.3 + (idx * 0.05)}
              >
                <li className="flex items-start gap-1.5">
                  <span className="text-green-500 flex-shrink-0 text-xs mt-0.5">✓</span>
                  <span className="flex-1 leading-relaxed text-xs">
                    <TypingText text={pro} speed={5} delay={50 * idx} enabled={isStreaming} />
                  </span>
                </li>
              </FadeInText>
            ))}
            {(analysis.pros?.length ?? 0) > 3 && (
              <FadeInText delay={0.45}>
                <li className="text-muted-foreground text-[10px]">
                  +
                  {(analysis.pros?.length ?? 0) - 3}
                  {' '}
                  more
                </li>
              </FadeInText>
            )}
          </ul>
        </div>
        <div className="space-y-1">
          <FadeInText delay={0.25}>
            <h4 className="text-xs font-medium text-muted-foreground">{t('areasForImprovement')}</h4>
          </FadeInText>
          <ul className="space-y-0.5 text-foreground/80">
            {(analysis.cons ?? []).slice(0, 3).map((con, idx) => (
              <FadeInText
                key={`con-${analysis.participantIndex ?? 'unknown'}-${con.substring(0, 50)}`}
                delay={0.3 + (idx * 0.05)}
              >
                <li className="flex items-start gap-1.5">
                  <span className="text-orange-500 flex-shrink-0 text-xs mt-0.5">!</span>
                  <span className="flex-1 leading-relaxed text-xs">
                    <TypingText text={con} speed={5} delay={50 * idx} enabled={isStreaming} />
                  </span>
                </li>
              </FadeInText>
            ))}
            {(analysis.cons?.length ?? 0) > 3 && (
              <FadeInText delay={0.45}>
                <li className="text-muted-foreground text-[10px]">
                  +
                  {(analysis.cons?.length ?? 0) - 3}
                  {' '}
                  more
                </li>
              </FadeInText>
            )}
          </ul>
        </div>
      </div>
      {analysis.summary && (
        <div className="space-y-1">
          <FadeInText delay={0.5}>
            <h4 className="text-xs font-medium text-muted-foreground">{t('summary')}</h4>
          </FadeInText>
          <p className="text-xs text-foreground/80 leading-relaxed">
            <TypingText text={analysis.summary} speed={8} delay={550} enabled={isStreaming} />
          </p>
        </div>
      )}
    </div>
  );
}
