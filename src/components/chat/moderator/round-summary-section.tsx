'use client';

import { HelpCircle, ThumbsDown, ThumbsUp } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import type { Recommendation, RoundSummary } from '@/api/routes/chat/schema';
import { Badge } from '@/components/ui/badge';
import { StreamingCursor } from '@/components/ui/streaming-text';

type RoundSummarySectionProps = {
  roundSummary: Partial<RoundSummary>;
  onActionClick?: (action: Recommendation) => void;
  isStreaming?: boolean;
};

/**
 * RoundSummarySection - Multi-AI Deliberation Framework
 *
 * Displays round summary with participation stats, key themes, and unresolved questions.
 * Simplified layout without excessive borders.
 * Items animate in top-to-bottom order with 40ms stagger.
 */
export function RoundSummarySection({
  roundSummary,
  onActionClick: _onActionClick,
  isStreaming = false,
}: RoundSummarySectionProps) {
  const t = useTranslations('moderator');

  const {
    participation,
    keyThemes,
    unresolvedQuestions,
  } = roundSummary;

  const hasAnyContent = participation
    || keyThemes
    || (unresolvedQuestions && unresolvedQuestions.length > 0);

  if (!hasAnyContent) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Participation Stats */}
      {participation && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {t('roundSummary.participation')}
            :
          </span>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1 bg-green-500/10 text-green-600 border-green-500/30">
              <ThumbsUp className="size-3" />
              {participation.approved}
            </Badge>
            <Badge variant="outline" className="gap-1 bg-amber-500/10 text-amber-600 border-amber-500/30">
              <HelpCircle className="size-3" />
              {participation.cautioned}
            </Badge>
            <Badge variant="outline" className="gap-1 bg-red-500/10 text-red-600 border-red-500/30">
              <ThumbsDown className="size-3" />
              {participation.rejected}
            </Badge>
          </div>
        </div>
      )}

      {/* Key Themes with streaming cursor */}
      {keyThemes && (
        <div className="space-y-2">
          <span className="text-sm font-medium">{t('roundSummary.keyThemes')}</span>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {keyThemes}
            {isStreaming && <StreamingCursor />}
          </p>
        </div>
      )}

      {/* Unresolved Questions */}
      {unresolvedQuestions && unresolvedQuestions.length > 0 && (
        <div className="space-y-2">
          <span className="text-sm font-medium">{t('roundSummary.unresolvedQuestions')}</span>
          <ul className="space-y-1.5">
            {unresolvedQuestions.map((question, index) => (
              <motion.li
                key={question}
                className="flex items-start gap-2 text-sm text-muted-foreground"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.2,
                  delay: index * 0.04,
                  ease: 'easeOut',
                }}
              >
                <span className="size-1 mt-2 rounded-full bg-muted-foreground/60 flex-shrink-0" />
                <span className="leading-relaxed">{question}</span>
              </motion.li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
