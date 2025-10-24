/**
 * AI SDK v5 Streaming Utilities
 *
 * Provides helper functions for creating and manipulating AI streams.
 * Simplifies common streaming patterns and reduces boilerplate code.
 *
 * Key AI SDK v5 Patterns:
 * - streamText(): Core streaming API for text generation
 * - toUIMessageStreamResponse(): Convert stream to UI format
 * - Stream lifecycle management (onStart, onChunk, onComplete, onError)
 *
 * @module lib/ai/streaming-utils
 * @see https://sdk.vercel.ai/docs/reference/ai-sdk-core/stream-text
 * @see https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot-message-persistence
 */

import type { LanguageModel, StreamTextResult, ToolSet, UIMessage } from 'ai';
import { streamText } from 'ai';

import { convertUIToModelMessages, validateMessages } from './message-utils';
import type { StreamCallbacks, StreamConfig } from './types';

// ============================================================================
// Stream Creation Helpers
// ============================================================================

/**
 * Create UI message stream response with proper formatting
 *
 * Wrapper around AI SDK's toUIMessageStreamResponse() with type safety.
 * Used to return streaming responses to frontend clients.
 *
 * AI SDK v5 Pattern:
 * - StreamTextResult → toUIMessageStreamResponse()
 * - Formats stream for useChat() hook consumption
 * - Handles message parts, metadata, tool calls automatically
 *
 * @param result - StreamTextResult from streamText()
 * @returns Response object for streaming to client
 *
 * @example
 * ```typescript
 * const result = await streamText({
 *   model,
 *   messages: convertUIToModelMessages(messages),
 * });
 *
 * return createUIStreamResponse(result);
 * ```
 *
 * @see https://sdk.vercel.ai/docs/reference/ai-sdk-core/stream-text#touimessagestreamresponse
 */
export function createUIStreamResponse<TOOLS extends ToolSet = Record<string, never>>(
  result: StreamTextResult<TOOLS, Record<string, never>>,
): Response {
  return result.toUIMessageStreamResponse();
}

/**
 * Create text stream response (simple text streaming)
 *
 * Wrapper around AI SDK's toTextStreamResponse() for plain text streaming.
 * Used when you don't need full UI message structure.
 *
 * AI SDK v5 Pattern:
 * - StreamTextResult → toTextStreamResponse()
 * - Plain text chunks without message parts structure
 * - Lighter weight than toUIMessageStreamResponse()
 *
 * @param result - StreamTextResult from streamText()
 * @returns Response object for streaming text to client
 *
 * @example
 * ```typescript
 * const result = await streamText({
 *   model,
 *   prompt: 'Write a poem',
 * });
 *
 * return createTextStreamResponse(result);
 * ```
 *
 * @see https://sdk.vercel.ai/docs/reference/ai-sdk-core/stream-text#totextstreamresponse
 */
export function createTextStreamResponse<TOOLS extends ToolSet = Record<string, never>>(
  result: StreamTextResult<TOOLS, Record<string, never>>,
): Response {
  return result.toTextStreamResponse();
}

// ============================================================================
// Stream Creation with Configuration
// ============================================================================

/**
 * Create a streaming chat response with comprehensive configuration
 *
 * High-level helper that combines message preparation, streaming, and response formatting.
 * Handles common patterns: validation, conversion, and stream lifecycle.
 *
 * @param config - Stream configuration (model, temperature, etc.)
 * @param userMessage - New user message to append
 * @param callbacks - Optional lifecycle callbacks
 * @returns Response object for streaming to client
 *
 * @example
 * ```typescript
 * return createStreamingChatResponse(
 *   {
 *     model,
 *     temperature: 0.7,
 *     systemPrompt: 'You are a helpful assistant',
 *     previousMessages: chatHistory,
 *   },
 *   newUserMessage,
 *   {
 *     onComplete: async (fullText, messageId) => {
 *       await saveMessage(threadId, messageId, fullText);
 *     },
 *   }
 * );
 * ```
 */
