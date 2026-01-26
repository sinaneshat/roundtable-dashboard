import { MessagePartTypes, MODERATOR_NAME, MODERATOR_PARTICIPANT_INDEX, UIMessageRoles } from '@roundtable/shared';
import { useQueryClient } from '@tanstack/react-query';
import type { UIMessage } from 'ai';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import { queryKeys } from '@/lib/data/query-keys';
import { chatMessagesToUIMessages } from '@/lib/utils';
import { rlog } from '@/lib/utils/dev-logger';
import { getThreadMessagesService, streamModeratorService } from '@/services/api';
import type { ChatStoreApi } from '@/stores/chat';

/** Throttle interval for UI updates (matches AI SDK batching behavior) */
const UPDATE_THROTTLE_MS = 50;

export type ModeratorStreamState = {
  isStreaming: boolean;
  error: Error | null;
  roundNumber: number | null;
};

type UseModeratorStreamOptions = {
  threadId: string;
  enabled?: boolean;
  /** Store API - required when used inside provider before context is available */
  store: ChatStoreApi;
};

/**
 * Hook to manage moderator streaming after participants complete
 * Accepts store directly to work inside ChatStoreProvider before context is set.
 *
 * ✅ UNIFIED RENDERING: Adds moderator message to messages array during streaming
 * so it goes through the exact same rendering path as participant messages.
 */
