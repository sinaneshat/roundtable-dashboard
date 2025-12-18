'use client';
import { experimental_useObject as useObject } from '@ai-sdk/react';
import { useTranslations } from 'next-intl';
import { memo, useEffect, useRef } from 'react';

import { MessageStatuses } from '@/api/core/enums';
import type {
  RoundSummaryAIContent,
  StoredRoundSummary,
} from '@/api/routes/chat/schema';
import { RoundSummaryAIContentSchema } from '@/api/routes/chat/schema';
import { TextShimmer } from '@/components/ai-elements/shimmer';
import { useChatStore } from '@/components/providers/chat-store-provider';
import { hasSummaryData } from '@/lib/utils/summary-utils';
import { getSummaryResumeService } from '@/services/api';

import { RoundSummaryText } from './round-summary-text';

// ============================================================================
// RESUMABLE STREAMS: Attempt to resume summary from buffer on page reload
// ============================================================================

/**
 * Attempt to resume a summary stream from KV buffer
 * Returns the parsed summary data if successful, null otherwise
 *
 * @pattern Following stream-resume.handler.ts pattern for chat streams
 *
 * Response handling:
 * - 204 No Content: No buffer available
 * - 200 OK with X-Stream-Status: completed: Complete data available
 * - 200 OK without header: Legacy/fallback, try to parse
 */
async function attemptSummaryResume(
  threadId: string,
  roundNumber: number,
): Promise<{ success: true; data: RoundSummaryAIContent } | { success: false; reason: 'no-buffer' | 'incomplete' | 'error' }> {
  try {
    // ✅ TYPE-SAFE: Use service with RPC-compliant structure
    const response = await getSummaryResumeService({
      param: { threadId, roundNumber: roundNumber.toString() },
    });

    // 204 No Content = no buffer available
    if (response.status === 204) {
      return { success: false, reason: 'no-buffer' };
    }

    // Non-200 = error
    if (!response.ok) {
      console.error('[RoundSummaryStream] Resume request failed:', response.status);
      return { success: false, reason: 'error' };
    }

    // Check X-Stream-Status header
    const streamStatus = response.headers.get('X-Stream-Status');

    // If status header indicates completed, data should be complete
    if (streamStatus === 'completed') {
      const bufferedText = await response.text();

      if (!bufferedText || bufferedText.trim() === '') {
        return { success: false, reason: 'no-buffer' };
      }

      try {
        const parsed = JSON.parse(bufferedText);
        const validated = RoundSummaryAIContentSchema.safeParse(parsed);

        if (validated.success) {
          return { success: true, data: validated.data };
        }

        // Even with completed status, schema validation might fail
        // Check if we have enough data to be useful
        if (hasSummaryData(parsed)) {
          return { success: true, data: parsed as RoundSummaryAIContent };
        }

        return { success: false, reason: 'incomplete' };
      } catch {
        // JSON parse failed even though status said completed
        return { success: false, reason: 'incomplete' };
      }
    }

    // No status header (legacy) or unknown status - try to parse
    const bufferedText = await response.text();

    if (!bufferedText || bufferedText.trim() === '') {
      return { success: false, reason: 'no-buffer' };
    }

    try {
      const parsed = JSON.parse(bufferedText);
      const validated = RoundSummaryAIContentSchema.safeParse(parsed);

      if (validated.success) {
        return { success: true, data: validated.data };
      }

      if (hasSummaryData(parsed)) {
        return { success: true, data: parsed as RoundSummaryAIContent };
      }

      return { success: false, reason: 'incomplete' };
    } catch {
      return { success: false, reason: 'incomplete' };
    }
  } catch (error) {
    console.error('[RoundSummaryStream] Resume attempt failed:', error);
    return { success: false, reason: 'error' };
  }
}

type RoundSummaryStreamProps = {
  threadId: string;
  summary: StoredRoundSummary;
  // ✅ AI SDK v5: Uses RoundSummaryAIContent (summary + metrics only)
  // Metadata (roundNumber, mode, userQuestion) is stored in DB row, not streamed
  onStreamComplete?: (completedSummaryData?: RoundSummaryAIContent | null, error?: Error | null) => void;
  onStreamStart?: () => void;
};

/**
 * ✅ AI SDK v5 PATTERN: Simplified object streaming
 *
 * Following the AI SDK v5 crash course patterns exactly:
 * 1. Use `error` from useObject for error display (not ignored)
 * 2. Render partial data immediately with optional chaining
 * 3. Simple `onFinish` - just call completion callback
 * 4. Use `isLoading` for loading state
 * 5. Let backend handle retries via streamObject
 *
 * @see AI SDK v5 crash course: "object generations and gradual ui streams"
 */
