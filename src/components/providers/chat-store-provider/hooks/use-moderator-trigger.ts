'use client';

import type { UIMessage } from 'ai';
import { useCallback, useEffect, useRef } from 'react';
import { useStore } from 'zustand';

import { MessageRoles, RoundPhases } from '@/api/core/enums';
import { MODERATOR_NAME, MODERATOR_PARTICIPANT_INDEX } from '@/components/chat/round-summary/moderator-constants';
import { getMessageMetadata, getRoundNumber } from '@/lib/utils/metadata';
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
  const thread = useStore(store, s => s.thread);
  const createdThreadId = useStore(store, s => s.createdThreadId);

  const abortControllerRef = useRef<AbortController | null>(null);
  const triggeringRoundRef = useRef<number | null>(null);

  const effectiveThreadId = thread?.id || createdThreadId || '';

  const triggerModerator = useCallback(async (
    roundNumber: number,
    participantMessageIds: string[],
  ) => {
    const state = store.getState();

    // eslint-disable-next-line no-console
    console.log('[MOD]', JSON.stringify({ ev: 'start', rnd: roundNumber, msgs: participantMessageIds.length }));

    if (!effectiveThreadId) {
      // eslint-disable-next-line no-console
      console.log('[MOD]', JSON.stringify({ ev: 'err', rnd: roundNumber, reason: 'noThread' }));
      state.completeModeratorStream();
      return;
    }

    const moderatorId = `${effectiveThreadId}_r${roundNumber}_moderator`;
    if (state.hasModeratorStreamBeenTriggered(moderatorId, roundNumber)) {
      // eslint-disable-next-line no-console
      console.log('[MOD]', JSON.stringify({ ev: 'skip', rnd: roundNumber, reason: 'triggered' }));
      state.completeModeratorStream();
      return;
    }

    if (triggeringRoundRef.current !== null) {
      return;
    }

    state.markModeratorStreamTriggered(moderatorId, roundNumber);
    triggeringRoundRef.current = roundNumber;

    const moderatorPlaceholder: UIMessage = {
      id: moderatorId,
      role: 'assistant',
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
        `/api/v1/chat/threads/${effectiveThreadId}/rounds/${roundNumber}/moderator`,
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
                        parts: [{ type: 'text' as const, text: textToSet, state: 'streaming' as const }],
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
                            parts: [{ type: 'text' as const, text: textToSet, state: 'streaming' as const }],
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
      const moderatorMessageId = `${effectiveThreadId}_r${roundNumber}_moderator`;

      // eslint-disable-next-line no-console
      console.log('[MOD]', JSON.stringify({ ev: 'done', rnd: roundNumber, len: finalText.length }));

      if (finalText.length > 0) {
        store.getState().setMessages((currentMessages) => {
          // ✅ DEBUG: Log all message IDs to detect if wrong message gets updated
          // eslint-disable-next-line no-console
          console.log('[MOD-UPDATE]', JSON.stringify({
            targetId: moderatorMessageId,
            allIds: currentMessages.map(m => m.id),
            textPreview: finalText.slice(0, 40),
          }));

          const hasExistingPlaceholder = currentMessages.some(msg => msg.id === moderatorMessageId);

          if (hasExistingPlaceholder) {
            return currentMessages.map(msg =>
              msg.id === moderatorMessageId
                ? {
                    ...msg,
                    parts: [{ type: 'text' as const, text: finalText, state: 'done' as const }],
                    metadata: {
                      ...(msg.metadata && typeof msg.metadata === 'object' ? msg.metadata : {}),
                      finishReason: 'stop',
                    },
                  }
                : msg,
            );
          } else {
            const moderatorMessage = {
              id: moderatorMessageId,
              role: 'assistant' as const,
              parts: [{ type: 'text' as const, text: finalText, state: 'done' as const }],
              metadata: {
                role: 'assistant',
                roundNumber,
                isModerator: true,
                model: 'anthropic/claude-sonnet-4',
                finishReason: 'stop',
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
      // eslint-disable-next-line no-console
      console.log('[MOD]', JSON.stringify({ ev: 'err', rnd: roundNumber, msg: String(error).slice(0, 50) }));
    } finally {
      store.getState().completeModeratorStream();
      store.getState().completeStreaming();
      triggeringRoundRef.current = null;
      abortControllerRef.current = null;
    }
  }, [effectiveThreadId, store]);

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

    const triggerKey = `${effectiveThreadId}_resumption_${resumptionRoundNumber}`;
    if (resumptionTriggerAttemptedRef.current === triggerKey) {
      return;
    }

    const moderatorExists = messages.some((m) => {
      const metadata = getMessageMetadata(m.metadata);
      const isModerator = metadata && 'isModerator' in metadata && metadata.isModerator === true;
      return (
        isModerator
        && getRoundNumber(m.metadata) === resumptionRoundNumber
      );
    });

    if (moderatorExists) {
      resumptionTriggerAttemptedRef.current = triggerKey;
      store.getState().completeModeratorStream();
      store.getState().clearStreamResumption();
      return;
    }

    const participantMessageIds = messages
      .filter((m) => {
        const metadata = getMessageMetadata(m.metadata);
        if (!metadata)
          return false;
        const isModerator = 'isModerator' in metadata && metadata.isModerator === true;
        return (
          m.role === 'assistant'
          && getRoundNumber(m.metadata) === resumptionRoundNumber
          && !isModerator
        );
      })
      .map(m => m.id);

    if (participantMessageIds.length < participants.length) {
      return;
    }

    // eslint-disable-next-line no-console
    console.log('[MOD]', JSON.stringify({ ev: 'resumption_trigger', rnd: resumptionRoundNumber, msgs: participantMessageIds.length }));

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
  ]);

  return {
    triggerModerator,
    isTriggering: triggeringRoundRef.current !== null,
  };
}
