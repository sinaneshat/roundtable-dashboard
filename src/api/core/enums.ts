/**
 * Centralized Enum Definitions
 * Reference: /docs/backend-patterns.md:380-459
 */

import { z } from '@hono/zod-openapi';

// ============================================================================
// GENERIC OPERATION STATUS
// ============================================================================

export const OPERATION_STATUSES = ['idle', 'pending', 'active', 'streaming', 'complete', 'failed'] as const;

export const OperationStatusSchema = z.enum(OPERATION_STATUSES).openapi({
  description: 'Generic async operation lifecycle status',
  example: 'streaming',
});

export type OperationStatus = z.infer<typeof OperationStatusSchema>;

export const OperationStatuses = {
  IDLE: 'idle' as const,
  PENDING: 'pending' as const,
  ACTIVE: 'active' as const,
  STREAMING: 'streaming' as const,
  COMPLETE: 'complete' as const,
  FAILED: 'failed' as const,
} as const;

// ============================================================================
// CHAT MODE
// ============================================================================

export const CHAT_MODES = ['analyzing', 'brainstorming', 'debating', 'solving'] as const;

export const DEFAULT_CHAT_MODE: ChatMode = 'debating';

export const ChatModeSchema = z.enum(CHAT_MODES).openapi({
  description: 'Conversation mode for roundtable discussions',
  example: 'brainstorming',
});

export type ChatMode = z.infer<typeof ChatModeSchema>;

export const ChatModes = {
  ANALYZING: 'analyzing' as const,
  BRAINSTORMING: 'brainstorming' as const,
  DEBATING: 'debating' as const,
  SOLVING: 'solving' as const,
} as const;

// ============================================================================
// THREAD STATUS
// ============================================================================

export const THREAD_STATUSES = ['active', 'archived', 'deleted'] as const;

export const ThreadStatusSchema = z.enum(THREAD_STATUSES).openapi({
  description: 'Thread lifecycle status',
  example: 'active',
});

export type ThreadStatus = z.infer<typeof ThreadStatusSchema>;

export const ThreadStatuses = {
  ACTIVE: 'active' as const,
  ARCHIVED: 'archived' as const,
  DELETED: 'deleted' as const,
} as const;

// ============================================================================
// CHANGELOG
// ============================================================================

export const CHANGELOG_TYPES = ['added', 'modified', 'removed'] as const;

export const ChangelogTypeSchema = z.enum(CHANGELOG_TYPES).openapi({
  description: 'Type of changelog event',
  example: 'added',
});

export type ChangelogType = z.infer<typeof ChangelogTypeSchema>;

export const ChangelogTypes = {
  ADDED: 'added' as const,
  MODIFIED: 'modified' as const,
  REMOVED: 'removed' as const,
} as const;

// ============================================================================
// MESSAGE STATUS
// ============================================================================

export const MESSAGE_STATUSES = ['pending', 'streaming', 'complete', 'failed'] as const;

export const MessageStatusSchema = z.enum(MESSAGE_STATUSES).openapi({
  description: 'Message status during streaming lifecycle',
  example: 'streaming',
});

export type MessageStatus = z.infer<typeof MessageStatusSchema>;

export const MessageStatuses = {
  PENDING: 'pending' as const,
  STREAMING: 'streaming' as const,
  COMPLETE: 'complete' as const,
  FAILED: 'failed' as const,
} as const;

// ============================================================================
// PRE-SEARCH STATUS
// ============================================================================

export const PRE_SEARCH_STATUSES = ['idle', 'streaming', 'active', 'complete', 'failed'] as const;

export const PreSearchStatusSchema = z.enum(PRE_SEARCH_STATUSES).openapi({
  description: 'Pre-search operation status',
  example: 'active',
});

export type PreSearchStatus = z.infer<typeof PreSearchStatusSchema>;

export const PreSearchStatuses = {
  IDLE: 'idle' as const,
  STREAMING: 'streaming' as const,
  ACTIVE: 'active' as const,
  COMPLETE: 'complete' as const,
  FAILED: 'failed' as const,
} as const;

export const PRE_SEARCH_QUERY_STATUSES = ['active', 'complete'] as const;

export const PreSearchQueryStatusSchema = z.enum(PRE_SEARCH_QUERY_STATUSES).openapi({
  description: 'Individual pre-search query status',
  example: 'active',
});

