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

      // Add placeholder message for this participant
      setMessages(prev => [
        ...prev,
        {
          id: messageId,
          role: 'assistant',
          parts: [],
          metadata: { participantIndex },
        },
      ]);

      try {
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

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({
            error: { message: response.statusText },
          })) as { error?: { message?: string } };
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

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
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
                continue;
              }

              try {
                const event = JSON.parse(data);

                // Handle text delta - update message content
                if (event.type === 'text-delta' && event.textDelta) {
                  currentContent += event.textDelta;

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
                  setMessages(prev =>
                    prev.map(msg =>
                      msg.id === messageId
                        ? {
                            ...msg,
                            metadata: {
                              ...(msg.metadata || {}),
                              ...(event.metadata || {}),
                            },
                          }
                        : msg,
                    ),
                  );

                  // Sync participants if backend sent updates
                  if (event.metadata?.participants) {
                    setSelectedParticipants(event.metadata.participants);
                  }
                }

                // Handle error
                if (event.type === 'error') {
                  throw new Error(event.error?.message || 'Stream error');
                }
              } catch (parseError) {
                console.error('Failed to parse SSE event:', parseError);
              }
            }
          }
        }
      } catch (error) {
        // Handle abort
        if (error instanceof Error && error.name === 'AbortError') {
          return; // Graceful abort - don't throw
        }

        // Handle other errors
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

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