function RoundSummaryStreamComponent({
  threadId,
  summary,
  onStreamComplete,
  onStreamStart,
}: RoundSummaryStreamProps) {
  const t = useTranslations('moderator');

  // ✅ ZUSTAND: Summary stream tracking from store
  const markSummaryStreamTriggered = useChatStore(s => s.markSummaryStreamTriggered);
  const hasSummaryStreamBeenTriggered = useChatStore(s => s.hasSummaryStreamBeenTriggered);

  // ✅ Store callbacks in refs for stability
  const onStreamCompleteRef = useRef(onStreamComplete);
  const onStreamStartRef = useRef(onStreamStart);

  useEffect(() => {
    onStreamCompleteRef.current = onStreamComplete;
  }, [onStreamComplete]);

  useEffect(() => {
    onStreamStartRef.current = onStreamStart;
  }, [onStreamStart]);

  // ✅ AI SDK v5 PATTERN: useObject hook for streaming structured data
  // Server uses streamObject → client receives partial objects progressively
  const { object: partialSummary, error, submit, isLoading: isStreamLoading } = useObject({
    api: `/api/v1/chat/threads/${threadId}/rounds/${summary.roundNumber}/summarize`,
    schema: RoundSummaryAIContentSchema,
    // ✅ AI SDK v5 PATTERN: Simple onFinish - just call completion callback
    onFinish: ({ object: finalObject, error: streamError }) => {
      if (finalObject && hasSummaryData(finalObject)) {
        onStreamCompleteRef.current?.(finalObject as RoundSummaryAIContent);
      } else if (streamError) {
        onStreamCompleteRef.current?.(null, streamError);
      }
    },
  });

  // ✅ STREAM TRIGGER: Effect to start stream when summary becomes pending
  useEffect(() => {
    const alreadyTriggered = hasSummaryStreamBeenTriggered(summary.id, summary.roundNumber);
    const shouldTrigger = !alreadyTriggered
      && (summary.status === MessageStatuses.PENDING || summary.status === MessageStatuses.STREAMING);

    if (!submit || !shouldTrigger) {
      return;
    }

    markSummaryStreamTriggered(summary.id, summary.roundNumber);

    const messageIds = summary.participantMessageIds;
    const roundNumber = summary.roundNumber;
    const submitFn = submit;

    queueMicrotask(async () => {
      onStreamStartRef.current?.();

      // Try resume from buffer for STREAMING status (page refresh scenario)
      if (summary.status === MessageStatuses.STREAMING) {
        const resumeResult = await attemptSummaryResume(threadId, roundNumber);
        if (resumeResult.success) {
          onStreamCompleteRef.current?.(resumeResult.data);
          return;
        }
      }

      // Start new stream
      submitFn({ participantMessageIds: messageIds });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- participantMessageIds excluded to avoid re-trigger
  }, [summary.id, summary.roundNumber, summary.status, threadId, hasSummaryStreamBeenTriggered, markSummaryStreamTriggered, submit]);

  // Mark completed/failed summaries as triggered
  const alreadyMarked = hasSummaryStreamBeenTriggered(summary.id, summary.roundNumber);
  if (!alreadyMarked && (summary.status === MessageStatuses.COMPLETE || summary.status === MessageStatuses.FAILED)) {
    markSummaryStreamTriggered(summary.id, summary.roundNumber);
  }

  // ✅ AI SDK v5 PATTERN: Display data with optional chaining
  // PENDING/STREAMING: Use partial object from stream
  // COMPLETE: Use stored summaryData from database
  const displayData = summary.status === MessageStatuses.COMPLETE
    ? summary.summaryData
    : (partialSummary as RoundSummaryAIContent | undefined);

  // ✅ AI SDK v5 PATTERN: Check for data using optional chaining
  const hasData = hasSummaryData(displayData);
  const isPendingWithNoData = (summary.status === MessageStatuses.PENDING || summary.status === MessageStatuses.STREAMING) && !hasData;

  // Don't render if no data and not pending/streaming
  if (!hasData && !isPendingWithNoData) {
    return null;
  }

  // ✅ AI SDK v5 PATTERN: Use isLoading from hook for streaming state
  const isCurrentlyStreaming = summary.status === MessageStatuses.STREAMING || isStreamLoading;

  // ✅ AI SDK v5 PATTERN: Render with optional chaining for partial data
  return (
    <div className="space-y-2">
      {/* ✅ AI SDK v5: Show error from hook */}
      {error && (
        <div className="text-destructive text-sm py-2">
          {t('errors.streamError')}
        </div>
      )}

      {/* Show shimmer when no data yet */}
      {isPendingWithNoData && !error && (
        <div className="flex items-center justify-center py-4 text-muted-foreground text-sm">
          <TextShimmer>{t('pendingSummary')}</TextShimmer>
        </div>
      )}

      {/* ✅ AI SDK v5 PATTERN: Render partial data immediately as it streams */}
      {hasData && (
        <RoundSummaryText
          summary={displayData?.summary}
          metrics={displayData?.metrics}
          isStreaming={isCurrentlyStreaming}
        />
      )}
    </div>
  );
}
export const RoundSummaryStream = memo(RoundSummaryStreamComponent, (prevProps, nextProps) => {
  return (
    prevProps.summary.id === nextProps.summary.id
    && prevProps.summary.status === nextProps.summary.status
    && prevProps.summary.summaryData === nextProps.summary.summaryData
    && prevProps.threadId === nextProps.threadId
    && prevProps.onStreamComplete === nextProps.onStreamComplete
    && prevProps.onStreamStart === nextProps.onStreamStart
  );
});