export type PreSearchQueryStatus = z.infer<typeof PreSearchQueryStatusSchema>;

export const PreSearchQueryStatuses = {
  ACTIVE: 'active' as const,
  COMPLETE: 'complete' as const,
} as const;

// ============================================================================
// MESSAGE ROLE (Database - includes 'tool' for tool invocations)
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Database message roles (includes tool)
export const MESSAGE_ROLES = ['user', 'assistant', 'tool'] as const;

// 3️⃣ ZOD SCHEMA - Runtime validation for database
export const MessageRoleSchema = z.enum(MESSAGE_ROLES).openapi({
  description: 'Message role (user input, AI response, or tool result)',
  example: 'assistant',
});

// 4️⃣ TYPESCRIPT TYPE - Database message role
export type MessageRole = z.infer<typeof MessageRoleSchema>;

// 5️⃣ CONSTANT OBJECT - For database operations
export const MessageRoles = {
  USER: 'user' as const,
  ASSISTANT: 'assistant' as const,
  TOOL: 'tool' as const,
} as const;

// ============================================================================
// UI MESSAGE ROLE (AI SDK v5 - only 'user', 'assistant', 'system')
// ============================================================================

// 1️⃣ ARRAY CONSTANT - AI SDK UIMessage roles (no 'tool', has 'system')
export const UI_MESSAGE_ROLES = ['user', 'assistant', 'system'] as const;

// 3️⃣ ZOD SCHEMA - Runtime validation for AI SDK UIMessage
export const UIMessageRoleSchema = z.enum(UI_MESSAGE_ROLES).openapi({
  description: 'AI SDK UIMessage role (user, assistant, or system)',
  example: 'assistant',
});

// 4️⃣ TYPESCRIPT TYPE - UI message role (AI SDK compatible)
export type UIMessageRole = z.infer<typeof UIMessageRoleSchema>;

// 5️⃣ CONSTANT OBJECT - For UI message operations
export const UIMessageRoles = {
  USER: 'user' as const,
  ASSISTANT: 'assistant' as const,
  SYSTEM: 'system' as const,
} as const;

// ============================================================================
// MESSAGE PART TYPE
// ============================================================================

export const MESSAGE_PART_TYPES = ['text', 'reasoning', 'tool-call', 'tool-result'] as const;

export const MessagePartTypeSchema = z.enum(MESSAGE_PART_TYPES).openapi({
  description: 'Types of message content parts',
  example: 'text',
});

export type MessagePartType = z.infer<typeof MessagePartTypeSchema>;

export const MessagePartTypes = {
  TEXT: 'text' as const,
  REASONING: 'reasoning' as const,
  TOOL_CALL: 'tool-call' as const,
  TOOL_RESULT: 'tool-result' as const,
} as const;

// ============================================================================
// MODERATOR ANALYSIS STATUS
// ============================================================================

export const ANALYSIS_STATUSES = ['pending', 'streaming', 'complete', 'failed'] as const;

export const AnalysisStatusSchema = z.enum(ANALYSIS_STATUSES).openapi({
  description: 'Moderator analysis processing status',
  example: 'complete',
});

export type AnalysisStatus = z.infer<typeof AnalysisStatusSchema>;

export const AnalysisStatuses = {
  PENDING: 'pending' as const,
  STREAMING: 'streaming' as const,
  COMPLETE: 'complete' as const,
  FAILED: 'failed' as const,
} as const;

// ============================================================================
// AUTHENTICATION FAILURE REASON
// ============================================================================

export const AUTH_FAILURE_REASONS = [
  'invalid_credentials',
  'account_locked',
  'token_expired',
  'missing_token',
  'session_required',
  'session_expired',
] as const;

export const AuthFailureReasonSchema = z.enum(AUTH_FAILURE_REASONS);

export type AuthFailureReason = z.infer<typeof AuthFailureReasonSchema>;

// ============================================================================
// RESOURCE UNAVAILABILITY REASON
// ============================================================================

export const RESOURCE_UNAVAILABLE_REASONS = ['deleted', 'archived', 'private', 'expired'] as const;

export const ResourceUnavailableReasonSchema = z.enum(RESOURCE_UNAVAILABLE_REASONS);

export type ResourceUnavailableReason = z.infer<typeof ResourceUnavailableReasonSchema>;

