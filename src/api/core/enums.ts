/**
 * Centralized Enum Definitions - Single Source of Truth
 *
 * All backend enums consolidated in one location following ZOD-first pattern.
 * Eliminates duplication and ensures type safety across the entire backend.
 *
 * ✅ PATTERN: Define tuple → Create Zod schema → Infer TypeScript type
 * ✅ NO HARDCODED STRINGS: All string literals replaced with type-safe enums
 * ✅ SHARED: Frontend and backend import from single source
 *
 * Reference: /docs/backend-patterns.md:380-459
 */

import { z } from '@hono/zod-openapi';

// ============================================================================
// CHAT MODE ENUMS
// ============================================================================

/**
 * Chat mode tuple - conversation interaction types
 * ✅ SINGLE SOURCE: Replaces /src/lib/config/chat-modes.ts:CHAT_MODES
 * ✅ MATCHES DATABASE: Aligns with chatThread.mode enum
 *
 * Used by:
 * - /src/db/tables/chat.ts - Database enum definition
 * - /src/api/routes/chat/schema.ts - Thread schemas
 * - /src/api/routes/mcp/schema.ts - MCP tool schemas
 * - Frontend chat mode selectors
 */
export const CHAT_MODES = ['analyzing', 'brainstorming', 'debating', 'solving'] as const;

/**
 * Default chat mode constant
 * ✅ SINGLE SOURCE: Default mode for new conversations and fallbacks
 * ✅ TYPE-SAFE: Uses ChatMode enum
 */
export const DEFAULT_CHAT_MODE: ChatMode = 'debating';

/**
 * Chat mode Zod schema
 * ✅ RUNTIME VALIDATION: Validates chat mode values
 */
export const ChatModeSchema = z.enum(CHAT_MODES).openapi({
  description: 'Conversation mode for roundtable discussions',
  example: 'brainstorming',
});

/**
 * Chat mode TypeScript type
 * ✅ ZOD INFERENCE: Type automatically derived from schema
 */
export type ChatMode = z.infer<typeof ChatModeSchema>;

/**
 * Chat mode tuple for database enum definition
 * Used by Drizzle schema to ensure database and TypeScript types match
 */
export const CHAT_MODE_ENUM_VALUES = CHAT_MODES as unknown as [ChatMode, ...ChatMode[]];

// ============================================================================
// THREAD STATUS ENUMS
// ============================================================================

/**
 * Thread status tuple - lifecycle states
 * ✅ SINGLE SOURCE: Replaces /src/lib/config/chat-modes.ts:THREAD_STATUSES
 * ✅ MATCHES DATABASE: Aligns with chatThread.status enum
 *
 * Used by:
 * - /src/db/tables/chat.ts - Database enum definition
 * - /src/api/routes/chat/schema.ts - Thread schemas
 * - Frontend thread status indicators
 */
export const THREAD_STATUSES = ['active', 'archived', 'deleted'] as const;

/**
 * Thread status Zod schema
 * ✅ RUNTIME VALIDATION: Validates thread status values
 */
export const ThreadStatusSchema = z.enum(THREAD_STATUSES).openapi({
  description: 'Thread lifecycle status',
  example: 'active',
});

/**
 * Thread status TypeScript type
 * ✅ ZOD INFERENCE: Type automatically derived from schema
 */
export type ThreadStatus = z.infer<typeof ThreadStatusSchema>;

/**
 * Thread status tuple for database enum definition
 */
export const THREAD_STATUS_ENUM_VALUES = THREAD_STATUSES as unknown as [ThreadStatus, ...ThreadStatus[]];

// ============================================================================
// CHANGELOG ENUMS
// ============================================================================

/**
 * Changelog event types tuple
 * ✅ SINGLE SOURCE: All changelog types defined here
 * ✅ SIMPLIFIED: Consolidated to 3 change types for cleaner handling
 *
 * Types:
 * - added: New item added (participant, feature, etc.)
 * - modified: Existing item changed (mode, role, settings, etc.)
 * - removed: Item deleted or removed
 *
 * Used by:
 * - /src/api/routes/chat/schema.ts - ChangelogTypeSchema
 * - /src/api/routes/chat/handler.ts - Changelog creation
 * - /src/api/services/thread-changelog.service.ts - Changelog operations
 */
export const CHANGELOG_TYPES = [
  'added',
  'modified',
  'removed',
] as const;

/**
 * Changelog type Zod schema
 * ✅ RUNTIME VALIDATION: Validates changelog type values
 * ✅ SIMPLIFIED: 3 types instead of 5
 */
export const ChangelogTypeSchema = z.enum(CHANGELOG_TYPES).openapi({
  description: 'Type of changelog event (added, modified, removed)',
  example: 'added',
});

