'use client';

import type { DeepPartial } from 'ai';
import { Info } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { ConfidenceAssessment, ModelVoice } from '@/api/routes/chat/schema';
import { ModelBadge } from '@/components/chat/model-badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/ui/cn';

import { CONFIDENCE_THRESHOLDS } from './moderator-ui-utils';

/**
 * Props accept both full types (from panel) and partial types (from streaming)
 * Following established pattern from analysis-utils.ts
 */
type RoundOutcomeHeaderProps = {
  confidence?: ConfidenceAssessment | DeepPartial<ConfidenceAssessment>;
  modelVoices?: ModelVoice[] | DeepPartial<ModelVoice[]>;
  isStreaming?: boolean;
};

/**
 * Get color class for confidence percentage (with border for header display)
 */
function getConfidenceColorWithBorder(percentage: number): string {
  if (percentage >= CONFIDENCE_THRESHOLDS.HIGH) {
    return 'text-emerald-500 border-emerald-500';
  }
  if (percentage >= CONFIDENCE_THRESHOLDS.MEDIUM) {
    return 'text-amber-500 border-amber-500';
  }
  return 'text-red-500 border-red-500';
}

/**
 * Get progress gradient color based on percentage
 */
function getProgressGradientColor(percentage: number): string {
  if (percentage >= CONFIDENCE_THRESHOLDS.HIGH) {
    return 'bg-gradient-to-r from-red-500 via-amber-500 to-emerald-500';
  }
  if (percentage >= CONFIDENCE_THRESHOLDS.MEDIUM) {
    return 'bg-gradient-to-r from-red-500 via-amber-500 to-amber-500';
  }
  return 'bg-gradient-to-r from-red-500 to-red-500';
}

/**
 * RoundOutcomeHeader - Article-Style Analysis
 *
 * Displays dynamic data from analysis:
 * - Overall confidence with reasoning
 * - Model voice badges
 */
export function RoundOutcomeHeader({
  confidence,
  modelVoices,
  isStreaming = false,
}: RoundOutcomeHeaderProps) {
  const t = useTranslations('moderator');

  const hasConfidence = confidence?.overall !== undefined && confidence.overall > 0;
  const hasModelVoices = modelVoices && modelVoices.length > 0;

  // Don't render if no dynamic data available
  if (!hasConfidence && !hasModelVoices) {
    return null;
  }

  const confidenceValue = confidence?.overall ?? 0;

  return (
    <div className="space-y-4">
      {/* Confidence Row - Always inline layout */}
      {hasConfidence && (
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-sm font-medium whitespace-nowrap">{t('roundOutcome.roundConfidence')}</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="size-3.5 text-muted-foreground cursor-help flex-shrink-0" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs text-xs">
                      {confidence?.reasoning || 'Overall confidence score based on model agreement and evidence strength'}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={cn('text-xl sm:text-2xl font-bold', getConfidenceColorWithBorder(confidenceValue))}>
                {confidenceValue}
                %
              </span>
            </div>
          </div>

          {/* Confidence Progress Bar */}
          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className={cn('h-full transition-all duration-500', getProgressGradientColor(confidenceValue))}
              style={{ width: `${confidenceValue}%` }}
            />
          </div>
        </>
      )}

      {/* Model Voices - horizontal scroll on mobile */}
      {hasModelVoices && (
        <ScrollArea className="w-full">
          <div className="flex items-center gap-2 pb-2">
            {modelVoices.map((voice, idx) => (
              voice?.modelId
                ? (
                    <ModelBadge
                      key={voice.participantIndex ?? idx}
                      modelId={voice.modelId}
                      role={voice.role ?? undefined}
                      size="sm"
                      className="flex-shrink-0"
                    />
                  )
                : null
            ))}
          </div>
          <ScrollBar orientation="horizontal" className="h-1.5" />
        </ScrollArea>
      )}

      {isStreaming && (
        <div className="flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-primary/60 animate-pulse" />
          <span className="text-xs text-muted-foreground">
            {t('analyzing')}
            ...
          </span>
        </div>
      )}
    </div>
  );
}
