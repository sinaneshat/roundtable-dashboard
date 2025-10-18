'use client';

/**
 * Round Analysis Card Component
 *
 * ✅ AI SDK V5 REAL-TIME STREAMING PATTERN:
 * - Backend creates 'pending' analysis record when round completes
 * - Frontend detects 'pending' and streams analysis in real-time using experimental_useObject
 * - Uses ModeratorAnalysisStream for progressive UI updates
 * - Uses ChainOfThought accordion for consistent UI
 * - Shows status badges and loading indicators
 * - Polling automatically detects when analysis completes
 */

import { Award, Clock, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { StoredModeratorAnalysis } from '@/api/routes/chat/schema';
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
} from '@/components/ai-elements/chain-of-thought';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/ui/cn';

import { LeaderboardCard } from './leaderboard-card';
import { ModeratorAnalysisStream } from './moderator-analysis-stream';
import { ParticipantAnalysisCard } from './participant-analysis-card';
import { SkillsComparisonChart } from './skills-comparison-chart';

type RoundAnalysisCardProps = {
  analysis: StoredModeratorAnalysis;
  threadId: string;
  isLatest?: boolean;
  className?: string;
};

/**
 * Round Analysis Card - Accordion UI for moderator analysis
 *
 * ✅ AI SDK V5 REAL-TIME STREAMING PATTERN:
 * - Backend creates 'pending' analysis when round completes
 * - Component detects 'pending' and streams analysis in real-time
 * - Uses ModeratorAnalysisStream for progressive UI updates
 * - Shows completed analyses from database
 * - Polling detects when streaming completes and updates
 */
export function RoundAnalysisCard({
  analysis,
  threadId,
  isLatest = false,
  className,
}: RoundAnalysisCardProps) {
  const t = useTranslations('moderator');

  // ✅ TIMEOUT CHECK: If analysis is pending/streaming for > 2 minutes, treat as failed
  const TWO_MINUTES_MS = 2 * 60 * 1000;
  const ageMs = Date.now() - new Date(analysis.createdAt).getTime();
  const isStuck = ageMs > TWO_MINUTES_MS && (analysis.status === 'pending' || analysis.status === 'streaming');

  // Override status if stuck
  const effectiveStatus = isStuck ? 'failed' : analysis.status;
  const effectiveErrorMessage = isStuck
    ? 'Analysis timed out after 2 minutes. Backend generation may have failed.'
    : analysis.errorMessage;

  // Status configuration
  const statusConfig = {
    pending: {
      label: t('analyzing'),
      color: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
      icon: Loader2,
      iconClass: 'animate-spin',
    },
    streaming: {
      label: t('analyzing'),
      color: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
      icon: Loader2,
      iconClass: 'animate-spin',
    },
    completed: {
      label: t('completed'),
      color: 'bg-green-500/10 text-green-500 border-green-500/20',
      icon: Award,
      iconClass: '',
    },
    failed: {
      label: t('failed'),
      color: 'bg-red-500/10 text-red-500 border-red-500/20',
      icon: Award,
      iconClass: '',
    },
  } as const;

  const config = statusConfig[effectiveStatus];
  const StatusIcon = config.icon;

  // ✅ Auto-open if this is the latest round (regardless of status)
  // Earlier rounds remain collapsed by default
  const shouldDefaultOpen = isLatest;

  console.warn('[RoundAnalysisCard] Rendering:', {
    roundNumber: analysis.roundNumber,
    status: analysis.status,
    effectiveStatus,
    isStuck,
    ageMs,
    isLatest,
    shouldDefaultOpen,
    participantMessageIds: analysis.participantMessageIds.length,
  });

  return (
    <div className={cn('py-2', className)}>
      <ChainOfThought defaultOpen={shouldDefaultOpen}>
        <ChainOfThoughtHeader>
          <div className="flex items-center gap-2 w-full">
            <Clock className="size-4 text-muted-foreground flex-shrink-0" />
            <span className="text-sm font-medium">
              {t('roundAnalysis', { number: analysis.roundNumber })}
            </span>

            {/* Status Badge */}
            <Badge
              variant="outline"
              className={cn('text-xs', config.color)}
            >
              <StatusIcon className={cn('size-3 mr-1', config.iconClass)} />
              {config.label}
            </Badge>

            {/* Mode Badge */}
            <span className="hidden md:inline text-xs text-muted-foreground">•</span>
            <span className="hidden md:inline text-xs text-muted-foreground capitalize">
              {t(`mode.${analysis.mode}`)}
            </span>
          </div>
        </ChainOfThoughtHeader>

        <ChainOfThoughtContent>
          <div className="space-y-4">
            {/* Question Context */}
            {analysis.userQuestion && analysis.userQuestion !== 'N/A' && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">Question:</p>
                <p className="text-sm text-foreground/80">
                  {analysis.userQuestion}
                </p>
              </div>
            )}

            {/* Analysis Content */}
            {effectiveStatus === 'pending' || effectiveStatus === 'streaming'
              ? (
                  // ✅ REAL-TIME STREAMING: Use ModeratorAnalysisStream for progressive UI updates
                  // Displays partial objects as they're generated by the backend
                  <ModeratorAnalysisStream
                    threadId={threadId}
                    analysis={analysis}
                    onStreamComplete={() => {
                      console.warn('[RoundAnalysisCard] Stream completed for round', analysis.roundNumber);
                      // Polling will automatically detect the completed analysis and re-render
                    }}
                  />
                )
              : effectiveStatus === 'completed' && analysis.analysisData
                ? (
                    // ✅ COMPLETED: Show completed analysis from database
                    <div className="space-y-4">
                      {/* Leaderboard */}
                      {analysis.analysisData.leaderboard && analysis.analysisData.leaderboard.length > 0 && (
                        <LeaderboardCard leaderboard={analysis.analysisData.leaderboard} />
                      )}

                      {/* Skills Comparison Chart */}
                      {analysis.analysisData.participantAnalyses && analysis.analysisData.participantAnalyses.length > 0 && (
                        <SkillsComparisonChart participants={analysis.analysisData.participantAnalyses} />
                      )}

                      {/* Participant Analysis Cards */}
                      {analysis.analysisData.participantAnalyses && analysis.analysisData.participantAnalyses.length > 0 && (
                        <div className="space-y-3">
                          {analysis.analysisData.participantAnalyses.map(participant => (
                            <ParticipantAnalysisCard
                              key={`${analysis.id}-participant-${participant.participantIndex}`}
                              analysis={participant}
                            />
                          ))}
                        </div>
                      )}

                      {/* Overall Summary */}
                      {analysis.analysisData.overallSummary && (
                        <div className="space-y-2 pt-2">
                          <h3 className="text-sm font-semibold">{t('summary')}</h3>
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            {analysis.analysisData.overallSummary}
                          </p>
                        </div>
                      )}

                      {/* Conclusion */}
                      {analysis.analysisData.conclusion && (
                        <div className="space-y-2 pt-2">
                          <h3 className="text-sm font-semibold text-primary">{t('conclusion')}</h3>
                          <p className="text-sm leading-relaxed">
                            {analysis.analysisData.conclusion}
                          </p>
                        </div>
                      )}
                    </div>
                  )
                : effectiveStatus === 'failed'
                  ? (
                      <div className="flex items-center gap-2 py-2 text-sm text-destructive">
                        <span className="size-1.5 rounded-full bg-destructive/80" />
                        <span>{effectiveErrorMessage || t('errorAnalyzing')}</span>
                      </div>
                    )
                  : null}
          </div>
        </ChainOfThoughtContent>
      </ChainOfThought>
    </div>
  );
}
