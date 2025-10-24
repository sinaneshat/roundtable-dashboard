/**
 * AI SDK v5 Type Definitions and Extensions
 *
 * Centralized type imports and product-specific type extensions for AI SDK v5.
 * Re-exports core AI SDK types for consistent usage across the application.
 *
 * @module lib/ai/types
 * @see https://sdk.vercel.ai/docs/reference/ai-sdk-core
 */

// ============================================================================
// Core AI SDK Type Re-exports
// ============================================================================

/**
 * Import types from AI SDK v5 for use in type definitions below
 */
import type {
  LanguageModel,
  TypeValidationError,
  UIMessage,
} from 'ai';

/**
 * UIMessage - Represents messages as they appear in the UI
 * @see https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot-message-persistence
 */
export type { UIMessage, UIMessagePart } from 'ai';

/**
 * ModelMessage - Internal format for LLM providers
 * @see https://sdk.vercel.ai/docs/reference/ai-sdk-core/convert-to-model-messages
 */
export type { CoreAssistantMessage, CoreMessage, CoreSystemMessage, CoreUserMessage } from 'ai';

/**
 * Stream-related types
 * @see https://sdk.vercel.ai/docs/reference/ai-sdk-core/stream-text
 */
export type { StreamObjectResult, StreamTextResult, TextStreamPart } from 'ai';

/**
 * Tool calling types
 * @see https://sdk.vercel.ai/docs/ai-sdk-core/tools-and-tool-calling
 * Note: Tool, ToolCallPart, ToolResultPart are from @ai-sdk/provider-utils (re-exported by 'ai')
 */
export type { Tool, ToolCallPart, ToolResultPart } from 'ai';

/**
 * Provider types
 * @see https://sdk.vercel.ai/docs/providers/overview
 */
export type { LanguageModel } from 'ai';

/**
 * Message validation types
 * @see https://sdk.vercel.ai/docs/reference/ai-sdk-core/validate-ui-messages
 * Note: AI SDK v5 renamed ValidationError to TypeValidationError
 */
export type { TypeValidationError } from 'ai';

// ============================================================================
// Product-Specific Type Extensions
// ============================================================================

/**
 * Extended metadata for UIMessage with product-specific fields
 *
 * Used throughout the application to attach additional context to messages:
 * - Participant tracking (multi-model chat)
 * - Round-based conversation flow
 * - Error handling and retry state
 * - Model performance metadata
 *
 * @example
 * ```typescript
 * const message: UIMessage = {
 *   id: ulid(),
 *   role: 'assistant',
 *   parts: [{ type: 'text', text: 'Hello!' }],
 *   metadata: {
 *     participantId: 'part_123',
 *     participantIndex: 0,
 *     model: 'gpt-4o-mini',
 *     roundNumber: 1,
 *     createdAt: new Date().toISOString()
 *   }
 * };
 * ```
 */
export type UIMessageMetadata = {
  // Participant tracking (multi-model chat)
  participantId?: string;
  participantIndex?: number;
  participantRole?: string | null;

  // Model information
  model?: string;

  // Round-based conversation
  roundNumber?: number;

  // Timestamps
  createdAt?: string;

  // Error handling
  hasError?: boolean;
  errorType?: string;
  errorMessage?: string;
  errorCategory?: string;
  statusCode?: number;
  rawErrorMessage?: string;
  providerMessage?: string;
  openRouterError?: string;
  openRouterCode?: string;

  // Performance metadata
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };

  // Allow additional metadata fields
  [key: string]: unknown;
};

/**
 * UIMessage with typed metadata for product-specific use cases
 *
 * @example
 * ```typescript
 * const typedMessage: UIMessageWithMetadata = {
 *   id: ulid(),
 *   role: 'assistant',
 *   parts: [{ type: 'text', text: 'Response' }],
 *   metadata: {
 *     participantId: 'part_123',
 *     model: 'gpt-4o-mini',
 *     roundNumber: 2
 *   }
 * };
 * ```
 */
export type UIMessageWithMetadata = {
  metadata?: UIMessageMetadata;
} & Omit<UIMessage, 'metadata'>;

/**
 * Error types for AI operations
 *
 * Categorizes AI-related errors for proper handling and user messaging.
 *
 * @example
 * ```typescript
 * const errorType: AIErrorType = 'provider_rate_limit';
 * const errorMessage = getErrorMessage(errorType);
 * ```
 */
export type AIErrorType
  = | 'provider_rate_limit'
    | 'provider_network'
    | 'model_not_found'
    | 'model_content_filter'
    | 'authentication'
    | 'validation'
    | 'silent_failure'
    | 'empty_response'
    | 'error'
    | 'unknown';

/**
 * Configuration for streaming operations
 *
 * @example
 * ```typescript
 * const config: StreamConfig = {
 *   model,
 *   temperature: 0.7,
 *   maxTokens: 2048,
 *   systemPrompt: 'You are a helpful assistant',
 *   previousMessages: [...history]
 * };
 * ```
 */
export type StreamConfig = {
  model: LanguageModel;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  systemPrompt?: string;
  previousMessages?: UIMessage[];
};

/**
 * Callback functions for streaming lifecycle events
 *
 * @example
 * ```typescript
 * const callbacks: StreamCallbacks = {
 *   onStart: async (threadId) => {
 *     console.log('Stream started:', threadId);
 *   },
 *   onComplete: async (fullText, messageId) => {
 *     await saveMessage(messageId, fullText);
 *   },
 *   onError: async (error) => {
 *     console.error('Stream error:', error);
 *   }
 * };
 * ```
 */
export type StreamCallbacks = {
  onStart?: (threadId: string) => Promise<void>;
  onComplete?: (fullText: string, messageId: string) => Promise<void>;
  onError?: (error: unknown) => Promise<void>;
  onChunk?: (chunk: string) => Promise<void>;
};

/**
 * Validation result for message arrays
 *
 * @example
 * ```typescript
 * const result = validateMessages(messages);
 * if (!result.valid) {
 *   console.error('Validation errors:', result.errors);
 * }
 * ```
 */
export type MessageValidationResult = {
  valid: boolean;
  errors?: TypeValidationError[];
  validatedMessages?: UIMessage[];
};