/**
 * Changelog type TypeScript type
 * ✅ ZOD INFERENCE: Type automatically derived from schema
 */
export type ChangelogType = z.infer<typeof ChangelogTypeSchema>;

/**
 * Changelog type tuple for database enum definition
 */
export const CHANGELOG_TYPES_ENUM_VALUES = CHANGELOG_TYPES as unknown as [ChangelogType, ...ChangelogType[]];

/**
 * Changelog types object for clear constant access
 * ✅ SIMPLIFIED: Consolidated to 3 change types for cleaner handling
 * ✅ RECOMMENDED PATTERN: Use ChangelogTypes.ADDED instead of 'added'
 *
 * @example
 * // ❌ WRONG: Hardcoded string
 * changeType: 'added'
 *
 * // ✅ CORRECT: Type-safe constant
 * changeType: ChangelogTypes.ADDED
 */
export const ChangelogTypes = {
  ADDED: 'added' as const,
  MODIFIED: 'modified' as const,
  REMOVED: 'removed' as const,
} as const satisfies Record<string, ChangelogType>;

// ============================================================================
// MESSAGE STATUS ENUMS
// ============================================================================

/**
 * Message status tuple for UI rendering states
 * ✅ SINGLE SOURCE: All message status values defined here
 *
 * Used by:
 * - /src/api/routes/chat/schema.ts - Message schemas
 * - Frontend components - Message rendering states during streaming
 */
export const MESSAGE_STATUSES = ['thinking', 'streaming', 'completed', 'error'] as const;

/**
 * Message status Zod schema
 * ✅ RUNTIME VALIDATION: Validates message status values
 */
export const MessageStatusSchema = z.enum(MESSAGE_STATUSES).openapi({
  description: 'Message status during streaming lifecycle',
  example: 'streaming',
});

/**
 * Message status TypeScript type
 * ✅ ZOD INFERENCE: Type automatically derived from schema
 */
export type MessageStatus = z.infer<typeof MessageStatusSchema>;

// ============================================================================
// MESSAGE ROLE ENUMS
// ============================================================================

/**
 * Message role tuple for chat messages
 * ✅ SINGLE SOURCE: All message role values defined here
 * ✅ MATCHES DATABASE: Aligns with chatMessage.role enum
 *
 * Used by:
 * - /src/db/tables/chat.ts - Database enum definition
 * - /src/api/routes/chat/schema.ts - Message schemas
 * - Frontend message rendering
 */
export const MESSAGE_ROLES = ['user', 'assistant'] as const;

/**
 * Message role Zod schema
 * ✅ RUNTIME VALIDATION: Validates message role values
 */
export const MessageRoleSchema = z.enum(MESSAGE_ROLES).openapi({
  description: 'Message role (user input or AI response)',
  example: 'assistant',
});

/**
 * Message role TypeScript type
 * ✅ ZOD INFERENCE: Type automatically derived from schema
 */
export type MessageRole = z.infer<typeof MessageRoleSchema>;

/**
 * Message role tuple for database enum definition
 */
export const MESSAGE_ROLES_ENUM_VALUES = MESSAGE_ROLES as unknown as [MessageRole, ...MessageRole[]];

// ============================================================================
// MESSAGE PART TYPE ENUMS
// ============================================================================

/**
 * Message part types tuple for AI SDK message parts
 * ✅ SINGLE SOURCE: All message part types defined here
 *
 * Used by:
 * - /src/api/routes/chat/schema.ts - MessagePartSchema discriminated union
 * - Frontend components - Rendering different message content types
 */
export const MESSAGE_PART_TYPES = ['text', 'reasoning'] as const;

/**
 * Message part type Zod schema
 * ✅ RUNTIME VALIDATION: Validates message part types
 */
export const MessagePartTypeSchema = z.enum(MESSAGE_PART_TYPES).openapi({
  description: 'Types of message content parts (text or reasoning)',
  example: 'text',
});

/**
 * Message part type TypeScript type
 * ✅ ZOD INFERENCE: Type for discriminated union
 */
export type MessagePartType = z.infer<typeof MessagePartTypeSchema>;

// ============================================================================
// MODERATOR ANALYSIS STATUS ENUMS
// ============================================================================

/**
 * Moderator analysis status tuple
 * ✅ SINGLE SOURCE: All analysis status values defined here
 * ✅ MATCHES DATABASE: Aligns with chatModeratorAnalysis.status enum
 *
 * Used by:
 * - /src/api/services/moderator-analysis.service.ts - Analysis status tracking
 * - /src/api/services/analysis-background.service.ts - Background job status
 * - /src/db/tables/chat.ts - Database enum definition
 * - Frontend components - Analysis UI state rendering
 */
export const ANALYSIS_STATUSES = ['pending', 'streaming', 'completed', 'failed'] as const;

