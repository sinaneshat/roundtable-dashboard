/**
 * Moderator Trigger Hook
 *
 * SIMPLIFIED VERSION: Backend controls moderator triggering.
 *
 * **ARCHITECTURE**:
 * - Backend's round_execution state machine moves to MODERATOR phase after participants complete
 * - Backend queue worker sends TRIGGER_MODERATOR message automatically
 * - Frontend subscribes to SSE stream and displays content
 *
 * This hook previously:
 * - Watched participant completion and decided WHEN to trigger moderator
 * - Contained complex retry logic and race condition guards
 *
 * Now it ONLY provides:
 * - A manual `triggerModerator` callback for user-initiated retries
 * - Stream handling for displaying moderator response (when backend sends it)
 *
 * The automatic triggering logic is now in:
 * - apps/api/src/services/streaming/background-stream-execution.service.ts
 * - apps/api/src/workers/round-orchestration-queue.ts
 */

import type { DbModeratorMessageMetadata } from '@roundtable/shared';
import {
  MessagePartTypes,
  MODERATOR_PARTICIPANT_INDEX,
  TextPartStates,
  UIMessageRoles,
} from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { useCallback, useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import { RETRY_LIMITS } from '@/constants';
import { getRoundNumber, isObject } from '@/lib/utils';
import { rlog } from '@/lib/utils/dev-logger';
import { streamModeratorService } from '@/services/api';
import type { ChatStoreApi } from '@/stores/chat';

type UseModeratorTriggerOptions = {
  store: ChatStoreApi;
};

/** Max retries for moderator streaming */
const MAX_MODERATOR_RETRIES = 3;

function parseAiSdkStreamLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('0:')) {
    try {
      const jsonStr = trimmed.slice(2);
      const parsed = JSON.parse(jsonStr);
      if (typeof parsed === 'string') {
        return parsed;
      }
    } catch {
      // Not valid JSON, skip
    }
  }

  if (trimmed.startsWith('data: ')) {
    const jsonStr = trimmed.slice(6);
    if (jsonStr === '[DONE]') {
      return null;
    }

    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed && typeof parsed === 'object') {
        if (parsed.type === 'text-delta') {
          return parsed.textDelta || parsed.delta || parsed.text || '';
        }
      }
    } catch {
      // Not valid JSON, skip
    }
  }

  return null;
}

/**
 * Hook for moderator stream handling.
 *
 * **NO AUTOMATIC TRIGGERING**: Backend decides when moderator runs.
 * This hook provides manual trigger for retries and handles stream display.
 */