// ============================================================================
// HEALTH STATUS
// ============================================================================

export const HEALTH_STATUSES = ['healthy', 'degraded', 'unhealthy'] as const;

export const HealthStatusSchema = z.enum(HEALTH_STATUSES);

export type HealthStatus = z.infer<typeof HealthStatusSchema>;

export const HealthStatuses = {
  HEALTHY: 'healthy' as const,
  DEGRADED: 'degraded' as const,
  UNHEALTHY: 'unhealthy' as const,
} as const;

// ============================================================================
// STREAMING EVENT TYPE
// ============================================================================

export const STREAMING_EVENT_TYPES = ['start', 'chunk', 'complete', 'failed'] as const;

export type StreamingEventType = (typeof STREAMING_EVENT_TYPES)[number];

// ============================================================================
// FEEDBACK TYPE
// ============================================================================

export const FEEDBACK_TYPES = ['like', 'dislike'] as const;

export const FeedbackTypeSchema = z.enum(FEEDBACK_TYPES).openapi({
  description: 'User feedback type for a conversation round',
  example: 'like',
});

export type FeedbackType = z.infer<typeof FeedbackTypeSchema>;

export const FeedbackTypes = {
  LIKE: 'like' as const,
  DISLIKE: 'dislike' as const,
} as const;

// ============================================================================
// SUBSCRIPTION CHANGE TYPE
// ============================================================================

export const SUBSCRIPTION_CHANGE_TYPES = ['upgrade', 'downgrade', 'change'] as const;

export const SubscriptionChangeTypeSchema = z.enum(SUBSCRIPTION_CHANGE_TYPES).openapi({
  description: 'Type of subscription change',
  example: 'upgrade',
});

export type SubscriptionChangeType = z.infer<typeof SubscriptionChangeTypeSchema>;

export const SubscriptionChangeTypes = {
  UPGRADE: 'upgrade' as const,
  DOWNGRADE: 'downgrade' as const,
  CHANGE: 'change' as const,
} as const;

// ============================================================================
// STRIPE SUBSCRIPTION STATUS
// ============================================================================

export const STRIPE_SUBSCRIPTION_STATUSES = [
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'paused',
] as const;

export const StripeSubscriptionStatusSchema = z.enum(STRIPE_SUBSCRIPTION_STATUSES).openapi({
  description: 'Stripe subscription status matching Stripe API values',
  example: 'active',
});

export type StripeSubscriptionStatus = z.infer<typeof StripeSubscriptionStatusSchema>;

export const StripeSubscriptionStatuses = {
  ACTIVE: 'active' as const,
  TRIALING: 'trialing' as const,
  PAST_DUE: 'past_due' as const,
  UNPAID: 'unpaid' as const,
  CANCELED: 'canceled' as const,
  INCOMPLETE: 'incomplete' as const,
  INCOMPLETE_EXPIRED: 'incomplete_expired' as const,
  PAUSED: 'paused' as const,
} as const;

// ============================================================================
// MODEL CATEGORY
// ============================================================================

export const MODEL_CATEGORIES = ['reasoning', 'general', 'creative', 'research'] as const;

export const ModelCategorySchema = z.enum(MODEL_CATEGORIES).openapi({
  description: 'AI model category classification',
  example: 'reasoning',
});

export type ModelCategory = z.infer<typeof ModelCategorySchema>;

// ============================================================================
// USAGE STATUS
// ============================================================================

export const USAGE_STATUSES = ['default', 'warning', 'critical'] as const;

export const UsageStatusSchema = z.enum(USAGE_STATUSES).openapi({
  description: 'Visual status indicator for usage metrics',
  example: 'default',
});

export type UsageStatus = z.infer<typeof UsageStatusSchema>;

// ============================================================================
// WEB SEARCH COMPLEXITY
// ============================================================================

export const WEB_SEARCH_COMPLEXITIES = ['basic', 'moderate', 'deep'] as const;

export const WebSearchComplexitySchema = z.enum(WEB_SEARCH_COMPLEXITIES).openapi({
  description: 'Web search complexity level',
  example: 'moderate',
});

export type WebSearchComplexity = z.infer<typeof WebSearchComplexitySchema>;

export const WebSearchComplexities = {
  BASIC: 'basic' as const,
  MODERATE: 'moderate' as const,
  DEEP: 'deep' as const,
} as const;

