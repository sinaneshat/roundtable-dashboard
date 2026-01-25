import {
  FinishReasons,
  MessagePartTypes,
  MessageRoles,
  MODERATOR_NAME,
  MODERATOR_PARTICIPANT_INDEX,
  RoundPhases,
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
  const retryCountRef = useRef<number>(0);

  const effectiveThreadId = threadId || createdThreadId || '';

  const triggerModerator = useCallback(async (
    roundNumber: number,
    participantMessageIds: string[],
    isRetry = false,
  ) => {
    const state = store.getState();
    const freshThreadId = state.thread?.id || state.createdThreadId || '';

    rlog.sync('moderator-trigger', `r${roundNumber} threadId=${freshThreadId.slice(-8)} isRetry=${isRetry} triggeringRef=${triggeringRoundRef.current} msgIds=${participantMessageIds.length}:[${participantMessageIds.map(id => id.slice(-15)).join(',')}]`);

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
      // Use RPC service for type-safe moderator streaming
      const response = await streamModeratorService(
        {
          param: {
            threadId: freshThreadId,
            roundNumber: String(roundNumber),
          },
          json: { participantMessageIds },
        },
        { signal: controller.signal },
      );

      if (!response.ok) {
        throw new Error(`Moderator request failed: ${response.status}`);
      }

      const contentType = response.headers.get('content-type') || '';

      let accumulatedText = '';

      if (contentType.includes('application/json')) {
        // Could be either: existing moderator message OR 202 polling response
        // Parse JSON to check if it's a polling response that needs retry
        const jsonData = await response.json() as {
          // Polling response shape
          data?: { status?: string; retryAfterMs?: number; message?: string };
          // Existing message shape (returned by Responses.raw)
          id?: string;
          role?: string;
          parts?: Array<{ type: string; text?: string }>;
          metadata?: Record<string, unknown>;
          roundNumber?: number;
        };
        rlog.sync('moderator-json', `status=${response.status} data=${JSON.stringify(jsonData ?? {})}`);

        if (response.status === 202 || jsonData?.data?.status === 'pending') {
          retryCountRef.current += 1;
          if (retryCountRef.current >= RETRY_LIMITS.MAX_202_RETRIES) {
            console.error('[Moderator] MAX RETRIES REACHED - messages never appeared in D1', {
              roundNumber,
              retryCount: retryCountRef.current,
              threadId: freshThreadId.slice(-8),
            });
            rlog.sync('moderator-max-retries', `r${roundNumber} gave up after ${retryCountRef.current} attempts`);
            retryCountRef.current = 0;
            store.getState().completeStreaming();
            return;
          }
          // 202 Accepted - messages not persisted yet, retry after delay
          const retryAfterMs = jsonData?.data?.retryAfterMs || 1000;
          rlog.sync('moderator-retry', `202 poll ${retryCountRef.current}/${RETRY_LIMITS.MAX_202_RETRIES}: ${jsonData?.data?.message ?? 'no message'}, retry in ${retryAfterMs}ms`);
          await new Promise(resolve => setTimeout(resolve, retryAfterMs));
          // Retry the request - clear tracking and reset ref so we can trigger again
          triggeringRoundRef.current = null;
          store.getState().clearModeratorStreamTracking(roundNumber);
          // Pass isRetry=true to bypass the already-triggered check
          await triggerModerator(roundNumber, participantMessageIds, true);
          return;
        }

        // Success - reset retry counter
        retryCountRef.current = 0;

        // ✅ FIX: Handle existing moderator message returned from backend
        // Backend returns message shape: { id, role, parts, metadata, roundNumber }
        if (jsonData?.id && jsonData?.parts && Array.isArray(jsonData.parts)) {
          const existingText = jsonData.parts
            .filter((p): p is { type: string; text: string } => p.type === MessagePartTypes.TEXT && typeof p.text === 'string')
            .map(p => p.text)
            .join('');

          if (existingText) {
            rlog.sync('moderator-exists-hydrate', `found existing message with ${existingText.length} chars`);
            accumulatedText = existingText;
          }
        }

        rlog.sync('moderator-exists', `message already exists, no streaming needed`);
      } else {
        rlog.sync('moderator-stream-start', `starting stream read, contentType=${contentType}`);
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
      console.error('[Moderator] triggerModerator error:', error);
    } finally {
      const preState = store.getState();
      rlog.sync('mod-complete-pre', `r${roundNumber} streamR=${preState.streamingRoundNumber ?? '-'} wait=${preState.waitingToStartStreaming ? 1 : 0} nextP=${preState.nextParticipantToTrigger !== null ? 1 : 0}`);
      store.getState().completeStreaming();
      const postState = store.getState();
      rlog.sync('mod-complete-post', `streamR=${postState.streamingRoundNumber ?? '-'} wait=${postState.waitingToStartStreaming ? 1 : 0} nextP=${postState.nextParticipantToTrigger !== null ? 1 : 0} msgs=${postState.messages.length}`);
      triggeringRoundRef.current = null;
      abortControllerRef.current = null;
      retryCountRef.current = 0;
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
