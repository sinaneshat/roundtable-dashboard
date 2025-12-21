/**
 * Moderator Trigger Hook
 *
 * Triggers the moderator stream after all participants complete.
 * Uses RAF-based updates for smooth streaming display.
 *
 * AI SDK toUIMessageStreamResponse format:
 * - `0:"text"` - Text delta (text is JSON-encoded string)
 * - `d:{...}` - Done event with finishReason
 * - `e:{...}` - Error event
 */

'use client';

import type { UIMessage } from 'ai';
import { useCallback, useEffect, useRef } from 'react';
import { useStore } from 'zustand';

import { MessageRoles } from '@/api/core/enums';
import { MODERATOR_NAME, MODERATOR_PARTICIPANT_INDEX } from '@/components/chat/round-summary/moderator-constants';
import type { ChatStoreApi } from '@/stores/chat';

type UseModeratorTriggerOptions = {
  store: ChatStoreApi;
};

/**
 * Parse AI SDK stream line
 * Returns the text delta or null if not a text line
 */
function parseAiSdkStreamLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed)
    return null;

  // AI SDK text delta format: 0:"text content"
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

  // Standard SSE format: data: {...}
  if (trimmed.startsWith('data: ')) {
    const jsonStr = trimmed.slice(6);
    if (jsonStr === '[DONE]')
      return null;

    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed && typeof parsed === 'object') {
        // Handle text-delta type
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
 * Hook to automatically trigger the moderator stream after participants complete
 * Used by ChatStoreProvider to handle the transition from participant streaming to moderator
 */
export function useModeratorTrigger({ store }: UseModeratorTriggerOptions) {
  // Subscribe to store state (only what we need for threadId)
  const thread = useStore(store, s => s.thread);
  const createdThreadId = useStore(store, s => s.createdThreadId);

  // Refs for callbacks
  const abortControllerRef = useRef<AbortController | null>(null);
  const triggeringRoundRef = useRef<number | null>(null);

  const effectiveThreadId = thread?.id || createdThreadId || '';

  /**
   * Trigger the moderator stream for a specific round
   */
  const triggerModerator = useCallback(async (
    roundNumber: number,
    participantMessageIds: string[],
  ) => {
    const state = store.getState();

    // eslint-disable-next-line no-console
    console.log('[MOD]', JSON.stringify({ ev: 'start', rnd: roundNumber, msgs: participantMessageIds.length }));

    // Early returns - clear streaming state if it was pre-set by handleComplete
    if (!effectiveThreadId) {
      // eslint-disable-next-line no-console
      console.log('[MOD]', JSON.stringify({ ev: 'err', rnd: roundNumber, reason: 'noThread' }));
      state.completeModeratorStream();
      return;
    }

    // Check if already triggered
    const moderatorId = `${effectiveThreadId}_r${roundNumber}_moderator`;
    if (state.hasModeratorStreamBeenTriggered(moderatorId, roundNumber)) {
      // eslint-disable-next-line no-console
      console.log('[MOD]', JSON.stringify({ ev: 'skip', rnd: roundNumber, reason: 'triggered' }));
      state.completeModeratorStream();
      return;
    }

    // Prevent concurrent triggers
    if (triggeringRoundRef.current !== null) {
      return; // Silent - another trigger in progress
    }

    // Mark as triggered (streaming state already set by handleComplete)
    state.markModeratorStreamTriggered(moderatorId, roundNumber);
    triggeringRoundRef.current = roundNumber;

    // ✅ RACE CONDITION FIX: Add moderator placeholder HERE, AFTER participants complete
    // Previously, placeholder was added in use-streaming-trigger.ts and use-pending-message.ts
    // BEFORE participants started streaming, causing: User → Moderator → Participants (wrong)
    // Now placeholder is added AFTER participants complete: User → Participants → Moderator (correct)
    const moderatorPlaceholder: UIMessage = {
      id: moderatorId,
      role: 'assistant',
      parts: [], // Empty parts = pending state, will be updated during streaming
      metadata: {
        isModerator: true,
        roundNumber,
        participantIndex: MODERATOR_PARTICIPANT_INDEX,
        model: MODERATOR_NAME,
        role: MessageRoles.ASSISTANT,
      },
    };

    // Add moderator placeholder to messages (if not already present)
    state.setMessages((currentMessages) => {
      const hasExisting = currentMessages.some(m => m.id === moderatorId);
      if (hasExisting)
        return currentMessages;
      return [...currentMessages, moderatorPlaceholder];
    });

    // Abort any existing stream
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

      // Track accumulated text for moderator message creation
      let accumulatedText = '';

      // Handle non-streaming response (message already exists)
      if (contentType.includes('application/json')) {
        // Message already exists - no streaming needed
      } else {
        // Handle streaming response
        const reader = response.body?.getReader();
        if (reader) {
          const decoder = new TextDecoder();
          let buffer = '';
          let isFirstChunk = true;
          let rafId: number | null = null;
          let pendingFlush = false;

          // ✅ FLASH FIX: Use RAF for smooth streaming updates
          // Previous issue: Content appeared all at once because throttling
          // accumulated everything before flushing.
          // Fix: Flush immediately on first chunk, then use RAF for smooth updates
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

            // Process complete lines
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const textDelta = parseAiSdkStreamLine(line);
              if (textDelta !== null) {
                accumulatedText += textDelta;

                // ✅ FLASH FIX: Immediate flush on first chunk to show content fast
                if (isFirstChunk) {
                  isFirstChunk = false;
                  // Sync update for first chunk - no RAF delay
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

          // Cleanup RAF if pending
          if (rafId !== null) {
            cancelAnimationFrame(rafId);
          }

          // Process any remaining buffer
          if (buffer.trim()) {
            const textDelta = parseAiSdkStreamLine(buffer);
            if (textDelta !== null) {
              accumulatedText += textDelta;
            }
          }
        }
      }

      // ✅ UNIFIED RENDERING: Update existing placeholder with final content
      // The placeholder was added above, AFTER participants completed streaming
      const finalText = accumulatedText;
      const moderatorMessageId = `${effectiveThreadId}_r${roundNumber}_moderator`;

      // eslint-disable-next-line no-console
      console.log('[MOD]', JSON.stringify({ ev: 'done', rnd: roundNumber, len: finalText.length }));

      if (finalText.length > 0) {
        // Update existing moderator placeholder with final content
        // Use function updater to reduce race conditions with concurrent updates
        store.getState().setMessages((currentMessages) => {
          const hasExistingPlaceholder = currentMessages.some(msg => msg.id === moderatorMessageId);

          if (hasExistingPlaceholder) {
            // Update existing placeholder
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
            // Fallback: Create new message if placeholder doesn't exist (e.g., resumption)
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
        return; // Silent - intentional abort
      }
      // eslint-disable-next-line no-console
      console.log('[MOD]', JSON.stringify({ ev: 'err', rnd: roundNumber, msg: String(error).slice(0, 50) }));
    } finally {
      // Complete moderator stream - sets isModeratorStreaming=false
      store.getState().completeModeratorStream();
      // ✅ CRITICAL FIX: Also call completeStreaming to clear pendingMessage and streamingRoundNumber
      // Without this, the chat input remains disabled because pendingMessage is never cleared
      store.getState().completeStreaming();
      triggeringRoundRef.current = null;
      abortControllerRef.current = null;
    }
  }, [effectiveThreadId, store]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    triggerModerator,
    isTriggering: triggeringRoundRef.current !== null,
  };
}