// ============================================================================
// WEB SEARCH DEPTH
// ============================================================================

export const WEB_SEARCH_DEPTHS = ['basic', 'advanced'] as const;

export const WebSearchDepthSchema = z.enum(WEB_SEARCH_DEPTHS).openapi({
  description: 'Web search thoroughness level',
  example: 'basic',
});

export type WebSearchDepth = z.infer<typeof WebSearchDepthSchema>;

export const WebSearchDepths = {
  BASIC: 'basic' as const,
  ADVANCED: 'advanced' as const,
} as const;

// ============================================================================
// WEB SEARCH CONSTANTS
// ============================================================================

export const UNKNOWN_DOMAIN = 'unknown' as const;

// ============================================================================
// WEB SEARCH CONTENT TYPE
// ============================================================================

export const WEB_SEARCH_CONTENT_TYPES = ['article', 'comparison', 'guide', 'data', 'news', 'blog', 'research', 'general'] as const;

export const DEFAULT_WEB_SEARCH_CONTENT_TYPE: WebSearchContentType = 'general';

export const WebSearchContentTypeSchema = z.enum(WEB_SEARCH_CONTENT_TYPES).openapi({
  description: 'Content type classification for search results',
  example: 'article',
});

export type WebSearchContentType = z.infer<typeof WebSearchContentTypeSchema>;

export const WebSearchContentTypes = {
  ARTICLE: 'article' as const,
  COMPARISON: 'comparison' as const,
  GUIDE: 'guide' as const,
  DATA: 'data' as const,
  NEWS: 'news' as const,
  BLOG: 'blog' as const,
  RESEARCH: 'research' as const,
  GENERAL: 'general' as const,
} as const;

// ============================================================================
// WEB SEARCH TOPIC
// ============================================================================

export const WEB_SEARCH_TOPICS = ['general', 'news', 'finance', 'health', 'scientific', 'travel'] as const;

export const WebSearchTopicSchema = z.enum(WEB_SEARCH_TOPICS).openapi({
  description: 'Search topic category for specialized search optimization',
  example: 'general',
});

export type WebSearchTopic = z.infer<typeof WebSearchTopicSchema>;

export const WebSearchTopics = {
  GENERAL: 'general' as const,
  NEWS: 'news' as const,
  FINANCE: 'finance' as const,
  HEALTH: 'health' as const,
  SCIENTIFIC: 'scientific' as const,
  TRAVEL: 'travel' as const,
} as const;

// ============================================================================
// WEB SEARCH TIME RANGE
// ============================================================================

export const WEB_SEARCH_TIME_RANGES = ['day', 'week', 'month', 'year', 'd', 'w', 'm', 'y'] as const;

export const WebSearchTimeRangeSchema = z.enum(WEB_SEARCH_TIME_RANGES).openapi({
  description: 'Time range filter for search results',
  example: 'week',
});

export type WebSearchTimeRange = z.infer<typeof WebSearchTimeRangeSchema>;

export const WebSearchTimeRanges = {
  DAY: 'day' as const,
  WEEK: 'week' as const,
  MONTH: 'month' as const,
  YEAR: 'year' as const,
  D: 'd' as const,
  W: 'w' as const,
  M: 'm' as const,
  Y: 'y' as const,
} as const;

// ============================================================================
// WEB SEARCH RAW CONTENT FORMAT
// ============================================================================

export const WEB_SEARCH_RAW_CONTENT_FORMATS = ['markdown', 'text'] as const;

export const WebSearchRawContentFormatSchema = z.enum(WEB_SEARCH_RAW_CONTENT_FORMATS).openapi({
  description: 'Format for raw content extraction',
  example: 'markdown',
});

export type WebSearchRawContentFormat = z.infer<typeof WebSearchRawContentFormatSchema>;

export const WebSearchRawContentFormats = {
  MARKDOWN: 'markdown' as const,
  TEXT: 'text' as const,
} as const;

// ============================================================================
// WEB SEARCH ANSWER MODE
// ============================================================================

export const WEB_SEARCH_ANSWER_MODES = ['none', 'basic', 'advanced'] as const;

export const WebSearchAnswerModeSchema = z.enum(WEB_SEARCH_ANSWER_MODES).openapi({
  description: 'LLM-generated answer summary mode',
  example: 'basic',
});

export type WebSearchAnswerMode = z.infer<typeof WebSearchAnswerModeSchema>;

