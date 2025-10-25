/**
 * AI SDK v5 Utility Layer - Barrel Export
 *
 * Centralized exports for all AI SDK v5 utilities.
 * Provides clean, organized imports throughout the application.
 *
 * Usage Pattern:
 * ```typescript
 * // Import specific utilities
 * import { convertUIToModelMessages, createStreamingChatResponse } from '@/lib/ai';
 *
 * // Or import all
 * import * as aiUtils from '@/lib/ai';
 * ```
 *
 * @module lib/ai
 * @see https://sdk.vercel.ai/docs - AI SDK v5 documentation
 */

// ============================================================================
// Type Exports
// ============================================================================

export {
  // ID generation
  createDataPartIdGenerator,
  createMultipleDataParts,
  createScopedIdGenerator,
  // Data part creation
  createStreamingDataPart,
  filterDataPartsByType,
  // Type helpers
  isDataPartType,
  // Validation
  isValidDataPart,
  validateDataParts,
} from './data-parts';
export {
  // Message format conversion
  convertUIToModelMessages,
  // Error message creation
  createErrorUIMessage,
  extractTextFromMessage,
  // Text extraction
  extractTextFromParts,
  // Message filtering
  filterNonEmptyMessages,
  mergeParticipantMetadata,
  validateMessages,
} from './message-utils';

// ============================================================================
// Message Utilities
// ============================================================================

export type {
  DatabaseMessage,
  MessagePersistenceOptions,
} from './persistence-utils';

// ============================================================================
// Streaming Utilities
// ============================================================================

export {
  convertUIMessagesToDatabase,
  // Message conversion
  convertUIMessageToDatabase,
  createAssistantMessage,
  // Message creation
  createUserMessage,
  deduplicateMessagesForPersistence,
  // Filtering
  filterMessagesForPersistence,
  // Batch operations
  prepareBatchInsert,
  prepareBatchInsertStatements,
} from './persistence-utils';

// ============================================================================
// Data Parts Utilities
// ============================================================================

export type {
  PromptBuildOptions,
  PromptTemplate,
} from './prompts';

// ============================================================================
// Persistence Utilities
// ============================================================================

export {
  buildConversationalPrompt,
  buildPromptFromTemplate,
  // System prompt builders
  buildSystemPrompt,
  // Pre-built templates
  CommonPromptTemplates,
  // Template interpolation
  interpolatePrompt,
  // Validation
  validatePrompt,
} from './prompts';
export {
  // Configuration builders
  buildStreamConfig,
  // Stream creation with config
  createStreamingChatResponse,
  createStreamWithRetry,
  createTextStreamResponse,
  // Stream response creation
  createUIStreamResponse,
  // Stream manipulation
  mergeStreams,
} from './streaming-utils';

// ============================================================================
// Prompt Utilities
// ============================================================================

export type {
  AIErrorType,
  CoreAssistantMessage,
  CoreMessage,
  CoreSystemMessage,
  CoreUserMessage,
  LanguageModel,
  MessageValidationResult,
  StreamCallbacks,
  StreamConfig,
  StreamObjectResult,
  StreamTextResult,
  TextStreamPart,
  Tool,
  ToolCallPart,
  ToolResultPart,
  TypeValidationError,
  // Core AI SDK types
  UIMessage,
  // Product-specific extensions
  UIMessageMetadata,
  UIMessagePart,
  UIMessageWithMetadata,
} from './types';

// ============================================================================
// Re-export Core AI SDK Functions
// ============================================================================

/**
 * Re-export commonly used AI SDK functions for convenience
 * @see https://sdk.vercel.ai/docs/reference/ai-sdk-core
 *
 * Note: React hooks (useChat, useAssistant, etc.) are not re-exported here.
 * Import them directly from 'ai' in React components.
 */
export {
  convertToModelMessages,
  generateId,
  generateObject,
  generateText,
  streamObject,
  streamText,
  tool,
  validateUIMessages,
} from 'ai';
