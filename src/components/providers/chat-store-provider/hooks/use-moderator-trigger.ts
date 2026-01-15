'use client';

import type { UIMessage } from 'ai';
import { useCallback, useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import {
  FinishReasons,
  MessagePartTypes,
  MessageRoles,
  MODERATOR_NAME,
  MODERATOR_PARTICIPANT_INDEX,
  RoundPhases,
  TextPartStates,
  UIMessageRoles,
} from '@/api/core/enums';
import { getRoundNumber, isObject } from '@/lib/utils';
import { rlog } from '@/lib/utils/dev-logger';
import type { ChatStoreApi } from '@/stores/chat';
import { isRoundComplete } from '@/stores/chat';

type UseModeratorTriggerOptions = {
  store: ChatStoreApi;
};

function parseAiSdkStreamLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed)
    return null;

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
    if (jsonStr === '[DONE]')
      return null;

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

export function useModeratorTrigger({ store }: UseModeratorTriggerOptions) {
  const { threadId, createdThreadId } = useStore(store, useShallow(s => ({
    threadId: s.thread?.id,
    createdThreadId: s.createdThreadId,
  })));

  const abortControllerRef = useRef<AbortController | null>(null);
  const triggeringRoundRef = useRef<number | null>(null);

  const effectiveThreadId = threadId || createdThreadId || '';

  const triggerModerator = useCallback(async (
    roundNumber: number,
    participantMessageIds: string[],
    isRetry = false,
  ) => {
    const state = store.getState();
    const freshThreadId = state.thread?.id || state.createdThreadId || '';

    rlog.sync('moderator-trigger', `r${roundNumber} threadId=${freshThreadId.slice(-8)} isRetry=${isRetry} triggeringRef=${triggeringRoundRef.current}`);

    if (!freshThreadId) {
      rlog.sync('moderator-skip', 'no threadId');
      return;
    }

    const moderatorId = `${freshThreadId}_r${roundNumber}_moderator`;
    const alreadyTriggered = state.hasModeratorStreamBeenTriggered(moderatorId, roundNumber);
    rlog.sync('moderator-check', `alreadyTriggered=${alreadyTriggered} isRetry=${isRetry}`);

    if (alreadyTriggered && !isRetry) {
      if (state.streamingRoundNumber === roundNumber) {
        const roundComplete = isRoundComplete(state.messages, state.participants, roundNumber);
        if (roundComplete) {
          state.completeStreaming();
        }
      }

      return;
    }

    if (triggeringRoundRef.current !== null && !isRetry) {
      rlog.sync('moderator-skip', `triggeringRef=${triggeringRoundRef.current}`);
      return;
    }
    state.markModeratorStreamTriggered(moderatorId, roundNumber);
    triggeringRoundRef.current = roundNumber;

    const moderatorPlaceholder: UIMessage = {
      id: moderatorId,
      role: UIMessageRoles.ASSISTANT,
      parts: [],
      metadata: {
        isModerator: true,
        roundNumber,
        participantIndex: MODERATOR_PARTICIPANT_INDEX,
        model: MODERATOR_NAME,
        role: MessageRoles.ASSISTANT,
      },
    };

    state.setMessages((currentMessages) => {
      const hasExisting = currentMessages.some(m => m.id === moderatorId);
      if (hasExisting)
        return currentMessages;
      return [...currentMessages, moderatorPlaceholder];
    });

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch(
        `/api/v1/chat/threads/${freshThreadId}/rounds/${roundNumber}/moderator`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ participantMessageIds }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw new Error(`Moderator request failed: ${response.status}`);
      }

      const contentType = response.headers.get('content-type') || '';

      let accumulatedText = '';

      if (contentType.includes('application/json')) {
        // Could be either: existing moderator message OR 202 polling response
        // Parse JSON to check if it's a polling response that needs retry
        const jsonData = await response.json() as { data?: { status?: string; retryAfterMs?: number } };
        if (response.status === 202 || jsonData?.data?.status === 'pending') {
          // 202 Accepted - messages not persisted yet, retry after delay
          const retryAfterMs = jsonData?.data?.retryAfterMs || 1000;
          rlog.sync('moderator-retry', `202 polling response, will retry in ${retryAfterMs}ms`);
          await new Promise(resolve => setTimeout(resolve, retryAfterMs));
          // Retry the request - clear tracking and reset ref so we can trigger again
          rlog.sync('moderator-retry', `retrying now after ${retryAfterMs}ms delay`);
          triggeringRoundRef.current = null;
          store.getState().clearModeratorStreamTracking(roundNumber);
          // Pass isRetry=true to bypass the already-triggered check
          await triggerModerator(roundNumber, participantMessageIds, true);
          return;
        }
        // Message already exists - no streaming needed
      } else {
        const reader = response.body?.getReader();
        if (reader) {
          const decoder = new TextDecoder();
          let buffer = '';
          let isFirstChunk = true;
          let rafId: number | null = null;
          let pendingFlush = false;

          const scheduleFlush = () => {
            if (pendingFlush || !accumulatedText)
              return;
            pendingFlush = true;

            rafId = requestAnimationFrame(() => {
              const textToSet = accumulatedText;
              store.getState().setMessages(currentMessages =>
                currentMessages.map(msg =>
                  msg.id === moderatorId
                    ? {
                        ...msg,
                        parts: [{ type: MessagePartTypes.TEXT, text: textToSet, state: TextPartStates.STREAMING }],
                      }
                    : msg,
                ),
              );
              pendingFlush = false;
              rafId = null;
            });
          };

          while (true) {
            const { done, value } = await reader.read();
            if (done)
              break;

            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;

            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const textDelta = parseAiSdkStreamLine(line);
              if (textDelta !== null) {
                accumulatedText += textDelta;

                if (isFirstChunk) {
                  isFirstChunk = false;
                  const textToSet = accumulatedText;
                  store.getState().setMessages(currentMessages =>
                    currentMessages.map(msg =>
                      msg.id === moderatorId
                        ? {
                            ...msg,
                            parts: [{ type: MessagePartTypes.TEXT, text: textToSet, state: TextPartStates.STREAMING }],
                          }
                        : msg,
                    ),
                  );
                } else {
                  scheduleFlush();
                }
              }
            }
          }

          if (rafId !== null) {
            cancelAnimationFrame(rafId);
          }

          if (buffer.trim()) {
            const textDelta = parseAiSdkStreamLine(buffer);
            if (textDelta !== null) {
              accumulatedText += textDelta;
            }
          }
        }
      }

      const finalText = accumulatedText;
      const moderatorMessageId = `${freshThreadId}_r${roundNumber}_moderator`;

      if (finalText.length > 0) {
        store.getState().setMessages((currentMessages) => {
          const hasExistingPlaceholder = currentMessages.some(msg => msg.id === moderatorMessageId);

          if (hasExistingPlaceholder) {
            return currentMessages.map(msg =>
              msg.id === moderatorMessageId
                ? {
                    ...msg,
                    parts: [{ type: MessagePartTypes.TEXT, text: finalText, state: TextPartStates.DONE }],
                    metadata: {
                      ...(msg.metadata && isObject(msg.metadata) ? msg.metadata : {}),
                      finishReason: FinishReasons.STOP,
                    },
                  }
                : msg,
            );
          } else {
            const moderatorMessage: UIMessage = {
              id: moderatorMessageId,
              role: UIMessageRoles.ASSISTANT,
              parts: [{ type: MessagePartTypes.TEXT, text: finalText, state: TextPartStates.DONE }],
              metadata: {
                role: MessageRoles.ASSISTANT,
                roundNumber,
                isModerator: true,
                participantIndex: MODERATOR_PARTICIPANT_INDEX,
                model: MODERATOR_NAME,
                finishReason: FinishReasons.STOP,
              },
            };
            return [...currentMessages, moderatorMessage];
          }
        });
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
    } finally {
      store.getState().completeStreaming();
      triggeringRoundRef.current = null;
      abortControllerRef.current = null;
    }
  }, [store]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const {
    isModeratorStreaming,
    currentResumptionPhase,
    resumptionRoundNumber,
    messages,
    participants,
    waitingToStartStreaming,
    nextParticipantToTrigger,
  } = useStore(store, useShallow(s => ({
    isModeratorStreaming: s.isModeratorStreaming,
    currentResumptionPhase: s.currentResumptionPhase,
    resumptionRoundNumber: s.resumptionRoundNumber,
    messages: s.messages,
    participants: s.participants,
    waitingToStartStreaming: s.waitingToStartStreaming,
    nextParticipantToTrigger: s.nextParticipantToTrigger,
  })));
  const resumptionTriggerAttemptedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isModeratorStreaming || currentResumptionPhase !== RoundPhases.MODERATOR) {
      return;
    }

    if (!effectiveThreadId || resumptionRoundNumber === null) {
      return;
    }

    if (triggeringRoundRef.current !== null) {
      return;
    }

    if (waitingToStartStreaming || nextParticipantToTrigger !== null) {
      return;
    }

    const triggerKey = `${effectiveThreadId}_resumption_${resumptionRoundNumber}`;
    if (resumptionTriggerAttemptedRef.current === triggerKey) {
      return;
    }

    const moderatorExists = messages.some((m) => {
      if (!isObject(m.metadata))
        return false;
      return m.metadata.isModerator === true && getRoundNumber(m.metadata) === resumptionRoundNumber;
    });

    if (moderatorExists) {
      resumptionTriggerAttemptedRef.current = triggerKey;
      store.getState().completeModeratorStream();
      store.getState().clearStreamResumption();
      return;
    }

    const participantMessageIds = messages
      .filter((m) => {
        if (m.role !== MessageRoles.ASSISTANT)
          return false;
        if (!isObject(m.metadata))
          return false;
        if (m.metadata.isModerator === true)
          return false;
        return getRoundNumber(m.metadata) === resumptionRoundNumber;
      })
      .map(m => m.id);

    if (participantMessageIds.length < participants.length) {
      return;
    }

    resumptionTriggerAttemptedRef.current = triggerKey;

    queueMicrotask(() => {
      triggerModerator(resumptionRoundNumber, participantMessageIds);
    });
  }, [
    isModeratorStreaming,
    currentResumptionPhase,
    resumptionRoundNumber,
    effectiveThreadId,
    messages,
    participants,
    store,
    triggerModerator,
    waitingToStartStreaming,
    nextParticipantToTrigger,
  ]);

  return {
    triggerModerator,
    isTriggering: triggeringRoundRef.current !== null,
  };
}
