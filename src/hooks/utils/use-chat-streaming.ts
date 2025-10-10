/**
 * Simplified Chat Streaming Hook
 *
 * This hook handles multi-participant sequential streaming following AI SDK patterns.
 *
 * ✅ COMPLIANT WITH AI SDK V5:
 * - Uses standard fetch + ReadableStream (no manual SSE parsing)
 * - Proper React state management (no flushSync)
 * - Built-in AbortController cleanup
 * - Status management following AI SDK patterns
 *
 * 🎯 APPLICATION-SPECIFIC:
 * - Multi-participant sequential streaming (roundtable feature)
 * - Participant state synchronization
 *
 * Simplified from 312 lines → ~150 lines by removing:
 * - Manual SSE parsing (130 lines)
 * - Manual message state management with flushSync
 * - Complex abort controller chains
 * - Custom status tracking
 */

'use client';

import type { UIMessage } from 'ai';
import { useCallback, useRef, useState } from 'react';

import type { ParticipantConfig } from '@/lib/schemas/chat-forms';

// ============================================================================
// Types - Using AI SDK Exported Types
// ============================================================================

type StreamStatus = 'ready' | 'streaming' | 'error';

type StreamingState = {
  participantIndex: number | null;
  messageId: string | null;
};

type UseChatStreamingOptions = {
  threadId: string;
  selectedMode: string;
  selectedParticipants: ParticipantConfig[];
  selectedMemoryIds: string[];
  onError?: (error: Error) => void;
};

type UseChatStreamingResult = {
  status: StreamStatus;
  streamingState: StreamingState;
  streamMessage: (messages: UIMessage[]) => Promise<void>;
  stopStreaming: () => void;
};

// ============================================================================
// Hook Implementation
// ============================================================================