/**
 * Analysis status Zod schema
 * ✅ RUNTIME VALIDATION: Validates analysis status values
 */
export const AnalysisStatusSchema = z.enum(ANALYSIS_STATUSES).openapi({
  description: 'Moderator analysis processing status',
  example: 'completed',
});

/**
 * Analysis status TypeScript type
 * ✅ ZOD INFERENCE: Type automatically derived from schema
 */
export type AnalysisStatus = z.infer<typeof AnalysisStatusSchema>;

/**
 * Analysis status tuple for database enum definition
 */
export const ANALYSIS_STATUSES_ENUM_VALUES = ANALYSIS_STATUSES as unknown as [AnalysisStatus, ...AnalysisStatus[]];

/**
 * Analysis status constants for clear usage
 * ✅ RECOMMENDED PATTERN: Use AnalysisStatuses.STREAMING instead of 'streaming'
 *
 * @example
 * // ❌ WRONG: Hardcoded string
 * status: 'streaming'
 *
 * // ✅ CORRECT: Type-safe constant
 * status: AnalysisStatuses.STREAMING
 */
export const AnalysisStatuses = {
  PENDING: 'pending' as const,
  STREAMING: 'streaming' as const,
  COMPLETED: 'completed' as const,
  FAILED: 'failed' as const,
} as const satisfies Record<string, AnalysisStatus>;

// ============================================================================
// HTTP METHOD ENUMS (For logging and middleware)
// ============================================================================

/**
 * HTTP methods tuple
 * ✅ SINGLE SOURCE: All HTTP methods supported by the API
 */
export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'] as const;

/**
 * HTTP method Zod schema
 */
export const HttpMethodSchema = z.enum(HTTP_METHODS);

/**
 * HTTP method TypeScript type
 */
export type HttpMethod = z.infer<typeof HttpMethodSchema>;

// ============================================================================
// DATABASE OPERATION ENUMS (For logging and error context)
// ============================================================================

/**
 * Database operation types tuple
 * ✅ SINGLE SOURCE: All database operation types
 *
 * Used by:
 * - /src/api/core/schemas.ts - ErrorContextSchema
 * - /src/api/core/responses.ts - databaseError() helper
 * - Logging and monitoring
 */
export const DATABASE_OPERATIONS = ['select', 'insert', 'update', 'delete', 'batch'] as const;

/**
 * Database operation Zod schema
 */
export const DatabaseOperationSchema = z.enum(DATABASE_OPERATIONS);

/**
 * Database operation TypeScript type
 */
export type DatabaseOperation = z.infer<typeof DatabaseOperationSchema>;

// ============================================================================
// AUTHENTICATION FAILURE REASON ENUMS
// ============================================================================

/**
 * Authentication failure reasons tuple
 * ✅ SINGLE SOURCE: All authentication failure reasons
 *
 * Used by:
 * - /src/api/core/schemas.ts - ErrorContextSchema
 * - /src/api/core/responses.ts - authenticationError() helper
 * - Authentication middleware
 */
export const AUTH_FAILURE_REASONS = [
  'invalid_credentials',
  'account_locked',
  'token_expired',
  'missing_token',
  'session_required',
  'session_expired',
] as const;

/**
 * Authentication failure reason Zod schema
 */
export const AuthFailureReasonSchema = z.enum(AUTH_FAILURE_REASONS);

/**
 * Authentication failure reason TypeScript type
 */
export type AuthFailureReason = z.infer<typeof AuthFailureReasonSchema>;

// ============================================================================
// RESOURCE UNAVAILABILITY REASON ENUMS
// ============================================================================

/**
 * Resource unavailability reasons tuple
 * ✅ SINGLE SOURCE: All resource unavailability reasons
 *
 * Used by:
 * - /src/api/core/schemas.ts - ErrorContextSchema
 * - Error handling for resource access
 */
export const RESOURCE_UNAVAILABLE_REASONS = ['deleted', 'archived', 'private', 'expired'] as const;

/**
 * Resource unavailability reason Zod schema
 */
export const ResourceUnavailableReasonSchema = z.enum(RESOURCE_UNAVAILABLE_REASONS);

/**
 * Resource unavailability reason TypeScript type
 */
export type ResourceUnavailableReason = z.infer<typeof ResourceUnavailableReasonSchema>;

// ============================================================================
// HEALTH STATUS ENUMS
// ============================================================================

/**
 * Health check status tuple
 * ✅ SINGLE SOURCE: All health check status values
 *
 * Used by:
 * - /src/api/core/responses.ts - health() and detailedHealth() helpers
 * - /src/api/routes/system/handler.ts - Health check endpoints
 */
export const HEALTH_STATUSES = ['healthy', 'degraded', 'unhealthy'] as const;

/**
 * Health status Zod schema
 */
