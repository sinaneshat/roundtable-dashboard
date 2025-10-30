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

import type { UIMessageMetadata } from '@/lib/schemas/message-metadata';

// ✅ UIMessageMetadata - Now imported from Zod schema (single source of truth)
export type { UIMessageMetadata } from '@/lib/schemas/message-metadata';

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

// ============================================================================
// Product-Specific Type Extensions
// ============================================================================

/**
 * Message validation types
 * @see https://sdk.vercel.ai/docs/reference/ai-sdk-core/validate-ui-messages
 * Note: AI SDK v5 renamed ValidationError to TypeValidationError
 */
export type { TypeValidationError } from 'ai';

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
 *     // Stream started
 *   },
 *   onComplete: async (fullText, messageId) => {
 *     await saveMessage(messageId, fullText);
 *   },
 *   onError: async (error) => {
 *     // Handle stream error
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
 *   throw new Error('Validation errors');
 * }
 * ```
 */
export type MessageValidationResult = {
  valid: boolean;
  errors?: TypeValidationError[];
  validatedMessages?: UIMessage[];
};
