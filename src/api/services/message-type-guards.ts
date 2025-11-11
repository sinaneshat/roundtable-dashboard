/**
 * Database Message Type Guards
 *
 * **BACKEND SERVICE**: Type guards for database ChatMessage records
 * Following backend-patterns.md: Service layer for business logic, type-safe operations
 *
 * **PURPOSE**:
 * - Provides Zod-validated type guards for database messages (ChatMessage type)
 * - Separates database type guards from frontend type guards (message-filtering.ts)
 * - Enables type-safe filtering in handlers and services
 *
 * **CONSOLIDATION NOTES**:
 * - Replaces inline filtering logic from analysis.handler.ts:315-320, 360-384
 * - Replaces inline filtering logic from streaming.handler.ts:501-504
 * - Replaces inline filtering logic from message-persistence.service.ts:583-590
 *
 * @module api/services/message-type-guards
 */

import type { ChatMessage } from '@/db/validation';
import {
  getParticipantMetadata,
  getPreSearchMetadata,
} from '@/lib/utils/metadata';

// ============================================================================
// Type Guards - Database Messages with Zod Validation
// ============================================================================

/**
 * Type guard: Check if database message is pre-search message
 *
 * Uses Zod schema validation for runtime type safety.
 * Pre-search messages contain web search results and are NOT participant responses.
 *
 * **REPLACES**: Inline `metadata?.isPreSearch === true` checks in handlers
 * **CONSOLIDATES**: Pattern from streaming.handler.ts:501-504, analysis.handler.ts:316-320
 *
 * @param message - ChatMessage from database query
 * @returns true if message is pre-search with validated metadata
 *
 * @example
 * ```typescript
 * const conversationMessages = dbMessages.filter(msg => !isDbPreSearchMessage(msg));
 * // Excludes pre-search from conversation history
 * ```
 */
export function isDbPreSearchMessage(message: ChatMessage): boolean {
  if (!message.metadata)
    return false;

  return getPreSearchMetadata(message.metadata) !== null;
}

/**
 * Type guard: Check if database message is participant message
 *
 * Uses Zod schema validation for runtime type safety.
 * Participant messages are assistant messages with full participant metadata.
 *
 * **CRITICAL**: Must have both participantId column AND valid participant metadata
 * This double-check ensures database integrity and prevents pre-search leakage
 *
 * **REPLACES**: Inline participantId + metadata checks in handlers
 * **CONSOLIDATES**: Pattern from analysis.handler.ts:375-384, message-persistence.service.ts:583-590
 *
 * @param message - ChatMessage from database query
 * @returns true if message is participant response with validated metadata
 *
 * @example
 * ```typescript
 * const participantMessages = roundMessages.filter(isDbParticipantMessage);
 * // Use for analysis - guaranteed to have participantId and valid metadata
 * ```
 */
export function isDbParticipantMessage(message: ChatMessage): boolean {
  // Must have participantId column (database foreign key constraint)
  if (!message.participantId)
    return false;

  // Must have valid participant metadata (Zod validation)
  if (!message.metadata)
    return false;

  return getParticipantMetadata(message.metadata) !== null;
}

// ============================================================================
// Bulk Filtering Operations
// ============================================================================

/**
 * Filter database messages to participant messages only
 *
 * Type-safe filtering with Zod validation.
 * Excludes pre-search messages to ensure only participant responses are included.
 *
 * **REPLACES**: Inline filter logic throughout handlers
 * **CONSOLIDATES**: Pattern from analysis.handler.ts:315-320, 360-384, streaming.handler.ts:501-504
 *
 * **USE CASES**:
 * - Analysis handler: Filter messages for moderator analysis
 * - Message persistence: Count participant messages for round completion
 * - Streaming handler: Build conversation history without pre-search
 *
 * @param messages - Array of ChatMessages from database query
 * @returns Array of participant messages (pre-search excluded)
 *
 * @example
 * ```typescript
 * // In analysis.handler.ts
 * const participantMessages = filterDbToParticipantMessages(roundMessages);
 * // Now guaranteed to only contain participant responses
 * ```
 */
export function filterDbToParticipantMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter(isDbParticipantMessage);
}

/**
 * Filter database messages to pre-search messages only
 *
 * Type-safe filtering with Zod validation.
 * Returns only messages that contain web search results.
 *
 * **REPLACES**: Inline pre-search detection logic
 * **CONSOLIDATES**: Pattern from streaming.handler.ts:864-868
 *
 * **USE CASES**:
 * - Streaming handler: Load pre-search results for system prompt
 * - Search context builder: Extract search results for current/previous rounds
 *
 * @param messages - Array of ChatMessages from database query
 * @returns Array of pre-search messages
 *
 * @example
 * ```typescript
 * // In streaming.handler.ts
 * const preSearchMessages = filterDbToPreSearchMessages(allMessages);
 * // Use for building search context in system prompt
 * ```
 */
export function filterDbToPreSearchMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter(isDbPreSearchMessage);
}

// ============================================================================
// Convenience Filters for Common Patterns
// ============================================================================

/**
 * Filter messages to conversation messages only
 *
 * Excludes pre-search messages to provide clean conversation history.
 * Includes user messages and participant responses only.
 *
 * **REPLACES**: Inline filtering in streaming.handler.ts:501-504
 * **CONSOLIDATES**: Pattern for building LLM conversation context
 *
 * @param messages - Array of ChatMessages from database query
 * @returns Array of conversation messages (user + participant, no pre-search)
 *
 * @example
 * ```typescript
 * // In streaming.handler.ts
 * const conversationMessages = filterDbToConversationMessages(allDbMessages);
 * // Use for LLM history without pre-search system messages
 * ```
 */
export function filterDbToConversationMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter(msg => !isDbPreSearchMessage(msg));
}

/**
 * Count participant messages in a round
 *
 * Counts only participant responses, excluding pre-search messages.
 * Useful for determining round completion status.
 *
 * **USE CASE**: message-persistence.service.ts:593 - Check if all participants responded
 *
 * @param messages - Array of ChatMessages from a specific round
 * @returns Count of participant messages (pre-search excluded)
 *
 * @example
 * ```typescript
 * const participantCount = countDbParticipantMessages(roundMessages);
 * if (participantCount >= expectedParticipants.length) {
 *   // Round is complete - trigger analysis
 * }
 * ```
 */
export function countDbParticipantMessages(messages: ChatMessage[]): number {
  return filterDbToParticipantMessages(messages).length;
}