export const HealthStatusSchema = z.enum(HEALTH_STATUSES);

/**
 * Health status TypeScript type
 */
export type HealthStatus = z.infer<typeof HealthStatusSchema>;

// ============================================================================
// SORT ORDER ENUMS
// ============================================================================

/**
 * Sort order tuple
 * ✅ SINGLE SOURCE: All sort order values
 *
 * Used by:
 * - /src/api/core/schemas.ts - CoreSchemas.sortOrder()
 * - List endpoints with sorting
 */
export const SORT_ORDERS = ['asc', 'desc'] as const;

/**
 * Sort order Zod schema
 */
export const SortOrderSchema = z.enum(SORT_ORDERS).default('desc');

/**
 * Sort order TypeScript type
 */
export type SortOrder = z.infer<typeof SortOrderSchema>;

// ============================================================================
// STREAMING EVENT TYPE ENUMS
// ============================================================================

/**
 * SSE streaming event types tuple
 * ✅ SINGLE SOURCE: All Server-Sent Event types
 *
 * Used by:
 * - /src/api/core/schemas.ts - StreamingEventSchema discriminated union
 * - /src/api/common/streaming.ts - SSE event creation
 * - Frontend streaming hooks
 */
export const STREAMING_EVENT_TYPES = ['start', 'chunk', 'complete', 'error'] as const;

/**
 * Streaming event type TypeScript type
 */
export type StreamingEventType = (typeof STREAMING_EVENT_TYPES)[number];

// ============================================================================
// FEEDBACK TYPE ENUMS
// ============================================================================

/**
 * Round feedback type tuple
 * ✅ SINGLE SOURCE: All feedback type values defined here
 * ✅ MATCHES DATABASE: Aligns with chatRoundFeedback.feedbackType enum
 *
 * Used by:
 * - /src/db/tables/chat.ts - Database enum definition
 * - /src/api/routes/chat/schema.ts - Feedback schemas
 * - Frontend feedback buttons (like/dislike)
 */
export const FEEDBACK_TYPES = ['like', 'dislike'] as const;

/**
 * Feedback type Zod schema
 * ✅ RUNTIME VALIDATION: Validates feedback type values
 */
export const FeedbackTypeSchema = z.enum(FEEDBACK_TYPES).openapi({
  description: 'User feedback type for a conversation round',
  example: 'like',
});

/**
 * Feedback type TypeScript type
 * ✅ ZOD INFERENCE: Type automatically derived from schema
 */
export type FeedbackType = z.infer<typeof FeedbackTypeSchema>;

/**
 * Feedback type tuple for database enum definition
 */
export const FEEDBACK_TYPES_ENUM_VALUES = FEEDBACK_TYPES as unknown as [FeedbackType, ...FeedbackType[]];

// ============================================================================
// MODEL CATEGORY ENUMS
// ============================================================================

/**
 * Model category tuple for AI model classification
 * ✅ SINGLE SOURCE: All model category values defined here
 *
 * Used by:
 * - /src/api/routes/models/schema.ts - Model categorization
 * - /src/api/services/openrouter-models.service.ts - Model enhancement
 * - Frontend model filtering and display
 */
export const MODEL_CATEGORIES = ['reasoning', 'general', 'creative', 'research'] as const;

/**
 * Model category Zod schema
 * ✅ RUNTIME VALIDATION: Validates model category values
 */
export const ModelCategorySchema = z.enum(MODEL_CATEGORIES).openapi({
  description: 'AI model category classification for filtering',
  example: 'reasoning',
});

/**
 * Model category TypeScript type
 * ✅ ZOD INFERENCE: Type automatically derived from schema
 */
export type ModelCategory = z.infer<typeof ModelCategorySchema>;

// ============================================================================
// USAGE STATUS ENUMS
// ============================================================================

/**
 * Usage status tuple for visual indicators
 * ✅ SINGLE SOURCE: All usage status values defined here
 *
 * Used by:
 * - /src/api/routes/usage/schema.ts - Usage status schema
 * - Frontend usage metric displays
 * - UI status indicators (default, warning, critical)
 */
export const USAGE_STATUSES = ['default', 'warning', 'critical'] as const;

/**
 * Usage status Zod schema
 * ✅ RUNTIME VALIDATION: Validates usage status values
 */
export const UsageStatusSchema = z.enum(USAGE_STATUSES).openapi({
  description: 'Visual status indicator for usage metrics',
  example: 'default',
});

/**
 * Usage status TypeScript type
 * ✅ ZOD INFERENCE: Type automatically derived from schema
 */
export type UsageStatus = z.infer<typeof UsageStatusSchema>;

// ============================================================================
// NOTE: All exports are done inline above where each enum is defined
// This ensures better tree-shaking and clearer code organization
// ============================================================================
