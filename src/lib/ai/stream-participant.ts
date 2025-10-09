/**
 * Stream Participant Utility
 *
 * Handles streaming participant responses using Server-Sent Events (SSE):
 * - Parses SSE streams from backend createUIMessageStreamResponse()
 * - Handles event types: start, text-delta, error, finish
 * - Supports abort signals and error handling
 * - Follows AI SDK v5 error handling patterns (graceful error events, no throwing)
 */

import type { ParticipantConfig } from '@/lib/schemas/chat-forms';

/**
 * Message part compatible with AI SDK UIMessage
 * Allows any part with type and text to match actual AI SDK hook return types
 */
type MessagePart = {
  type: string;
  text: string;
};

/**
 * Message type compatible with AI SDK UIMessage and useChat hook
 * Matches the structure used by useChat and other AI SDK hooks
 * Uses flexible types to be compatible with different AI SDK message formats
 */
type StreamMessage = {
  id: string;
  role: 'user' | 'assistant';
  parts: MessagePart[];
  metadata?: unknown;
};

/**
 * Message updater function type
 * Takes previous messages and returns updated messages
 * Compatible with setMessages from useChat hook
 */
type MessageUpdater<T extends StreamMessage = StreamMessage> = (
  prevMessages: T[]
) => T[];

/**
 * Participant configuration for sending to backend (matches API schema)
 */
type ParticipantConfigRequest = {
  modelId: string;
  role?: string | null;
  customRoleId?: string | null;
  order?: number;
};

/**
 * Updated config data from backend after participant updates
 */
type ConfigUpdateData = {
  participants: ParticipantConfig[];
  threadMode?: string;
};

/**
 * Options for streaming a participant response
 * Generic type T allows compatibility with different message types from AI SDK hooks
 */
export type StreamParticipantOptions<T extends StreamMessage = StreamMessage> = {
  /** Thread ID for the chat thread */
  threadId: string;
  /** All messages in the conversation (history + new message) */
  messages: T[];
  /** Index of the participant to stream (0-based) */
  participantIndex: number;
  /**
   * Callback to update message state
   * Compatible with setMessages from useChat and other AI SDK hooks
   */
  onUpdate: (updater: MessageUpdater<T> | T[]) => void;
  /** Optional abort signal to cancel the stream */
  signal?: AbortSignal;
  /** Optional: Update thread mode for this round */
  mode?: string;
  /** Optional: Update thread participants for this round (sent to backend) */
  participants?: ParticipantConfigRequest[];
  /** Optional: Update thread memories for this round */
  memoryIds?: string[];
  /**
   * Optional: Callback when backend sends updated config (participant IDs, mode)
   * Called when backend processes participant/mode changes and returns new IDs
   */
  onConfigUpdate?: (config: ConfigUpdateData) => void;
};

/**
 * Stream a participant response
 * Follows AI SDK v5 error handling patterns - errors are handled gracefully without throwing
 * @throws Error only if request fails (not for stream error events)
 */
export async function streamParticipant<T extends StreamMessage = StreamMessage>({
  threadId,
  messages,
  participantIndex,
  onUpdate,
  signal,
  mode,
  participants,
  memoryIds,
  onConfigUpdate,
}: StreamParticipantOptions<T>): Promise<void> {
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
      // ✅ Include config updates if provided (backend will update thread)
      ...(mode && { mode }),
      ...(participants && { participants }),
      ...(memoryIds !== undefined && { memoryIds }),
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

              // ✅ CRITICAL: Extract updated config from metadata and notify caller
              // When backend processes participant/mode updates, it returns new IDs
              // Frontend must update its state to prevent "Invalid participantIndex" errors
              if (messageMetadata && onConfigUpdate) {
                const updatedParticipants = (messageMetadata as Record<string, unknown>).participants as ParticipantConfig[] | undefined;
                const updatedMode = (messageMetadata as Record<string, unknown>).threadMode as string | undefined;

                if (updatedParticipants && updatedParticipants.length > 0) {
                  onConfigUpdate({
                    participants: updatedParticipants,
                    threadMode: updatedMode,
                  });
                }
              }

              onUpdate((prev: T[]): T[] => [
                ...prev,
                {
                  id: messageId,
                  role: 'assistant',
                  parts: [{ type: 'text', text: '' }],
                  metadata: messageMetadata,
                } as T,
              ]);
            } else if (event.type === 'text-delta' && event.delta) {
              content += event.delta;

              onUpdate((prev: T[]): T[] =>
                prev.map((m: T): T =>
                  m.id === messageId
                    ? ({ ...m, parts: [{ type: 'text', text: content.trimStart() }] } as T)
                    : m,
                ),
              );
            } else if (event.type === 'error') {
              // ✅ AI SDK v5 ERROR HANDLING PATTERN
              // Following official docs: https://sdk.vercel.ai/docs/ai-sdk-core/error-handling
              // Error events should be handled gracefully without throwing
              // The backend saves error metadata to database in onFinish callback
              // Frontend displays errors inline using AI Elements Message component
              // Not throwing ensures sequential participant chain continues
              console.error('Stream error event received:', event.error || 'Unknown error');

              // ✅ CRITICAL FIX: If error arrives before "start" event, create the message now
              // This ensures the message count increments and next participant triggers
              if (!messageId && event.messageId) {
                messageId = event.messageId;
                messageMetadata = event.messageMetadata || null;
                content = '';

                onUpdate((prev: T[]): T[] => [
                  ...prev,
                  {
                    id: messageId!,
                    role: 'assistant',
                    parts: [{ type: 'text', text: '' }],
                    metadata: messageMetadata,
                  } as T,
                ]);
              }

              // Complete the message with current content (may be empty)
              // Error metadata from database will be displayed instead
              if (messageId) {
                onUpdate((prev: T[]): T[] =>
                  prev.map((m: T): T =>
                    m.id === messageId!
                      ? ({ ...m, parts: [{ type: 'text', text: content.trimStart() || '' }] } as T)
                      : m,
                  ),
                );
              }

              // Return gracefully - allows next participant to trigger
              return;
            }
          } catch (parseError) {
            console.error('Failed to parse SSE event:', parseError);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
