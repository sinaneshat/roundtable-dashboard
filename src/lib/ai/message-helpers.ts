/**
 * Message Transformation Helpers
 *
 * ✅ OFFICIAL AI SDK PATTERN: Server message → UIMessage transformation
 * Centralizes the logic for converting backend message format to AI SDK UIMessage format
 *
 * See: https://github.com/vercel/ai/blob/main/content/docs/04-ai-sdk-ui/02-chatbot.mdx
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Server message format from database
 */
export type ServerMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string | null;
  metadata?: Record<string, unknown> | string | null;
  createdAt?: string;
};

/**
 * ✅ OFFICIAL AI SDK PATTERN: UIMessage format with reasoning support
 */
export type UIMessage = {
  id: string;
  role: 'user' | 'assistant';
  parts: Array<
    | { type: 'text'; text: string }
    | { type: 'reasoning'; text: string }
  >;
  metadata?: Record<string, unknown>;
};

// ============================================================================
// Transformation Functions
// ============================================================================

/**
 * Parse metadata from server format (handles both string and object)
 */
function parseMetadata(metadata: Record<string, unknown> | string | null | undefined): Record<string, unknown> | undefined {
  if (!metadata) {
    return undefined;
  }

  if (typeof metadata === 'string') {
    try {
      return JSON.parse(metadata);
    } catch {
      return undefined;
    }
  }

  return metadata;
}

/**
 * Convert server message to AI SDK UIMessage format
 *
 * @param message - Server message from database
 * @returns UIMessage in AI SDK format
 */
export function serverMessageToUIMessage(message: ServerMessage): UIMessage {
  const parts: UIMessage['parts'] = [];

  // Add text content part
  if (message.content) {
    parts.push({ type: 'text', text: message.content });
  }

  // Add reasoning part (if present)
  if (message.reasoning) {
    parts.push({ type: 'reasoning', text: message.reasoning });
  }

  return {
    id: message.id,
    role: message.role,
    parts,
    metadata: parseMetadata(message.metadata),
  };
}

/**
 * Convert array of server messages to AI SDK UIMessage format
 *
 * @param messages - Array of server messages from database
 * @returns Array of UIMessages in AI SDK format
 */
export function serverMessagesToUIMessages(messages: ServerMessage[]): UIMessage[] {
  return messages.map(serverMessageToUIMessage);
}
