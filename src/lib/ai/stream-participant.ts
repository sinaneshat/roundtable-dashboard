/**
 * Stream Participant Utility
 *
 * Handles streaming participant responses using Server-Sent Events (SSE):
 * - Parses SSE streams from backend createUIMessageStreamResponse()
 * - Handles event types: start, text-delta, error, finish
 * - Supports abort signals and error handling
 */

/**
 * Generic message type for streaming
 * Compatible with any message format from AI SDK hooks
 */
type StreamMessage = {
  id: string;
  role: string;
  parts: Array<{ type: string; text: string }>;
  metadata?: Record<string, unknown> | null;
};

/**
 * Options for streaming a participant response
 */
export type StreamParticipantOptions = {
  /** Thread ID for the chat thread */
  threadId: string;
  /** All messages in the conversation (history + new message) */
  messages: StreamMessage[];
  /** Index of the participant to stream (0-based) */
  participantIndex: number;
  /**
   * Callback to update message state
   * Compatible with setMessages from useChat hook and other AI SDK hooks
   * Uses `any` to be compatible with different message type variants
   */
  // eslint-disable-next-line ts/no-explicit-any
  onUpdate: (updater: any) => void;
  /** Optional abort signal to cancel the stream */
  signal?: AbortSignal;
};

/**
 * Stream a participant response
 * @throws Error if request fails or stream encounters errors
 */
export async function streamParticipant({
  threadId,
  messages,
  participantIndex,
  onUpdate,
  signal,
}: StreamParticipantOptions): Promise<void> {
  const response = await fetch(`/api/v1/chat/threads/${threadId}/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: messages.map(m => ({
        id: m.id,
        role: m.role,
        parts: m.parts,
      })),
      participantIndex,
    }),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let messageId = '';
  let messageMetadata: Record<string, unknown> | null = null;
  let content = '';

  try {
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
          if (data === '[DONE]')
            continue;

          try {
            const event = JSON.parse(data);

            if (event.type === 'start') {
              messageId = event.messageId;
              messageMetadata = event.messageMetadata || null;
              content = '';

              // eslint-disable-next-line ts/no-explicit-any
              onUpdate((prev: any) => [
                ...prev,
                {
                  id: messageId,
                  role: 'assistant',
                  parts: [{ type: 'text', text: '' }],
                  metadata: messageMetadata,
                },
              ]);
            } else if (event.type === 'text-delta' && event.delta) {
              content += event.delta;

              // eslint-disable-next-line ts/no-explicit-any
              onUpdate((prev: any) =>
                // eslint-disable-next-line ts/no-explicit-any
                prev.map((m: any) =>
                  m.id === messageId
                    ? { ...m, parts: [{ type: 'text', text: content.trimStart() }] }
                    : m,
                ),
              );
            } else if (event.type === 'error') {
              throw new Error(event.error || 'Stream error occurred');
            }
          } catch (parseError) {
            if (parseError instanceof Error && parseError.message !== 'Stream error occurred') {
              console.error('Failed to parse SSE event:', parseError);
            } else {
              throw parseError;
            }
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