export const WebSearchAnswerModes = {
  NONE: 'none' as const,
  BASIC: 'basic' as const,
  ADVANCED: 'advanced' as const,
} as const;

// ============================================================================
// CHAIN OF THOUGHT STEP STATUS
// ============================================================================

export const CHAIN_OF_THOUGHT_STEP_STATUSES = ['pending', 'active', 'complete'] as const;

export const ChainOfThoughtStepStatusSchema = z.enum(CHAIN_OF_THOUGHT_STEP_STATUSES).openapi({
  description: 'Chain of thought reasoning step status',
  example: 'active',
});

export type ChainOfThoughtStepStatus = z.infer<typeof ChainOfThoughtStepStatusSchema>;

export const ChainOfThoughtStepStatuses = {
  PENDING: 'pending' as const,
  ACTIVE: 'active' as const,
  COMPLETE: 'complete' as const,
} as const;

// ============================================================================
// AI SDK STATUS
// ============================================================================

export const AI_SDK_STATUSES = ['ready', 'streaming', 'awaiting_message'] as const;

export const AiSdkStatusSchema = z.enum(AI_SDK_STATUSES);

export type AiSdkStatus = z.infer<typeof AiSdkStatusSchema>;

export const AiSdkStatuses = {
  READY: 'ready' as const,
  STREAMING: 'streaming' as const,
  AWAITING_MESSAGE: 'awaiting_message' as const,
} as const;

// ============================================================================
// FINISH REASON (AI SDK Response Completion Status)
// ============================================================================

export const FINISH_REASONS = [
  'stop',
  'length',
  'tool-calls',
  'content-filter',
  'failed',
  'other',
  'unknown',
] as const;

export const FinishReasonSchema = z.enum(FINISH_REASONS).openapi({
  description: 'AI SDK finish reason indicating how/why completion ended',
  example: 'stop',
});

export type FinishReason = z.infer<typeof FinishReasonSchema>;

export const FinishReasons = {
  STOP: 'stop' as const,
  LENGTH: 'length' as const,
  TOOL_CALLS: 'tool-calls' as const,
  CONTENT_FILTER: 'content-filter' as const,
  FAILED: 'failed' as const,
  OTHER: 'other' as const,
  UNKNOWN: 'unknown' as const,
} as const;

// ============================================================================
// ERROR TYPE (AI Operation Error Classification)
// ============================================================================

export const ERROR_TYPES = [
  'rate_limit',
  'context_length',
  'api_error',
  'network',
  'timeout',
  'model_unavailable',
  'empty_response',
  'unknown',
] as const;

export const ErrorTypeSchema = z.enum(ERROR_TYPES).openapi({
  description: 'Type of error that occurred during AI operations',
  example: 'api_error',
});

export type ErrorType = z.infer<typeof ErrorTypeSchema>;

export const ErrorTypes = {
  RATE_LIMIT: 'rate_limit' as const,
  CONTEXT_LENGTH: 'context_length' as const,
  API_ERROR: 'api_error' as const,
  NETWORK: 'network' as const,
  TIMEOUT: 'timeout' as const,
  MODEL_UNAVAILABLE: 'model_unavailable' as const,
  EMPTY_RESPONSE: 'empty_response' as const,
  UNKNOWN: 'unknown' as const,
} as const;

// ============================================================================
// STREAM ERROR TYPES (AI SDK v5 Error Handling)
// ============================================================================

export const STREAM_ERROR_TYPES = [
  'abort',
  'validation',
  'conflict',
  'network',
  'unknown',
] as const;

export const StreamErrorTypeSchema = z.enum(STREAM_ERROR_TYPES).openapi({
  description: 'Type of error that occurred during AI streaming',
  example: 'validation',
});

export type StreamErrorType = z.infer<typeof StreamErrorTypeSchema>;

export const StreamErrorTypes = {
  ABORT: 'abort' as const,
  VALIDATION: 'validation' as const,
  CONFLICT: 'conflict' as const,
  NETWORK: 'network' as const,
  UNKNOWN: 'unknown' as const,
} as const;

// ============================================================================
// BILLING INTERVAL
// ============================================================================

export const BILLING_INTERVALS = ['month', 'year', 'week', 'day'] as const;

