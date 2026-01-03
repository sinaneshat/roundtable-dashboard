'use client';

import type { UIMessage } from 'ai';
import { useCallback, useEffect, useRef } from 'react';
import { useStore } from 'zustand';

import { FinishReasons, MessageRoles, MODERATOR_NAME, MODERATOR_PARTICIPANT_INDEX, RoundPhases, TextPartStates, UIMessageRoles } from '@/api/core/enums';
import { getRoundNumber, isObject, rlog } from '@/lib/utils';
import type { ChatStoreApi } from '@/stores/chat';

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
  const threadId = useStore(store, s => s.thread?.id);
  const createdThreadId = useStore(store, s => s.createdThreadId);

  const abortControllerRef = useRef<AbortController | null>(null);
  const triggeringRoundRef = useRef<number | null>(null);

  const effectiveThreadId = threadId || createdThreadId || '';

  const triggerModerator = useCallback(async (
    roundNumber: number,
    participantMessageIds: string[],
  ) => {
    const state = store.getState();

    // ✅ FLASH FIX: Get effectiveThreadId from FRESH state, not stale closure
    // The closure can be stale if thread was just created but React hasn't re-rendered
    // This was causing completeStreaming() to be called incorrectly, clearing streamingRoundNumber
    const freshThreadId = state.thread?.id || state.createdThreadId || '';

    if (!freshThreadId) {
      rlog.moderator('skip', 'no threadId');
      // ✅ FLASH FIX: Don't call completeStreaming() on early return
      // This clears streamingRoundNumber causing isLatestRound to be false → flash
      // handleComplete already set isModeratorStreaming=true, let it timeout naturally
      // This case should never happen with fresh state since handleComplete checks threadId
      return;
    }

    const moderatorId = `${freshThreadId}_r${roundNumber}_moderator`;
    if (state.hasModeratorStreamBeenTriggered(moderatorId, roundNumber)) {
      rlog.moderator('skip', `r${roundNumber} already triggered`);
      // ✅ FLASH FIX: Don't call completeStreaming() - original trigger will handle cleanup
      // Calling it here would abort the in-progress moderator stream
      return;
    }

    if (triggeringRoundRef.current !== null) {
      rlog.moderator('skip', `r${roundNumber} trigger in progress`);
      return;
    }

    rlog.moderator('TRIGGER', `r${roundNumber} pMsgs=${participantMessageIds.length}`);
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
                        parts: [{ type: 'text' as const, text: textToSet, state: TextPartStates.STREAMING }],
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
                            parts: [{ type: 'text' as const, text: textToSet, state: TextPartStates.STREAMING }],
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
                    parts: [{ type: 'text' as const, text: finalText, state: TextPartStates.DONE }],
                    metadata: {
                      ...(msg.metadata && typeof msg.metadata === 'object' ? msg.metadata : {}),
                      finishReason: FinishReasons.STOP,
                    },
                  }
                : msg,
            );
          } else {
            const moderatorMessage = {
              id: moderatorMessageId,
              role: UIMessageRoles.ASSISTANT,
              parts: [{ type: 'text' as const, text: finalText, state: TextPartStates.DONE }],
              metadata: {
                role: MessageRoles.ASSISTANT,
                roundNumber,
                isModerator: true,
                model: 'anthropic/claude-sonnet-4',
                finishReason: FinishReasons.STOP,
              },
            };
            return [...currentMessages, moderatorMessage];
          }
        });
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        rlog.moderator('abort', `r${roundNumber}`);
        return;
      }
      rlog.moderator('error', `r${roundNumber}`);
    } finally {
      rlog.phase('MOD→DONE', `r${roundNumber} complete`);
      store.getState().completeStreaming();
      triggeringRoundRef.current = null;
      abortControllerRef.current = null;
    }
  }, [store]); // ✅ FLASH FIX: Removed effectiveThreadId - now read from fresh state inside callback

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const isModeratorStreaming = useStore(store, s => s.isModeratorStreaming);
  const currentResumptionPhase = useStore(store, s => s.currentResumptionPhase);
  const resumptionRoundNumber = useStore(store, s => s.resumptionRoundNumber);
  const messages = useStore(store, s => s.messages);
  const participants = useStore(store, s => s.participants);
  const resumptionTriggerAttemptedRef = useRef<string | null>(null);
  const waitingToStartStreaming = useStore(store, s => s.waitingToStartStreaming);
  const nextParticipantToTrigger = useStore(store, s => s.nextParticipantToTrigger);

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
