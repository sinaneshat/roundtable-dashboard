/**
 * useSequentialStreaming Hook
 *
 * ✅ OFFICIAL REACT PATTERN: Custom Hook for Reusable Logic
 * ✅ CALLBACK-DRIVEN: No useEffect - direct function calls only
 * ✅ SIMPLIFIED: Single responsibility - handles streaming only
 *
 * Extracts streaming logic from ChatThreadScreen and ChatOverviewScreen
 * to eliminate duplication and increase reusability.
 */

import { useCallback, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import type { ParticipantConfig } from '@/lib/schemas/chat-forms';
import { toastManager } from '@/lib/toast/toast-manager';

// ✅ OFFICIAL AI SDK PATTERN: UIMessage format with reasoning support
// See: https://github.com/vercel/ai/blob/main/content/docs/04-ai-sdk-ui/02-chatbot.mdx
export type StreamMessage = {
  id: string;
  role: 'user' | 'assistant';
  parts: Array<
    | { type: 'text'; text: string }
    | { type: 'reasoning'; text: string }
  >;
  metadata?: Record<string, unknown>;
};

export type StreamingStatus = 'ready' | 'streaming' | 'error';

export type UseSequentialStreamingOptions = {
  threadId: string;
  selectedMode: string;
  selectedParticipants: ParticipantConfig[];
  selectedMemoryIds: string[];
  onError?: (error: Error) => void;
};

export type StreamingState = {
  messageId: string | null;
  participantIndex: number | null;
};

export type UseSequentialStreamingResult = {
  status: StreamingStatus;
  streamingState: StreamingState;
  streamParticipant: (participantIndex: number, messages: StreamMessage[]) => Promise<void>;
  streamAllParticipants: (messages: StreamMessage[]) => Promise<void>;
  stopStreaming: () => void;
};

/**
 * Hook for sequential multi-participant streaming
 * Uses callback-driven pattern instead of useEffect
 */
export function useSequentialStreaming(
  options: UseSequentialStreamingOptions,
  setMessages: React.Dispatch<React.SetStateAction<StreamMessage[]>>,
  setSelectedParticipants: React.Dispatch<React.SetStateAction<ParticipantConfig[]>>,
): UseSequentialStreamingResult {
  const { threadId, selectedMode, selectedParticipants, selectedMemoryIds, onError } = options;

  const [status, setStatus] = useState<StreamingStatus>('ready');
  const [streamingState, setStreamingState] = useState<StreamingState>({
    messageId: null,
    participantIndex: null,
  });
  const abortControllerRef = useRef<AbortController | null>(null);

  // ✅ CALLBACK: Stream a single participant
  const streamParticipant = useCallback(
    async (participantIndex: number, currentMessages: StreamMessage[]): Promise<void> => {
      setStatus('streaming');

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const response = await fetch(`/api/v1/chat/threads/${threadId}/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: currentMessages.map(m => ({
              id: m.id,
              role: m.role,
              parts: m.parts,
            })),
            participantIndex,
            mode: selectedMode,
            participants: selectedParticipants.map(p => ({
              modelId: p.modelId,
              role: p.role,
              customRoleId: p.customRoleId,
              order: p.order,
            })),
            memoryIds: selectedMemoryIds,
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader)
          throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';
        let messageId = '';
        let content = '';
        let messageMetadata: Record<string, unknown> | null = null;

        // ✅ OFFICIAL AI SDK PATTERN: Process entire stream without early exit
        // The 'finish' event marks completion, but we must process ALL buffered events
        while (true) {
          const { done, value } = await reader.read();
          if (done)
            break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim() || line.startsWith(':'))
              continue;

            if (line.startsWith('data: ')) {
              const data = line.slice(6);

              if (data === '[DONE]') {
                continue;
              }

              try {
                const event = JSON.parse(data);

                if (event.type === 'start') {
                  messageId = event.messageId;
                  messageMetadata = event.messageMetadata || null;
                  content = '';

                  console.log('[STREAM] START event:', { messageId, participantIndex, metadata: messageMetadata });

                  // ✅ Track which message is currently streaming
                  setStreamingState({
                    messageId,
                    participantIndex,
                  });

                  // Update config if backend sent new participant data
                  if (messageMetadata) {
                    const updatedParticipants = (messageMetadata as Record<string, unknown>)
                      .participants as ParticipantConfig[] | undefined;
                    if (updatedParticipants && updatedParticipants.length > 0) {
                      setSelectedParticipants(updatedParticipants);
                    }
                  }

                  const newMessage = {
                    id: messageId,
                    role: 'assistant' as const,
                    parts: [{ type: 'text' as const, text: '' }],
                    metadata: messageMetadata || undefined,
                  };

                  console.log('[STREAM] Adding new message to state:', newMessage);

                  setMessages((prev) => {
                    const updated = [...prev, newMessage];
                    console.log('[STREAM] Messages array after adding:', updated.length, 'messages');
                    return updated;
                  });
                } else if (event.type === 'text-delta') {
                  // ✅ OFFICIAL AI SDK FORMAT: Property is "delta" not "textDelta"
                  // See: https://github.com/vercel/ai/blob/main/content/docs/04-ai-sdk-ui/50-stream-protocol.mdx
                  const delta = event.delta || '';
                  content += delta;

                  console.log('[STREAM] TEXT-DELTA:', { delta, totalContent: `${content.substring(0, 50)}...` });

                  // ✅ OFFICIAL REACT PATTERN: flushSync forces immediate render
                  // Without this, React batches updates and you don't see incremental text
                  // See: https://react.dev/reference/react-dom/flushSync
                  // eslint-disable-next-line react-dom/no-flush-sync -- Required for real-time streaming display
                  flushSync(() => {
                    setMessages((prev) => {
                      const lastMessage = prev[prev.length - 1];
                      if (lastMessage?.id === messageId) {
                        const updated = [
                          ...prev.slice(0, -1),
                          { ...lastMessage, parts: [{ type: 'text' as const, text: content }] },
                        ];
                        console.log('[STREAM] Updated message text length:', content.length);
                        return updated;
                      }
                      console.warn('[STREAM] Could not find message to update:', messageId);
                      return prev;
                    });
                  });
                } else if (event.type === 'finish') {
                  // ✅ Stream finished - continue processing any remaining buffered events
                } else if (event.type === 'error') {
                  // ✅ OFFICIAL AI SDK PATTERN: Handle error events from stream
                  // See: https://github.com/vercel/ai/blob/main/content/docs/04-ai-sdk-ui/50-stream-protocol.mdx
                  const errorText = event.errorText || 'An error occurred during streaming';
                  console.error('[Stream] ERROR:', errorText);

                  // Update message with error content
                  // eslint-disable-next-line react-dom/no-flush-sync -- Required for immediate error display
                  flushSync(() => {
                    setMessages((prev) => {
                      const lastMessage = prev[prev.length - 1];
                      if (lastMessage?.id === messageId) {
                        return [
                          ...prev.slice(0, -1),
                          {
                            ...lastMessage,
                            parts: [{ type: 'text', text: `⚠️ ${errorText}` }],
                            metadata: { ...lastMessage.metadata, error: true },
                          },
                        ];
                      }
                      return prev;
                    });
                  });

                  setStatus('error');
                  throw new Error(errorText);
                }
              } catch (parseError) {
                console.error('Failed to parse SSE event:', parseError);
              }
            }
          }
        }
      } catch (error) {
        console.error('Streaming error:', error);
        if (error instanceof Error && error.name !== 'AbortError') {
          const err = error instanceof Error ? error : new Error(String(error));
          setStatus('error');
          onError?.(err);
          toastManager.error('Streaming failed', err.message);
        }
        // ✅ Clear streaming state on error
        setStreamingState({ messageId: null, participantIndex: null });
        throw error;
      } finally {
        // ✅ Clear streaming state when participant streaming completes
        setStreamingState({ messageId: null, participantIndex: null });
      }
    },
    [
      threadId,
      selectedMode,
      selectedParticipants,
      selectedMemoryIds,
      setMessages,
      setSelectedParticipants,
      onError,
    ],
  );

  // ✅ CALLBACK: Stream all participants sequentially
  const streamAllParticipants = useCallback(
    async (initialMessages: StreamMessage[]): Promise<void> => {
      const participantCount = selectedParticipants.length;
      let currentMessages = initialMessages;

      for (let i = 0; i < participantCount; i++) {
        try {
          await streamParticipant(i, currentMessages);

          // Read updated messages for next participant
          await new Promise<void>((resolve) => {
            setMessages((prev) => {
              currentMessages = prev;
              resolve();
              return prev;
            });
          });
        } catch (error) {
          console.error(`Failed to stream participant ${i}:`, error);
          setStatus('error');
          break;
        }
      }

      setStatus('ready');
    },
    [selectedParticipants, streamParticipant, setMessages],
  );

  // ✅ CALLBACK: Stop streaming
  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort();
    setStatus('ready');
    setStreamingState({ messageId: null, participantIndex: null });
  }, []);

  return {
    status,
    streamingState,
    streamParticipant,
    streamAllParticipants,
    stopStreaming,
  };
}