export const BillingIntervalSchema = z.enum(BILLING_INTERVALS).openapi({
  description: 'Subscription billing cycle interval',
  example: 'month',
});

export type BillingInterval = z.infer<typeof BillingIntervalSchema>;

export const BillingIntervals = {
  MONTH: 'month' as const,
  YEAR: 'year' as const,
  WEEK: 'week' as const,
  DAY: 'day' as const,
} as const;

// ============================================================================
// SCREEN MODE
// ============================================================================

export const SCREEN_MODES = ['overview', 'thread', 'public'] as const;

export const ScreenModeSchema = z.enum(SCREEN_MODES).openapi({
  description: 'Chat interface screen mode',
  example: 'thread',
});

export type ScreenMode = z.infer<typeof ScreenModeSchema>;

export const ScreenModes = {
  OVERVIEW: 'overview' as const,
  THREAD: 'thread' as const,
  PUBLIC: 'public' as const,
} as const;

// ============================================================================
// HTTP METHOD
// ============================================================================

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] as const;

export const HttpMethodSchema = z.enum(HTTP_METHODS).openapi({
  description: 'HTTP request method',
  example: 'POST',
});

export type HttpMethod = z.infer<typeof HttpMethodSchema>;

export const HttpMethods = {
  GET: 'GET' as const,
  POST: 'POST' as const,
  PUT: 'PUT' as const,
  DELETE: 'DELETE' as const,
  PATCH: 'PATCH' as const,
  HEAD: 'HEAD' as const,
  OPTIONS: 'OPTIONS' as const,
} as const;

// ============================================================================
// PRE-SEARCH SSE EVENT NAMES
// ============================================================================

export const PRE_SEARCH_SSE_EVENTS = ['start', 'query', 'result', 'answer_chunk', 'answer_complete', 'answer_error', 'complete', 'done', 'failed'] as const;

export const PreSearchSseEventSchema = z.enum(PRE_SEARCH_SSE_EVENTS).openapi({
  description: 'Server-Sent Events (SSE) event names for pre-search streaming',
  example: 'query',
});

export type PreSearchSseEvent = z.infer<typeof PreSearchSseEventSchema>;

export const PreSearchSseEvents = {
  START: 'start' as const,
  QUERY: 'query' as const,
  RESULT: 'result' as const,
  ANSWER_CHUNK: 'answer_chunk' as const,
  ANSWER_COMPLETE: 'answer_complete' as const,
  ANSWER_ERROR: 'answer_error' as const,
  COMPLETE: 'complete' as const,
  DONE: 'done' as const,
  FAILED: 'failed' as const,
} as const;

// ============================================================================
// DATABASE OPERATION
// ============================================================================

export const DATABASE_OPERATIONS = ['select', 'insert', 'update', 'delete', 'batch'] as const;

export const DatabaseOperationSchema = z.enum(DATABASE_OPERATIONS).openapi({
  description: 'Database operation type',
  example: 'insert',
});

export type DatabaseOperation = z.infer<typeof DatabaseOperationSchema>;

export const DatabaseOperations = {
  SELECT: 'select' as const,
  INSERT: 'insert' as const,
  UPDATE: 'update' as const,
  DELETE: 'delete' as const,
  BATCH: 'batch' as const,
} as const;

// ============================================================================
// UI VARIANT
// ============================================================================

export const COMPONENT_VARIANTS = ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link', 'success', 'warning', 'glass'] as const;
export const ComponentVariantSchema = z.enum(COMPONENT_VARIANTS);
export type ComponentVariant = z.infer<typeof ComponentVariantSchema>;
export const ComponentVariants = {
  DEFAULT: 'default' as const,
  DESTRUCTIVE: 'destructive' as const,
  OUTLINE: 'outline' as const,
  SECONDARY: 'secondary' as const,
  GHOST: 'ghost' as const,
  LINK: 'link' as const,
  SUCCESS: 'success' as const,
  WARNING: 'warning' as const,
  GLASS: 'glass' as const,
} as const;

export const COMPONENT_SIZES = ['sm', 'md', 'lg', 'xl', 'icon', 'default'] as const;
export const ComponentSizeSchema = z.enum(COMPONENT_SIZES);
export type ComponentSize = z.infer<typeof ComponentSizeSchema>;
export const ComponentSizes = {
  SM: 'sm' as const,
  MD: 'md' as const,
  LG: 'lg' as const,
  XL: 'xl' as const,
  ICON: 'icon' as const,
  DEFAULT: 'default' as const,
} as const;