export async function createStreamingChatResponse(
  config: StreamConfig,
  userMessage: UIMessage,
  callbacks?: StreamCallbacks,
): Promise<Response> {
  // Combine previous messages with new user message
  const allMessages = [...(config.previousMessages || []), userMessage];

  // Validate messages (AI SDK v5: validateMessages is async)
  const validationResult = await validateMessages(allMessages);
  if (!validationResult.valid) {
    throw new Error(`Message validation failed: ${JSON.stringify(validationResult.errors)}`);
  }

  // Convert to model format
  const modelMessages = convertUIToModelMessages(validationResult.validatedMessages!);

  // Create stream with callbacks
  const result = await streamText({
    model: config.model,
    messages: modelMessages,
    temperature: config.temperature,
    topP: config.topP,
    frequencyPenalty: config.frequencyPenalty,
    presencePenalty: config.presencePenalty,
    ...(config.systemPrompt && { system: config.systemPrompt }),
    onChunk: callbacks?.onChunk
      ? async ({ chunk }) => {
        if (chunk.type === 'text-delta') {
          await callbacks.onChunk?.(chunk.text);
        }
      }
      : undefined,
    onFinish: callbacks?.onComplete
      ? async ({ text }) => {
        const messageId = userMessage.id;
        await callbacks.onComplete?.(text, messageId);
      }
      : undefined,
  });

  // Return UI message stream response
  return createUIStreamResponse(result);
}

// ============================================================================
// Stream Merging and Manipulation
// ============================================================================

/**
 * Merge multiple streams with proper consumption pattern
 *
 * AI SDK v5 Pattern:
 * - Streams can only be consumed once
 * - Must merge carefully to avoid "stream already consumed" errors
 * - Used for combining multiple AI model responses
 *
 * @param streams - Array of stream results to merge
 * @returns Merged stream response
 *
 * @example
 * ```typescript
 * const stream1 = await streamText({ model: gpt4, prompt: 'Task 1' });
 * const stream2 = await streamText({ model: claude, prompt: 'Task 2' });
 *
 * return mergeStreams([stream1, stream2]);
 * ```
 *
 * @see https://sdk.vercel.ai/docs/ai-sdk-core/streaming-data#merging-streams
 */
export async function mergeStreams<TOOLS extends ToolSet = Record<string, never>>(
  streams: StreamTextResult<TOOLS, Record<string, never>>[],
): Promise<Response> {
  // Implementation note: Stream merging requires careful handling
  // For now, use the first stream as primary response
  // Advanced merging would require custom ReadableStream implementation

  if (streams.length === 0) {
    throw new Error('Cannot merge empty stream array');
  }

  if (streams.length === 1) {
    return createUIStreamResponse(streams[0]!);
  }

  // For multiple streams, return first stream
  // TODO: Implement proper stream merging when needed
  console.warn('Stream merging returning first stream only. Implement full merging if needed.');
  return createUIStreamResponse(streams[0]!);
}

// ============================================================================
// Stream Configuration Builders
// ============================================================================

/**
 * Build stream configuration from common parameters
 *
 * Helper to create StreamConfig objects with sensible defaults.
 *
 * @param model - Language model to use
 * @param options - Optional configuration overrides
 * @returns Complete StreamConfig object
 *
 * @example
 * ```typescript
 * const config = buildStreamConfig(model, {
 *   temperature: 0.9,
 *   maxTokens: 4096,
 * });
 *
 * const response = await createStreamingChatResponse(config, userMessage);
 * ```
 */
export function buildStreamConfig(
  model: LanguageModel,
  options?: Partial<Omit<StreamConfig, 'model'>>,
): StreamConfig {
  return {
    model,
    temperature: options?.temperature ?? 0.7,
    maxTokens: options?.maxTokens ?? 2048,
    topP: options?.topP,
    frequencyPenalty: options?.frequencyPenalty,
    presencePenalty: options?.presencePenalty,
    systemPrompt: options?.systemPrompt,
    previousMessages: options?.previousMessages || [],
  };
}

/**
 * Create streaming response with retry logic
 *
 * Wraps stream creation with automatic retry on transient failures.
 * Useful for handling rate limits and network issues.
 *
 * @param createStreamFn - Function that creates the stream
 * @param maxRetries - Maximum number of retry attempts
 * @param retryDelayMs - Delay between retries in milliseconds
 * @returns Stream response or throws after max retries
 *
 * @example
 * ```typescript
 * const response = await createStreamWithRetry(
 *   () => streamText({ model, messages }),
 *   3, // max retries
 *   1000 // 1 second delay
 * );
 * ```
 */
export async function createStreamWithRetry<TOOLS extends ToolSet = Record<string, never>>(
  createStreamFn: () => Promise<StreamTextResult<TOOLS, Record<string, never>>>,
  maxRetries: number = 3,
  retryDelayMs: number = 1000,
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await createStreamFn();
      return createUIStreamResponse(result);
    } catch (error) {
      lastError = error;

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, retryDelayMs * (attempt + 1)));
    }
  }

  throw new Error(`Stream creation failed after ${maxRetries} retries: ${lastError}`);
}