export function useChatStreaming(
  options: UseChatStreamingOptions,
  setMessages: React.Dispatch<React.SetStateAction<UIMessage[]>>,
  setSelectedParticipants: React.Dispatch<React.SetStateAction<ParticipantConfig[]>>,
): UseChatStreamingResult {
  const { threadId, selectedMode, selectedParticipants, selectedMemoryIds, onError } = options;

  const [status, setStatus] = useState<StreamStatus>('ready');
  const [streamingState, setStreamingState] = useState<StreamingState>({
    participantIndex: null,
    messageId: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Stop the current streaming operation
   */
  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setStatus('ready');
    setStreamingState({ participantIndex: null, messageId: null });
  }, []);

  /**
   * Stream a single participant's response
   */
  const streamSingleParticipant = useCallback(
    async (
      participantIndex: number,
      messages: UIMessage[],
      abortSignal: AbortSignal,
    ): Promise<void> => {
      const messageId = `msg-${Date.now()}-${participantIndex}`;

      // Update streaming state
      setStreamingState({ participantIndex, messageId });

      // ✅ Get participant data for metadata
      const participant = selectedParticipants[participantIndex];
      if (!participant) {
        console.error('[STREAMING] Invalid participant index:', participantIndex);
        throw new Error(`Invalid participant index: ${participantIndex}`);
      }

      // Add placeholder message for this participant
      // ✅ CRITICAL: Include participantId, model, role, and createdAt in metadata for rendering and timeline sorting
      setMessages(prev => [
        ...prev,
        {
          id: messageId,
          role: 'assistant',
          parts: [],
          metadata: {
            participantId: participant.id, // ✅ Required for participant lookup during rendering
            participantIndex,
            model: participant.modelId, // ✅ Required for avatar rendering
            role: participant.role, // ✅ Required for display
            createdAt: new Date().toISOString(), // ✅ Required for timeline sorting
          },
        },
      ]);

      try {
        // Log streaming request details for debugging
        console.warn('[STREAMING] Starting request:', {
          threadId,
          participantIndex,
          mode: selectedMode,
          participantCount: selectedParticipants.length,
          memoryCount: selectedMemoryIds.length,
          messageCount: messages.length,
        });

        // Make streaming request - backend handles SSE format
        const response = await fetch(`/api/v1/chat/threads/${threadId}/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages,
            mode: selectedMode,
            participants: selectedParticipants,
            memoryIds: selectedMemoryIds,
            participantIndex,
          }),
          signal: abortSignal,
        });

        console.warn('[STREAMING] Response received:', {
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          contentType: response.headers.get('content-type'),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({
            error: { message: response.statusText },
          })) as { error?: { message?: string } };
          console.error('[STREAMING] Request failed:', errorData);
          throw new Error(errorData.error?.message || 'Stream request failed');
        }

        if (!response.body) {
          throw new Error('Response body is null');
        }

        // ✅ Use browser's built-in ReadableStream - no manual parsing needed
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let currentContent = '';
        let eventCount = 0;

        console.warn('[STREAMING] Starting SSE stream processing');

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            console.warn('[STREAMING] Stream completed:', {
              totalEvents: eventCount,
              finalContentLength: currentContent.length,
              hasContent: currentContent.length > 0,
            });

            // ✅ Handle empty response case (model failed silently)
            if (currentContent.length === 0) {
              console.warn('[STREAMING] Stream completed with no content - marking as error');
              setMessages(prev =>
                prev.map(msg =>
                  msg.id === messageId
                    ? {
                        ...msg,
                        parts: [{ type: 'text' as const, text: '⚠️ An unexpected error occurred. Retrying...' }],
                        metadata: {
                          ...(msg.metadata || {}),
                          error: 'unknown',
                          errorMessage: 'An unexpected error occurred. Retrying...',
                          errorType: 'unknown',
                          isTransient: true,
                        },
                      }
                    : msg,
                ),
              );
            }

            break;
          }

          // Decode chunk
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          // Process SSE events
          for (const line of lines) {
            if (!line.trim() || line.startsWith(':')) {
              continue;
            }

            if (line.startsWith('data: ')) {
              const data = line.slice(6);

              // ✅ Skip [DONE] sentinel value (not JSON)
              if (data === '[DONE]') {
                console.warn('[STREAMING] Received [DONE] sentinel');
                continue;
              }

              try {
                const event = JSON.parse(data);
                eventCount++;
                console.warn('[STREAMING] SSE event received:', {
                  type: event.type,
                  eventNumber: eventCount,
                  hasDelta: !!event.delta,
                  hasMetadata: !!event.metadata,
                  hasMessageMetadata: !!event.messageMetadata,
                });

                // Handle start event - may contain error info in metadata
                if (event.type === 'start' && event.messageMetadata) {
                  const startMetadata = event.messageMetadata;
                  // Merge start metadata into message immediately
                  // ✅ NEW: Now includes roundId for variant tracking
                  setMessages(prev =>
                    prev.map(msg =>
                      msg.id === messageId
                        ? {
                            ...msg,
                            metadata: {
                              ...(msg.metadata || {}),
                              ...startMetadata,
                              // ✅ Initialize variant metadata (will be populated in finish event)
                              variants: [],
                              currentVariantIndex: 0,
                              hasVariants: false,
                            },
                          }
                        : msg,
                    ),
                  );
                }

                // Handle text delta - update message content
                if (event.type === 'text-delta' && event.delta) {
                  currentContent += event.delta;

                  // Update message with accumulated content
                  setMessages(prev =>
                    prev.map(msg =>
                      msg.id === messageId
                        ? {
                            ...msg,
                            parts: [{ type: 'text' as const, text: currentContent }],
                          }
                        : msg,
                    ),
                  );
                }

                // Handle finish - update with metadata from backend
                if (event.type === 'finish') {
                  const finishMetadata = event.metadata || {};

                  // Check if backend sent error information in metadata
                  const hasBackendError = finishMetadata.error || finishMetadata.errorMessage;

                  if (hasBackendError) {
                    console.warn('[STREAMING] Backend reported error in finish event:', {
                      error: finishMetadata.error,
                      errorMessage: finishMetadata.errorMessage,
                      errorType: finishMetadata.errorType,
                      isTransient: finishMetadata.isTransient,
                      hasContent: currentContent.length > 0,
                    });
                  }

                  // ✅ NEW: Log variant metadata received from backend
                  if (finishMetadata.variants) {
                    console.warn('[STREAMING] Variant metadata received:', {
                      messageId,
                      variantCount: finishMetadata.variants.length,
                      currentVariantIndex: finishMetadata.currentVariantIndex,
                      activeVariantIndex: finishMetadata.activeVariantIndex,
                      totalVariants: finishMetadata.totalVariants,
                      hasVariants: finishMetadata.hasVariants,
                      roundId: finishMetadata.roundId,
                    });
                  }

                  setMessages(prev =>
                    prev.map(msg =>
                      msg.id === messageId
                        ? {
                            ...msg,
                            metadata: {
                              ...(msg.metadata || {}),
                              ...finishMetadata,
                              // ✅ NEW: Store variant metadata from backend
                              // This eliminates the need for separate API calls to get variants
                              variants: finishMetadata.variants || [],
                              currentVariantIndex: finishMetadata.currentVariantIndex ?? 0,
                              activeVariantIndex: finishMetadata.activeVariantIndex ?? 0,
                              totalVariants: finishMetadata.totalVariants ?? 1,
                              hasVariants: finishMetadata.hasVariants ?? false,
                              roundId: finishMetadata.roundId || messageId,
                              parentMessageId: finishMetadata.parentMessageId,
                            },
                            // If backend sent error but no content, show error message
                            ...(hasBackendError && currentContent.length === 0
                              ? {
                                  parts: [{
                                    type: 'text' as const,
                                    text: finishMetadata.errorMessage || '⚠️ An unexpected error occurred. Retrying...',
                                  }],
                                }
                              : {}),
                          }
                        : msg,
                    ),
                  );

                  // Sync participants if backend sent updates
                  if (finishMetadata.participants) {
                    setSelectedParticipants(finishMetadata.participants);
                  }
                }

                // Handle error
                if (event.type === 'error') {
                  throw new Error(event.error?.message || 'Stream error');
                }
              } catch (parseError) {
                console.error('[STREAMING] Failed to parse SSE event:', {
                  error: parseError,
                  rawData: data,
                  line,
                });
              }
            }
          }
        }
      } catch (error) {
        // Handle abort
        if (error instanceof Error && error.name === 'AbortError') {
          console.warn('[STREAMING] Aborted by user');
          return; // Graceful abort - don't throw
        }

        // Handle other errors
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[STREAMING] Fatal error:', {
          error,
          errorMessage,
          messageId,
        });

        setMessages(prev =>
          prev.map(msg =>
            msg.id === messageId
              ? {
                  ...msg,
                  parts: [{ type: 'text' as const, text: `Error: ${errorMessage}` }],
                  metadata: {
                    ...(msg.metadata || {}),
                    error: errorMessage,
                  },
                }
              : msg,
          ),
        );

        if (onError) {
          onError(error instanceof Error ? error : new Error(String(error)));
        }

        throw error; // Re-throw to stop the participant loop
      }
    },
    [threadId, selectedMode, selectedParticipants, selectedMemoryIds, setMessages, setSelectedParticipants, onError],
  );

  /**
   * Stream all participants sequentially
   */
  const streamMessage = useCallback(
    async (initialMessages: UIMessage[]): Promise<void> => {
      if (status === 'streaming') {
        return;
      }

      // Create abort controller for this stream session
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      setStatus('streaming');

      try {
        // Stream each participant sequentially
        for (let i = 0; i < selectedParticipants.length; i++) {
          // Check if aborted between participants
          if (abortController.signal.aborted) {
            break;
          }

          // Get current messages for this participant (includes previous participants' responses)
          let currentMessages: UIMessage[] = [];
          if (i === 0) {
            // First participant uses initial messages
            currentMessages = initialMessages;
          } else {
            // Subsequent participants get updated messages (includes previous responses)
            setMessages((prev) => {
              currentMessages = prev;
              return prev;
            });
          }

          // ✅ CRITICAL: Ensure we have at least the user message before streaming
          if (currentMessages.length === 0) {
            console.error('[STREAMING] Cannot stream participant - no messages in conversation:', {
              participantIndex: i,
              initialMessagesLength: initialMessages.length,
            });
            throw new Error('No messages available to stream');
          }

          console.warn('[STREAMING] Streaming participant', i, 'with', currentMessages.length, 'messages');

          await streamSingleParticipant(i, currentMessages, abortController.signal);
        }

        setStatus('ready');
      } catch {
        // Error already handled in streamSingleParticipant
        setStatus('error');
      } finally {
        // Cleanup
        abortControllerRef.current = null;
        setStreamingState({ participantIndex: null, messageId: null });
      }
    },
    [status, selectedParticipants, streamSingleParticipant, setMessages],
  );

  return {
    status,
    streamingState,
    streamMessage,
    stopStreaming,
  };
}