export const TEXT_ALIGNMENTS = ['left', 'center', 'right', 'justify'] as const;
export const TextAlignmentSchema = z.enum(TEXT_ALIGNMENTS);
export type TextAlignment = z.infer<typeof TextAlignmentSchema>;
export const TextAlignments = {
  LEFT: 'left' as const,
  CENTER: 'center' as const,
  RIGHT: 'right' as const,
  JUSTIFY: 'justify' as const,
} as const;

// ============================================================================
// EMAIL COMPONENT
// ============================================================================

export const EMAIL_TEXT_WEIGHTS = ['normal', 'medium', 'semibold', 'bold'] as const;
export const EmailTextWeightSchema = z.enum(EMAIL_TEXT_WEIGHTS);
export type EmailTextWeight = z.infer<typeof EmailTextWeightSchema>;

export const EMAIL_COLORS = ['primary', 'secondary', 'muted', 'white', 'failed', 'dark'] as const;
export const EmailColorSchema = z.enum(EMAIL_COLORS);
export type EmailColor = z.infer<typeof EmailColorSchema>;

export const EMAIL_SPACINGS = ['sm', 'md', 'lg'] as const;
export const EmailSpacingSchema = z.enum(EMAIL_SPACINGS);
export type EmailSpacing = z.infer<typeof EmailSpacingSchema>;

export const TOAST_VARIANTS = ['default', 'destructive', 'success', 'warning', 'info', 'loading'] as const;
export const ToastVariantSchema = z.enum(TOAST_VARIANTS);
export type ToastVariant = z.infer<typeof ToastVariantSchema>;
export const ToastVariants = {
  DEFAULT: 'default' as const,
  DESTRUCTIVE: 'destructive' as const,
  SUCCESS: 'success' as const,
  WARNING: 'warning' as const,
  INFO: 'info' as const,
  LOADING: 'loading' as const,
} as const;

// ============================================================================
// AUTH ACTION
// ============================================================================

export const AUTH_ACTIONS = ['login', 'logout', 'token_refresh', 'permission_check', 'registration'] as const;

export const AuthActionSchema = z.enum(AUTH_ACTIONS).openapi({
  description: 'Authentication action type',
  example: 'login',
});

export type AuthAction = z.infer<typeof AuthActionSchema>;

export const AuthActions = {
  LOGIN: 'login' as const,
  LOGOUT: 'logout' as const,
  TOKEN_REFRESH: 'token_refresh' as const,
  PERMISSION_CHECK: 'permission_check' as const,
  REGISTRATION: 'registration' as const,
} as const;

// ============================================================================
// VALIDATION TYPE
// ============================================================================

export const VALIDATION_TYPES = ['body', 'query', 'params', 'headers'] as const;

export const ValidationTypeSchema = z.enum(VALIDATION_TYPES).openapi({
  description: 'Request validation context type',
  example: 'body',
});

export type ValidationType = z.infer<typeof ValidationTypeSchema>;

export const ValidationTypes = {
  BODY: 'body' as const,
  QUERY: 'query' as const,
  PARAMS: 'params' as const,
  HEADERS: 'headers' as const,
} as const;

// ============================================================================
// ENVIRONMENT
// ============================================================================

export const ENVIRONMENTS = ['development', 'preview', 'production', 'test', 'local'] as const;

export const EnvironmentSchema = z.enum(ENVIRONMENTS).openapi({
  description: 'Application runtime environment',
  example: 'production',
});

export type Environment = z.infer<typeof EnvironmentSchema>;

export const Environments = {
  DEVELOPMENT: 'development' as const,
  PREVIEW: 'preview' as const,
  PRODUCTION: 'production' as const,
  TEST: 'test' as const,
  LOCAL: 'local' as const,
} as const;

// ============================================================================
// SORT DIRECTION
// ============================================================================

export const SORT_DIRECTIONS = ['asc', 'desc'] as const;

export const SortDirectionSchema = z.enum(SORT_DIRECTIONS).default('desc').openapi({
  description: 'Sort order direction',
  example: 'desc',
});

export type SortDirection = z.infer<typeof SortDirectionSchema>;

export const SortDirections = {
  ASC: 'asc' as const,
  DESC: 'desc' as const,
} as const;