export function useModeratorStream({ enabled = true, store, threadId }: UseModeratorStreamOptions) {
  const queryClient = useQueryClient();

  const {
    hasModeratorStreamBeenTriggered,
    markModeratorStreamTriggered,
    messages,
    participants,
    setIsModeratorStreaming,
    setMessages,
  } = useStore(
    store,
    useShallow(s => ({
      hasModeratorStreamBeenTriggered: s.hasModeratorStreamBeenTriggered,
      markModeratorStreamTriggered: s.markModeratorStreamTriggered,
      messages: s.messages,
      participants: s.participants,
      setIsModeratorStreaming: s.setIsModeratorStreaming,
      setMessages: s.setMessages,
    })),
  );

  const [state, setState] = useState<ModeratorStreamState>({
    error: null,
    isStreaming: false,
    roundNumber: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const triggerModeratorStream = useCallback(async (
    roundNumber: number,
    participantMessageIds: string[],
  ) => {
    // Capture ref at function start to satisfy require-atomic-updates
    const abortRef = abortControllerRef;

    rlog.moderator('triggerModeratorStream', `ENTER r${roundNumber} enabled=${enabled} threadId=${threadId?.slice(-8) || 'null'}`);
    rlog.handoff('moderator-trigger', `r${roundNumber} attempting to trigger moderator stream`);

    if (!enabled || !threadId) {
      rlog.stuck('moderator-blocked', `r${roundNumber} BLOCKED: enabled=${enabled} threadId=${threadId?.slice(-8) || 'null'}`);
      return;
    }

    const moderatorId = `${threadId}_r${roundNumber}_moderator`;
    if (hasModeratorStreamBeenTriggered(moderatorId, roundNumber)) {
      rlog.race('moderator-duplicate', `r${roundNumber} SKIP: moderator already triggered id=${moderatorId}`);
      return;
    }

    rlog.moderator('triggerModeratorStream', `STARTING r${roundNumber} pMsgIds=${participantMessageIds.length}`);
    markModeratorStreamTriggered(moderatorId, roundNumber);
    setIsModeratorStreaming(true);

    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setState({
      error: null,
      isStreaming: true,
      roundNumber,
    });

    setMessages((currentMessages) => {
      const hasExistingPlaceholder = currentMessages.some(msg => msg.id === moderatorId);

      if (hasExistingPlaceholder) {
        return currentMessages.map(msg =>
          msg.id === moderatorId
            ? {
                ...msg,
                parts: [{ text: '', type: MessagePartTypes.TEXT }],
              }
            : msg,
        );
      } else {
        // ✅ FIX: Include role in metadata to pass DbModeratorMessageMetadataSchema validation
        // Without role in metadata, isModeratorMessage() returns false and the message
        // gets grouped with P1 instead of appearing as a separate moderator card
        const streamingModeratorMessage: UIMessage = {
          id: moderatorId,
          metadata: {
            isModerator: true,
            model: MODERATOR_NAME,
            participantIndex: MODERATOR_PARTICIPANT_INDEX,
            role: UIMessageRoles.ASSISTANT, // Required by DbModeratorMessageMetadataSchema
            roundNumber,
          },
          parts: [{ text: '', type: MessagePartTypes.TEXT }],
          role: UIMessageRoles.ASSISTANT,
        };
        return [...currentMessages, streamingModeratorMessage];
      }
    });

    try {
      // Use RPC service for type-safe moderator streaming
      const response = await streamModeratorService(
        {
          json: { participantMessageIds },
          param: {
            roundNumber: String(roundNumber),
            threadId,
          },
        },
        { signal: controller.signal },
      );

      // ✅ DEBUG: Log response status and relevant headers
      const xHeaders = Object.fromEntries(
        [...response.headers.entries()]
          .filter(([k]) => k.toLowerCase().startsWith('x-') || k.toLowerCase() === 'content-type')
          .map(([k, v]) => [k, v.slice(0, 50)]),
      );
      rlog.moderator('stream', `response status=${response.status} ok=${response.ok} headers=${JSON.stringify(xHeaders)}`);

      // ✅ FIX: Handle 204 No Content (another request is already handling moderator)
      // Don't try to read body, don't fetch final messages - just poll for completion
      if (response.status === 204) {
        rlog.moderator('stream', '204 received - another request handling moderator, polling for completion');

        // ✅ FIX: Check if subscription system is already handling moderator
        // If subscription is streaming or complete, skip polling to avoid race condition
        const subState = store.getState().subscriptionState;
        if (subState.moderator.status === 'streaming' || subState.moderator.status === 'complete') {
          rlog.moderator('stream', `204 but subscription already ${subState.moderator.status} - skipping poll`);
          setState(prev => ({ ...prev, isStreaming: false }));
          setIsModeratorStreaming(false);
          return;
        }

        // Poll for moderator message to appear in the database
        const pollForModerator = async (): Promise<boolean> => {
          const maxAttempts = 30; // 30 * 1000ms = 30 seconds max
          for (let attempt = 0; attempt < maxAttempts; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 1000));

            const result = await queryClient.fetchQuery({
              queryFn: () => getThreadMessagesService({ param: { id: threadId } }),
              queryKey: queryKeys.threads.messages(threadId),
              staleTime: 0,
            });

            if (result.success && result.data.items) {
              // Check if moderator message exists for this round
              const moderatorMsg = result.data.items.find((m) => {
                const meta = m.metadata as Record<string, unknown> | null | undefined;
                return m.roundNumber === roundNumber && meta?.isModerator === true;
              });

              if (moderatorMsg) {
                rlog.moderator('poll', `found moderator after ${attempt + 1} attempts`);

                // FIX: Use full replace instead of merge-update
                // This brings in ALL server messages (including P1) and removes streaming placeholders
                // The previous merge-update caused P1's server message to be missing and
                // streaming_* placeholders to persist
                const allServerMessages = chatMessagesToUIMessages(result.data.items, participants);
                setMessages(allServerMessages);
                rlog.moderator('poll', `replaced with ${allServerMessages.length} server messages`);
                return true;
              }
            }
            rlog.moderator('poll', `attempt ${attempt + 1}/${maxAttempts} - no moderator yet`);
          }
          return false;
        };

        const found = await pollForModerator();
        if (!found) {
          rlog.stuck('moderator-poll-timeout', `r${roundNumber} moderator not found after polling`);
        }

        // Don't run the stream reading logic below - subscription system handles completion
        setState(prev => ({ ...prev, isStreaming: false }));
        setIsModeratorStreaming(false);
        // ✅ FIX: Removed completeStreaming() - subscription system handles completion
        return;
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'unable to read body');
        rlog.moderator('stream', `ERROR body: ${errorText.slice(0, 200)}`);
        throw new Error(`Moderator stream failed: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }
      rlog.moderator('stream', 'reader obtained, starting read loop');

      const decoder = new TextDecoder();
      let accumulatedText = '';
      let lastUpdateTime = 0;
      let pendingUpdate = false;

      // ✅ DEBUG: Track ALL event types received for diagnosis
      const eventTypeCounts: Record<string, number> = {};
      const unknownLines: string[] = [];
      let rawChunkCount = 0;
      let textChunkCount = 0;

      const flushUpdate = () => {
        if (accumulatedText) {
          const textToSet = accumulatedText;
          setMessages(currentMessages =>
            currentMessages.map(msg =>
              msg.id === moderatorId
                ? {
                    ...msg,
                    parts: [{ text: textToSet, type: MessagePartTypes.TEXT }],
                  }
                : msg,
            ),
          );
          lastUpdateTime = Date.now();
          pendingUpdate = false;
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // ✅ DEBUG: Log comprehensive stream summary including ALL event types
          const eventSummary = Object.entries(eventTypeCounts)
            .map(([type, count]) => `${type}=${count}`)
            .join(' ');
          rlog.moderator('stream', `DONE reason=stream-end text=${textChunkCount} raw=${rawChunkCount} chars=${accumulatedText.length} events=[${eventSummary}]`);
          if (unknownLines.length > 0) {
            rlog.moderator('stream', `unknown lines: ${unknownLines.slice(0, 5).join(' | ')}`);
          }
          break;
        }

        rawChunkCount++;
        const chunk = decoder.decode(value, { stream: true });

        // ✅ DEBUG: Log first few raw chunks for visibility
        if (rawChunkCount <= 3) {
          rlog.moderator('stream', `raw chunk ${rawChunkCount}: "${chunk.slice(0, 150)}${chunk.length > 150 ? '...' : ''}"`);
        }

        const lines = chunk.split('\n');
        for (const rawLine of lines) {
          if (!rawLine.trim()) {
            continue; // Skip empty lines
          }

          // ✅ FIX: Strip SSE framing prefix if present
          const line = rawLine.startsWith('data: ') ? rawLine.slice(6) : rawLine;

          // Handle AI SDK data stream format (0:, 3:, etc.)
          if (line.startsWith('0:')) {
            eventTypeCounts['0:text'] = (eventTypeCounts['0:text'] || 0) + 1;
            try {
              const textData = JSON.parse(line.slice(2));
              if (typeof textData === 'string') {
                accumulatedText += textData;
                textChunkCount++;
                pendingUpdate = true;

                // Log first text chunk for visibility
                if (textChunkCount === 1) {
                  rlog.moderator('stream', `first text via 0: format, len=${textData.length}`);
                }

                const now = Date.now();
                if (now - lastUpdateTime >= UPDATE_THROTTLE_MS) {
                  flushUpdate();
                }
              }
            } catch {
              eventTypeCounts['0:parse-fail'] = (eventTypeCounts['0:parse-fail'] || 0) + 1;
            }
          } else if (line.startsWith('{')) {
            // ✅ FIX: Handle AI SDK v6 UI message stream format (JSON objects)
            try {
              const event = JSON.parse(line);
              const eventType = event.type || 'unknown-json';
              eventTypeCounts[eventType] = (eventTypeCounts[eventType] || 0) + 1;

              // ✅ FIX: Field is "delta" not "textDelta" in AI SDK v6 UI message stream format
              const textContent = event.delta ?? event.textDelta;
              if (event.type === 'text-delta' && typeof textContent === 'string') {
                accumulatedText += textContent;
                textChunkCount++;
                pendingUpdate = true;

                // Log first text chunk for visibility
                if (textChunkCount === 1) {
                  rlog.moderator('stream', `first text via text-delta, len=${textContent.length}`);
                }

                const now = Date.now();
                if (now - lastUpdateTime >= UPDATE_THROTTLE_MS) {
                  flushUpdate();
                }
              } else if (event.type === 'error') {
                rlog.moderator('stream', `ERROR event: ${JSON.stringify(event).slice(0, 150)}`);
              } else if (event.type === 'start' || event.type === 'start-step') {
                // Log start events - these should be followed by text-delta
                rlog.moderator('stream', `${event.type}: ${JSON.stringify(event).slice(0, 100)}`);
              } else if (event.type === 'finish' || event.type === 'step-finish') {
                // Log finish events
                rlog.moderator('stream', `${event.type}: finishReason=${event.finishReason || 'none'}`);
              }
            } catch {
              // Not valid JSON
              eventTypeCounts['json-parse-fail'] = (eventTypeCounts['json-parse-fail'] || 0) + 1;
              if (unknownLines.length < 10) {
                unknownLines.push(line.slice(0, 50));
              }
            }
          } else if (line.startsWith('2:')) {
            // Tool call chunk (AI SDK data stream format)
            eventTypeCounts['2:tool'] = (eventTypeCounts['2:tool'] || 0) + 1;
          } else if (line.startsWith('3:') || line.includes('error')) {
            // Log error events (data stream format)
            eventTypeCounts['3:error'] = (eventTypeCounts['3:error'] || 0) + 1;
            rlog.moderator('stream', `ERROR line: ${line.slice(0, 100)}`);
          } else if (line.startsWith('e:') || line.startsWith('d:')) {
            // Log finish/done chunks (data stream format)
            eventTypeCounts['e/d:finish'] = (eventTypeCounts['e/d:finish'] || 0) + 1;
            rlog.moderator('stream', `finish line: ${line.slice(0, 100)}`);
          } else {
            // Unknown line format - track for debugging
            const prefix = line.slice(0, 10);
            eventTypeCounts[`unknown:${prefix}`] = (eventTypeCounts[`unknown:${prefix}`] || 0) + 1;
            if (unknownLines.length < 10) {
              unknownLines.push(line.slice(0, 50));
            }
          }
        }
      }

      if (pendingUpdate) {
        flushUpdate();
      }

      const result = await queryClient.fetchQuery({
        queryFn: () => getThreadMessagesService({ param: { id: threadId } }),
        queryKey: queryKeys.threads.messages(threadId),
        staleTime: 0,
      });

      if (result.success && result.data.items) {
        // DEBUG: Log pre-conversion state
        rlog.moderator('fetch-pre', `serverMsgs=${result.data.items.length} storeParticipants=${participants?.length ?? 0}`);
        result.data.items.forEach((m, i) => {
          const pId = m.participantId || (m.metadata as Record<string, unknown>)?.participantId;
          rlog.moderator('fetch-msg', `[${i}] id=${m.id?.slice(-8)} role=${m.role} pId=${typeof pId === 'string' ? pId.slice(-8) : 'null'} round=${m.roundNumber}`);
        });

        const uiMessages = chatMessagesToUIMessages(result.data.items, participants);

        // DEBUG: Log post-conversion state with participantIndex
        uiMessages.forEach((m, i) => {
          const meta = m.metadata as Record<string, unknown> | undefined;
          rlog.moderator('converted', `[${i}] id=${m.id?.slice(-8)} pIdx=${meta?.participantIndex} pId=${typeof meta?.participantId === 'string' ? meta.participantId.slice(-8) : 'null'}`);
        });

        // After stream completion, server data is authoritative - use full replace
        // The flashing issue only occurs during polling (204 case), not here
        setMessages(uiMessages);
        rlog.moderator('stream', `FETCHED final msgs=${uiMessages.length}`);
      }

      // ✅ INVALIDATE USAGE STATS: After moderator completes, free users have freeRoundUsed=true
      // This ensures the submit button is disabled immediately after the round completes
      await queryClient.invalidateQueries({ queryKey: queryKeys.usage.stats() });

      rlog.moderator('stream', 'COMPLETE success');
      rlog.handoff('moderator-done', `r${roundNumber} moderator stream complete, round finished`);
      setState(prev => ({
        ...prev,
        isStreaming: false,
      }));
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        rlog.moderator('stream', 'ABORTED');
        setState(prev => ({
          ...prev,
          isStreaming: false,
        }));
        return;
      }

      rlog.moderator('stream', `ERROR: ${error instanceof Error ? error.message : String(error)}`);
      rlog.stuck('moderator-error', `r${roundNumber} moderator stream failed: ${error instanceof Error ? error.message : String(error)}`);
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error : new Error(String(error)),
        isStreaming: false,
      }));
    } finally {
      // ✅ FIX: Only cleanup local state - subscription system handles completion
      // Removing completeStreaming() call prevents duplicate phase transitions
      rlog.moderator('stream', 'FINALLY: cleanup only');
      setIsModeratorStreaming(false);
      abortRef.current = null;
    }
  }, [
    enabled,
    threadId,
    hasModeratorStreamBeenTriggered,
    markModeratorStreamTriggered,
    setIsModeratorStreaming,
    queryClient,
    participants,
    setMessages,
  ]);

  return {
    state,
    triggerModeratorStream,
  };
}