export function useModeratorTrigger({ store }: UseModeratorTriggerOptions) {
  const { createdThreadId, threadId } = useStore(store, useShallow(s => ({
    createdThreadId: s.createdThreadId,
    threadId: s.thread?.id,
  })));

  const abortControllerRef = useRef<AbortController | null>(null);
  const triggeringRoundRef = useRef<number | null>(null);
  const retryCountRef = useRef<number>(0);
  // ✅ RACE FIX: Track pending retry timeout to prevent overlapping retries
  const retryInProgressRef = useRef<NodeJS.Timeout | null>(null);

  const effectiveThreadId = threadId || createdThreadId || '';

  /**
   * Manual trigger for moderator stream.
   * Used for:
   * - User-initiated retries
   * - Edge cases where backend trigger didn't reach frontend
   *
   * NOT used for automatic triggering - backend handles that via queue.
   */
  const triggerModerator = useCallback(async (
    roundNumber: number,
    participantMessageIds: string[],
    isRetry = false,
  ) => {
    const trigRef = triggeringRoundRef;
    const abortRef = abortControllerRef;
    const retryRef = retryCountRef;

    const state = store.getState();
    const freshThreadId = state.thread?.id || state.createdThreadId || '';

    rlog.sync('moderator-trigger', `r${roundNumber} threadId=${freshThreadId.slice(-8)} isRetry=${isRetry} triggeringRef=${trigRef.current} msgIds=${participantMessageIds.length}:[${participantMessageIds.map(id => id.slice(-15)).join(',')}]`);

    if (!freshThreadId) {
      rlog.sync('moderator-skip', 'no threadId');
      return;
    }

    const moderatorId = `${freshThreadId}_r${roundNumber}_moderator`;

    // Check if already triggering this round
    if (trigRef.current === roundNumber && !isRetry) {
      rlog.sync('moderator-skip', `already triggering r${roundNumber}`);
      return;
    }

    // Check retry limit
    if (isRetry && retryRef.current >= MAX_MODERATOR_RETRIES) {
      rlog.sync('moderator-skip', `retry limit reached (${retryRef.current})`);
      return;
    }

    trigRef.current = roundNumber;
    if (isRetry) {
      retryRef.current += 1;
    } else {
      retryRef.current = 0;
    }

    // ✅ RACE FIX: Clear any pending retry before starting new request
    if (retryInProgressRef.current) {
      clearTimeout(retryInProgressRef.current);
      retryInProgressRef.current = null;
    }

    // Abort previous request
    if (abortRef.current) {
      abortRef.current.abort();
    }
    abortRef.current = new AbortController();

    // Check if moderator message already exists and is complete
    const existingModerator = state.messages.find((m) => {
      if (!isObject(m.metadata)) {
        return false;
      }
      return m.metadata.isModerator === true && getRoundNumber(m.metadata) === roundNumber;
    });

    if (existingModerator) {
      const isComplete = existingModerator.parts?.every(p =>
        p.type !== MessagePartTypes.TEXT || p.state === TextPartStates.DONE,
      );
      if (isComplete) {
        rlog.sync('moderator-skip', 'moderator already complete');
        trigRef.current = null;
        return;
      }
    }

    // Add placeholder message if not exists
    if (!existingModerator) {
      const placeholderMessage: UIMessage = {
        id: moderatorId,
        metadata: {
          hasError: false,
          isModerator: true,
          model: 'moderator',
          participantIndex: MODERATOR_PARTICIPANT_INDEX,
          role: 'assistant',
          roundNumber,
        } satisfies DbModeratorMessageMetadata,
        parts: [{
          state: TextPartStates.STREAMING,
          text: '',
          type: MessagePartTypes.TEXT,
        }],
        role: UIMessageRoles.ASSISTANT,
      };

      store.getState().setIsModeratorStreaming(true);
      store.getState().setMessages([...state.messages, placeholderMessage]);
      rlog.sync('moderator-placeholder', `added r${roundNumber}`);
    }

    try {
      const response = await streamModeratorService(
        {
          json: { participantMessageIds },
          param: {
            roundNumber: String(roundNumber),
            threadId: freshThreadId,
          },
        },
        { signal: abortRef.current.signal },
      );

      // Handle 202 (retry later)
      if (response.status === 202) {
        rlog.sync('moderator-202', 'retry after delay');
        trigRef.current = null;

        if (retryRef.current < RETRY_LIMITS.MAX_202_RETRIES) {
          // ✅ RACE FIX: Track retry timeout to prevent overlapping retries
          retryInProgressRef.current = setTimeout(() => {
            retryInProgressRef.current = null;
            triggerModerator(roundNumber, participantMessageIds, true);
          }, 1000);
        }
        return;
      }

      if (!response.ok || !response.body) {
        throw new Error(`Moderator stream failed: ${response.status}`);
      }

      // Stream the response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let rafId: number | null = null;
      let pendingText = '';

      const flushText = () => {
        if (pendingText) {
          const textToFlush = pendingText;
          pendingText = '';

          store.getState().setMessages(
            store.getState().messages.map((m) => {
              if (m.id !== moderatorId) {
                return m;
              }
              return {
                ...m,
                parts: [{
                  state: TextPartStates.STREAMING,
                  text: textToFlush,
                  type: MessagePartTypes.TEXT,
                }],
              };
            }),
          );
        }
        rafId = null;
      };

      const scheduleFlush = () => {
        if (rafId === null) {
          rafId = requestAnimationFrame(flushText);
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            const text = parseAiSdkStreamLine(line);
            if (text) {
              fullText += text;
              pendingText = fullText;
              scheduleFlush();
            }
          }
        }
      } finally {
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
        }
      }

      // Final update
      store.getState().setMessages(
        store.getState().messages.map((m) => {
          if (m.id !== moderatorId) {
            return m;
          }
          return {
            ...m,
            parts: [{
              state: TextPartStates.DONE,
              text: fullText,
              type: MessagePartTypes.TEXT,
            }],
          };
        }),
      );

      store.getState().completeModeratorStream();
      rlog.sync('moderator-complete', `r${roundNumber} len=${fullText.length}`);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        rlog.sync('moderator-aborted', `r${roundNumber}`);
        return;
      }

      rlog.sync('moderator-error', `r${roundNumber} ${error}`);

      // Retry on error
      if (retryRef.current < MAX_MODERATOR_RETRIES) {
        // ✅ RACE FIX: Track retry timeout to prevent overlapping retries
        retryInProgressRef.current = setTimeout(() => {
          retryInProgressRef.current = null;
          triggerModerator(roundNumber, participantMessageIds, true);
        }, 2000);
      }
    } finally {
      if (trigRef.current === roundNumber) {
        trigRef.current = null;
      }
    }
  }, [effectiveThreadId, store]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      // ✅ RACE FIX: Clear pending retry on unmount
      if (retryInProgressRef.current) {
        clearTimeout(retryInProgressRef.current);
        retryInProgressRef.current = null;
      }
    };
  }, []);

  // NOTE: Automatic trigger effect REMOVED
  // Backend now handles moderator triggering via queue after participants complete.
  // The triggerModerator callback remains for manual retries if needed.

  return {
    isTriggering: triggeringRoundRef.current !== null,
    triggerModerator,
  };
}
