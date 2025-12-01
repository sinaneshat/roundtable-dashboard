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

export const MESSAGE_PART_TYPES = ['text', 'reasoning', 'tool-call', 'tool-result', 'file', 'step-start'] as const;

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
  FILE: 'file' as const,
  STEP_START: 'step-start' as const,
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
// MULTI-AI DELIBERATION - VOTE TYPE
// ============================================================================

export const VOTE_TYPES = ['approve', 'caution', 'reject'] as const;

export const VoteTypeSchema = z.enum(VOTE_TYPES).openapi({
  description: 'AI contributor vote type in deliberation',
  example: 'approve',
});

export type VoteType = z.infer<typeof VoteTypeSchema>;

export const VoteTypes = {
  APPROVE: 'approve' as const,
  CAUTION: 'caution' as const,
  REJECT: 'reject' as const,
} as const;

// ============================================================================
// MULTI-AI DELIBERATION - AGREEMENT STATUS
// ============================================================================

export const AGREEMENT_STATUSES = ['agree', 'caution', 'disagree', 'neutral'] as const;

// ✅ LENIENT SCHEMA: AI models may return unexpected values - default to 'neutral'
// Uses .catch() to prevent validation failures from breaking analysis streaming
export const AgreementStatusSchema = z.enum(AGREEMENT_STATUSES).catch('neutral').openapi({
  description: 'Agreement status in consensus analysis',
  example: 'agree',
});

export type AgreementStatus = z.infer<typeof AgreementStatusSchema>;

export const AgreementStatuses = {
  AGREE: 'agree' as const,
  CAUTION: 'caution' as const,
  DISAGREE: 'disagree' as const,
  NEUTRAL: 'neutral' as const,
} as const;

// ============================================================================
// MULTI-AI DELIBERATION - EVIDENCE STRENGTH
// ============================================================================

export const EVIDENCE_STRENGTHS = ['strong', 'moderate', 'weak'] as const;

export const EvidenceStrengthSchema = z.enum(EVIDENCE_STRENGTHS).openapi({
  description: 'Evidence strength classification (strong: 75%+, moderate: 50-74%, weak: <50%)',
  example: 'strong',
});

export type EvidenceStrength = z.infer<typeof EvidenceStrengthSchema>;

export const EvidenceStrengths = {
  STRONG: 'strong' as const,
  MODERATE: 'moderate' as const,
  WEAK: 'weak' as const,
} as const;

// ============================================================================
// MULTI-AI DELIBERATION - CONFIDENCE WEIGHTING
// ============================================================================

export const CONFIDENCE_WEIGHTINGS = ['balanced', 'evidence_heavy', 'consensus_heavy', 'expertise_weighted', 'direct', 'simple'] as const;

// ✅ LENIENT SCHEMA: AI models may return unexpected values - default to 'balanced'
// Uses .catch() to prevent validation failures from breaking analysis streaming
export const ConfidenceWeightingSchema = z.enum(CONFIDENCE_WEIGHTINGS).catch('balanced').openapi({
  description: 'Weighting method for calculating round confidence score',
  example: 'balanced',
});

export type ConfidenceWeighting = z.infer<typeof ConfidenceWeightingSchema>;

export const ConfidenceWeightings = {
  BALANCED: 'balanced' as const,
  EVIDENCE_HEAVY: 'evidence_heavy' as const,
  CONSENSUS_HEAVY: 'consensus_heavy' as const,
  EXPERTISE_WEIGHTED: 'expertise_weighted' as const,
  DIRECT: 'direct' as const,
  SIMPLE: 'simple' as const,
} as const;

// ============================================================================
// MULTI-AI DELIBERATION - DEBATE PHASE
// ============================================================================

export const DEBATE_PHASES = ['opening', 'rebuttal', 'cross_exam', 'synthesis', 'final_vote'] as const;

export const DebatePhaseSchema = z.enum(DEBATE_PHASES).openapi({
  description: 'Phase of debate in multi-AI deliberation',
  example: 'synthesis',
});

export type DebatePhase = z.infer<typeof DebatePhaseSchema>;

export const DebatePhases = {
  OPENING: 'opening' as const,
  REBUTTAL: 'rebuttal' as const,
  CROSS_EXAM: 'cross_exam' as const,
  SYNTHESIS: 'synthesis' as const,
  FINAL_VOTE: 'final_vote' as const,
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
// STREAM BUFFER STATUS (Resumable Streams)
// ============================================================================

export const STREAM_STATUSES = ['pending', 'initializing', 'streaming', 'completing', 'active', 'completed', 'failed', 'expired', 'timeout'] as const;

export const StreamStatusSchema = z.enum(STREAM_STATUSES).openapi({
  description: 'Stream buffer status for resumable AI SDK streams',
  example: 'streaming',
});

export type StreamStatus = z.infer<typeof StreamStatusSchema>;

export const StreamStatuses = {
  // ✅ EXTENDED STATES: More granular stream lifecycle tracking (Phase 1.3)
  PENDING: 'pending' as const, // Stream requested, not started
  INITIALIZING: 'initializing' as const, // AI model loading
  STREAMING: 'streaming' as const, // Actively generating content
  COMPLETING: 'completing' as const, // Finishing up, saving to DB
  // Legacy states (kept for backward compatibility)
  ACTIVE: 'active' as const, // Alias for STREAMING
  COMPLETED: 'completed' as const, // Successfully finished
  FAILED: 'failed' as const, // Error occurred
  EXPIRED: 'expired' as const, // TTL expired
  TIMEOUT: 'timeout' as const, // Exceeded time limit
} as const;

// ============================================================================
// PARTICIPANT STREAM STATUS (Round-Level Stream Tracking)
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for values
export const PARTICIPANT_STREAM_STATUSES = ['active', 'completed', 'failed'] as const;

// 2️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const ParticipantStreamStatusSchema = z.enum(PARTICIPANT_STREAM_STATUSES).openapi({
  description: 'Individual participant stream status within a round',
  example: 'active',
});

// 3️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type ParticipantStreamStatus = z.infer<typeof ParticipantStreamStatusSchema>;

// 4️⃣ CONSTANT OBJECT - For usage in code (prevents typos)
export const ParticipantStreamStatuses = {
  ACTIVE: 'active' as const, // Participant is currently streaming
  COMPLETED: 'completed' as const, // Participant finished successfully
  FAILED: 'failed' as const, // Participant stream failed
} as const;

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
// WEB SEARCH STREAMING STAGE
// ============================================================================

export const WEB_SEARCH_STREAMING_STAGES = ['query', 'search', 'synthesize'] as const;

export const WebSearchStreamingStageSchema = z.enum(WEB_SEARCH_STREAMING_STAGES).openapi({
  description: 'Current stage of web search streaming process',
  example: 'search',
});

export type WebSearchStreamingStage = z.infer<typeof WebSearchStreamingStageSchema>;

export const WebSearchStreamingStages = {
  QUERY: 'query' as const,
  SEARCH: 'search' as const,
  SYNTHESIZE: 'synthesize' as const,
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
// AI SDK STATUS (AI SDK v5 useChat hook status values)
// ============================================================================

// ✅ AI SDK v5 uses these status values:
// - 'ready' - Initial/idle state, ready to accept new messages
// - 'submitted' - Message submitted, waiting for response
// - 'streaming' - Currently streaming a response
// - 'error' - An error occurred
export const AI_SDK_STATUSES = ['ready', 'submitted', 'streaming', 'error'] as const;

export const AiSdkStatusSchema = z.enum(AI_SDK_STATUSES);

export type AiSdkStatus = z.infer<typeof AiSdkStatusSchema>;

export const AiSdkStatuses = {
  READY: 'ready' as const,
  SUBMITTED: 'submitted' as const,
  STREAMING: 'streaming' as const,
  ERROR: 'error' as const,
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
  'empty_response',
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
  EMPTY_RESPONSE: 'empty_response' as const,
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
// FLOW STATE (Chat conversation flow lifecycle)
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for flow state values
export const FLOW_STATES = ['idle', 'creating_thread', 'streaming_participants', 'creating_analysis', 'streaming_analysis', 'completing', 'navigating', 'complete'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_FLOW_STATE: FlowState = 'idle';

// 3️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const FlowStateSchema = z.enum(FLOW_STATES).openapi({
  description: 'Chat conversation flow lifecycle state',
  example: 'streaming_participants',
});

// 4️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type FlowState = z.infer<typeof FlowStateSchema>;

// 5️⃣ CONSTANT OBJECT - For usage in code (prevents typos)
export const FlowStates = {
  IDLE: 'idle' as const,
  CREATING_THREAD: 'creating_thread' as const,
  STREAMING_PARTICIPANTS: 'streaming_participants' as const,
  CREATING_ANALYSIS: 'creating_analysis' as const,
  STREAMING_ANALYSIS: 'streaming_analysis' as const,
  COMPLETING: 'completing' as const,
  NAVIGATING: 'navigating' as const,
  COMPLETE: 'complete' as const,
} as const;

// ============================================================================
// PENDING MESSAGE VALIDATION REASON
// ============================================================================

// 1️⃣ ARRAY CONSTANT - All validation failure reasons
export const PENDING_MESSAGE_VALIDATION_REASONS = [
  'public screen mode',
  'no pending message or expected participants',
  'already sent',
  'currently streaming',
  'participant mismatch',
  'waiting for changelog',
  'waiting for pre-search creation',
  'waiting for pre-search',
] as const;

// 3️⃣ ZOD SCHEMA - Runtime validation
export const PendingMessageValidationReasonSchema = z.enum(PENDING_MESSAGE_VALIDATION_REASONS).openapi({
  description: 'Reason why pending message cannot be sent',
  example: 'waiting for pre-search',
});

// 4️⃣ TYPESCRIPT TYPE - Validation reason type
export type PendingMessageValidationReason = z.infer<typeof PendingMessageValidationReasonSchema>;

// 5️⃣ CONSTANT OBJECT - For validation logic
export const PendingMessageValidationReasons = {
  PUBLIC_SCREEN_MODE: 'public screen mode' as const,
  NO_PENDING_MESSAGE: 'no pending message or expected participants' as const,
  ALREADY_SENT: 'already sent' as const,
  CURRENTLY_STREAMING: 'currently streaming' as const,
  PARTICIPANT_MISMATCH: 'participant mismatch' as const,
  WAITING_FOR_CHANGELOG: 'waiting for changelog' as const,
  WAITING_FOR_PRE_SEARCH_CREATION: 'waiting for pre-search creation' as const,
  WAITING_FOR_PRE_SEARCH: 'waiting for pre-search' as const,
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

// ============================================================================
// CHAT ATTACHMENT STATUS (File Upload Processing)
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for attachment statuses
export const CHAT_ATTACHMENT_STATUSES = [
  'uploading',
  'uploaded',
  'processing',
  'ready',
  'failed',
] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_CHAT_ATTACHMENT_STATUS: ChatAttachmentStatus = 'uploaded';

// 3️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const ChatAttachmentStatusSchema = z.enum(CHAT_ATTACHMENT_STATUSES).openapi({
  description: 'File attachment upload/processing lifecycle status',
  example: 'ready',
});

// 4️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type ChatAttachmentStatus = z.infer<typeof ChatAttachmentStatusSchema>;

// 5️⃣ CONSTANT OBJECT - For usage in code (prevents typos)
export const ChatAttachmentStatuses = {
  UPLOADING: 'uploading' as const,
  UPLOADED: 'uploaded' as const,
  PROCESSING: 'processing' as const,
  READY: 'ready' as const,
  FAILED: 'failed' as const,
} as const;

// ============================================================================
// UPLOAD STATUS (Frontend Upload Lifecycle)
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for upload lifecycle states
export const UPLOAD_STATUSES = [
  'pending',
  'validating',
  'uploading',
  'processing',
  'completed',
  'failed',
  'cancelled',
] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_UPLOAD_STATUS: UploadStatus = 'pending';

// 3️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const UploadStatusSchema = z.enum(UPLOAD_STATUSES).openapi({
  description: 'Frontend upload operation lifecycle status',
  example: 'uploading',
});

// 4️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type UploadStatus = z.infer<typeof UploadStatusSchema>;

// 5️⃣ CONSTANT OBJECT - For usage in code (prevents typos)
export const UploadStatuses = {
  PENDING: 'pending' as const,
  VALIDATING: 'validating' as const,
  UPLOADING: 'uploading' as const,
  PROCESSING: 'processing' as const,
  COMPLETED: 'completed' as const,
  FAILED: 'failed' as const,
  CANCELLED: 'cancelled' as const,
} as const;

// ============================================================================
// FILE PREVIEW TYPE (Client-Side Preview Categories)
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for preview types
export const FILE_PREVIEW_TYPES = [
  'image',
  'pdf',
  'text',
  'code',
  'document',
  'unknown',
] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_FILE_PREVIEW_TYPE: FilePreviewType = 'unknown';

// 3️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const FilePreviewTypeSchema = z.enum(FILE_PREVIEW_TYPES).openapi({
  description: 'File type category for preview generation',
  example: 'image',
});

// 4️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type FilePreviewType = z.infer<typeof FilePreviewTypeSchema>;

// 5️⃣ CONSTANT OBJECT - For usage in code (prevents typos)
export const FilePreviewTypes = {
  IMAGE: 'image' as const,
  PDF: 'pdf' as const,
  TEXT: 'text' as const,
  CODE: 'code' as const,
  DOCUMENT: 'document' as const,
  UNKNOWN: 'unknown' as const,
} as const;

// ============================================================================
// FILE VALIDATION ERROR CODE
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for validation error codes
export const FILE_VALIDATION_ERROR_CODES = [
  'file_too_large',
  'invalid_type',
  'empty_file',
  'filename_too_long',
] as const;

// 3️⃣ ZOD SCHEMA - Runtime validation
export const FileValidationErrorCodeSchema = z.enum(FILE_VALIDATION_ERROR_CODES).openapi({
  description: 'File validation failure reason code',
  example: 'file_too_large',
});

// 4️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type FileValidationErrorCode = z.infer<typeof FileValidationErrorCodeSchema>;

// 5️⃣ CONSTANT OBJECT - For usage in code
export const FileValidationErrorCodes = {
  FILE_TOO_LARGE: 'file_too_large' as const,
  INVALID_TYPE: 'invalid_type' as const,
  EMPTY_FILE: 'empty_file' as const,
  FILENAME_TOO_LONG: 'filename_too_long' as const,
} as const;

// ============================================================================
// FILE CATEGORY (High-Level File Type Classification)
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for file categories
export const FILE_CATEGORIES = ['image', 'document', 'text', 'code', 'other'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_FILE_CATEGORY: FileCategory = 'other';

// 3️⃣ ZOD SCHEMA - Runtime validation
export const FileCategorySchema = z.enum(FILE_CATEGORIES).openapi({
  description: 'High-level file type classification',
  example: 'image',
});

// 4️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type FileCategory = z.infer<typeof FileCategorySchema>;

// 5️⃣ CONSTANT OBJECT - For usage in code
export const FileCategories = {
  IMAGE: 'image' as const,
  DOCUMENT: 'document' as const,
  TEXT: 'text' as const,
  CODE: 'code' as const,
  OTHER: 'other' as const,
} as const;

// ============================================================================
// UPLOAD STRATEGY (Single vs Multipart)
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for upload strategies
export const UPLOAD_STRATEGIES = ['single', 'multipart'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_UPLOAD_STRATEGY: UploadStrategy = 'single';

// 3️⃣ ZOD SCHEMA - Runtime validation
export const UploadStrategySchema = z.enum(UPLOAD_STRATEGIES).openapi({
  description: 'Upload method based on file size',
  example: 'single',
});

// 4️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type UploadStrategy = z.infer<typeof UploadStrategySchema>;

// 5️⃣ CONSTANT OBJECT - For usage in code
export const UploadStrategies = {
  SINGLE: 'single' as const,
  MULTIPART: 'multipart' as const,
} as const;

// ============================================================================
// UPLOAD SIZE CONSTANTS (R2/S3 Limits)
// ============================================================================

/** Max file size for single-request uploads (100MB) */
export const MAX_SINGLE_UPLOAD_SIZE = 100 * 1024 * 1024;

/** Minimum part size for multipart uploads (5MB - R2/S3 requirement) */
export const MIN_MULTIPART_PART_SIZE = 5 * 1024 * 1024;

/** Recommended part size for multipart uploads (10MB - balance of speed/reliability) */
export const RECOMMENDED_PART_SIZE = 10 * 1024 * 1024;

/** Maximum total file size (5GB) */
export const MAX_TOTAL_FILE_SIZE = 5 * 1024 * 1024 * 1024;

/** Maximum filename length */
export const MAX_FILENAME_LENGTH = 255;

/** Maximum number of parts for multipart upload (R2/S3 limit) */
export const MAX_MULTIPART_PARTS = 10000;

// ============================================================================
// ALLOWED MIME TYPES (File Upload Restrictions)
// ============================================================================

/** Image MIME types */
export const IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
] as const;

/** Document MIME types */
export const DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
] as const;

/** Text MIME types */
export const TEXT_MIME_TYPES = [
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/html',
  'application/json',
] as const;

/** Code MIME types */
export const CODE_MIME_TYPES = [
  'text/javascript',
  'application/javascript',
  'text/typescript',
  'text/x-python',
  'text/x-java-source',
  'text/x-c',
  'text/x-c++',
] as const;

/** All allowed MIME types combined */
export const ALLOWED_MIME_TYPES = [
  ...IMAGE_MIME_TYPES,
  ...DOCUMENT_MIME_TYPES,
  ...TEXT_MIME_TYPES,
  ...CODE_MIME_TYPES,
] as const;

/** MIME type categories for validation and categorization */
export const MIME_TYPE_CATEGORIES = {
  image: IMAGE_MIME_TYPES,
  document: DOCUMENT_MIME_TYPES,
  text: TEXT_MIME_TYPES,
  code: CODE_MIME_TYPES,
} as const;

// Zod schema for allowed MIME types
export const AllowedMimeTypeSchema = z.enum(ALLOWED_MIME_TYPES).openapi({
  description: 'Allowed file MIME type for uploads',
  example: 'application/pdf',
});

export type AllowedMimeType = z.infer<typeof AllowedMimeTypeSchema>;

// ============================================================================
// PROJECT INDEX STATUS (AutoRAG indexing for project attachments)
// ============================================================================

export const PROJECT_INDEX_STATUSES = [
  'pending',
  'indexing',
  'indexed',
  'failed',
] as const;

export const DEFAULT_PROJECT_INDEX_STATUS: ProjectIndexStatus = 'pending';

export const ProjectIndexStatusSchema = z.enum(PROJECT_INDEX_STATUSES).openapi({
  description: 'AutoRAG indexing status for project attachments',
  example: 'indexed',
});

export type ProjectIndexStatus = z.infer<typeof ProjectIndexStatusSchema>;

export const ProjectIndexStatuses = {
  PENDING: 'pending' as const,
  INDEXING: 'indexing' as const,
  INDEXED: 'indexed' as const,
  FAILED: 'failed' as const,
} as const;

// ============================================================================
// PROJECT MEMORY SOURCE (origin of memory entries)
// ============================================================================

export const PROJECT_MEMORY_SOURCES = [
  'chat',
  'explicit',
  'analysis',
  'search',
] as const;

export const DEFAULT_PROJECT_MEMORY_SOURCE: ProjectMemorySource = 'chat';

export const ProjectMemorySourceSchema = z.enum(PROJECT_MEMORY_SOURCES).openapi({
  description: 'Source of the project memory entry',
  example: 'chat',
});

export type ProjectMemorySource = z.infer<typeof ProjectMemorySourceSchema>;

export const ProjectMemorySources = {
  CHAT: 'chat' as const,
  EXPLICIT: 'explicit' as const,
  ANALYSIS: 'analysis' as const,
  SEARCH: 'search' as const,
} as const;

// ============================================================================
// PROJECT COLOR (visual identification)
// ============================================================================

export const PROJECT_COLORS = [
  'gray',
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
] as const;

export const DEFAULT_PROJECT_COLOR: ProjectColor = 'blue';

export const ProjectColorSchema = z.enum(PROJECT_COLORS).openapi({
  description: 'Project color for visual identification',
  example: 'blue',
});

export type ProjectColor = z.infer<typeof ProjectColorSchema>;

export const ProjectColors = {
  GRAY: 'gray' as const,
  RED: 'red' as const,
  ORANGE: 'orange' as const,
  AMBER: 'amber' as const,
  YELLOW: 'yellow' as const,
  LIME: 'lime' as const,
  GREEN: 'green' as const,
  EMERALD: 'emerald' as const,
  TEAL: 'teal' as const,
  CYAN: 'cyan' as const,
  SKY: 'sky' as const,
  BLUE: 'blue' as const,
  INDIGO: 'indigo' as const,
  VIOLET: 'violet' as const,
  PURPLE: 'purple' as const,
  FUCHSIA: 'fuchsia' as const,
  PINK: 'pink' as const,
  ROSE: 'rose' as const,
} as const;

// ============================================================================
// CITATION SOURCE TYPE (RAG context citation sources)
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for citation sources
export const CITATION_SOURCE_TYPES = [
  'memory', // projectMemory - persistent project context
  'thread', // chatThread - cross-thread context from same project
  'attachment', // projectAttachment - files indexed via AutoRAG
  'search', // chatPreSearch - web search results
  'analysis', // chatModeratorAnalysis - moderator analysis insights
] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_CITATION_SOURCE_TYPE: CitationSourceType = 'memory';

// 3️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const CitationSourceTypeSchema = z.enum(CITATION_SOURCE_TYPES).openapi({
  description: 'Type of source being cited in AI response',
  example: 'memory',
});

// 4️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type CitationSourceType = z.infer<typeof CitationSourceTypeSchema>;

// 5️⃣ CONSTANT OBJECT - For usage in code (prevents typos)
export const CitationSourceTypes = {
  MEMORY: 'memory' as const,
  THREAD: 'thread' as const,
  ATTACHMENT: 'attachment' as const,
  SEARCH: 'search' as const,
  ANALYSIS: 'analysis' as const,
} as const;

// 6️⃣ LABELS - Human-readable labels for each source type
export const CitationSourceLabels: Record<CitationSourceType, string> = {
  [CitationSourceTypes.MEMORY]: 'Memory',
  [CitationSourceTypes.THREAD]: 'Thread',
  [CitationSourceTypes.ATTACHMENT]: 'File',
  [CitationSourceTypes.SEARCH]: 'Search',
  [CitationSourceTypes.ANALYSIS]: 'Analysis',
} as const;

// 7️⃣ PREFIXES - Short prefixes for citation ID generation (e.g., mem_abc123)
export const CITATION_PREFIXES = ['mem', 'thd', 'att', 'sch', 'ana'] as const;
export type CitationPrefix = typeof CITATION_PREFIXES[number];

export const CitationSourcePrefixes: Record<CitationSourceType, CitationPrefix> = {
  [CitationSourceTypes.MEMORY]: 'mem',
  [CitationSourceTypes.THREAD]: 'thd',
  [CitationSourceTypes.ATTACHMENT]: 'att',
  [CitationSourceTypes.SEARCH]: 'sch',
  [CitationSourceTypes.ANALYSIS]: 'ana',
};

// 7️⃣b INVERSE PREFIXES - Map from prefix to source type (for parsing)
export const CitationPrefixToSourceType: Record<CitationPrefix, CitationSourceType> = {
  mem: CitationSourceTypes.MEMORY,
  thd: CitationSourceTypes.THREAD,
  att: CitationSourceTypes.ATTACHMENT,
  sch: CitationSourceTypes.SEARCH,
  ana: CitationSourceTypes.ANALYSIS,
};

// 8️⃣ SECTION HEADERS - Headers for formatting sources in AI prompt
export const CitationSourceSectionHeaders: Record<CitationSourceType, string> = {
  [CitationSourceTypes.MEMORY]: 'Project Memories',
  [CitationSourceTypes.THREAD]: 'Related Conversations',
  [CitationSourceTypes.ATTACHMENT]: 'Project Files',
  [CitationSourceTypes.SEARCH]: 'Previous Research',
  [CitationSourceTypes.ANALYSIS]: 'Key Insights from Analyses',
} as const;

// 9️⃣ CONTENT LIMITS - Max characters to show per source type in context
export const CitationSourceContentLimits: Record<CitationSourceType, number> = {
  [CitationSourceTypes.MEMORY]: 300,
  [CitationSourceTypes.THREAD]: 400,
  [CitationSourceTypes.ATTACHMENT]: 300,
  [CitationSourceTypes.SEARCH]: 300,
  [CitationSourceTypes.ANALYSIS]: 400,
} as const;

// ============================================================================
// TEXT EXTRACTABLE MIME TYPES (RAG Content Extraction)
// ============================================================================

/**
 * MIME types that support text extraction for RAG context
 * ✅ SINGLE SOURCE OF TRUTH for content extraction logic
 * Used by streaming-orchestration.service.ts for attachment content extraction
 */
export const TEXT_EXTRACTABLE_MIME_TYPES = [
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/html',
  'text/css',
  'text/javascript',
  'application/json',
  'application/xml',
  'application/javascript',
  'text/x-python',
  'text/x-java',
  'text/x-c',
  'text/x-c++',
  'text/x-typescript',
] as const;

export type TextExtractableMimeType = typeof TEXT_EXTRACTABLE_MIME_TYPES[number];

/** Maximum text content to extract from a single file (100KB) */
export const MAX_TEXT_CONTENT_SIZE = 100 * 1024;

// ============================================================================
// FILE TYPE LABELS (Human-Readable File Type Display)
// ============================================================================

/**
 * Human-readable labels for file MIME types
 * SINGLE SOURCE OF TRUTH for file type display strings
 * Used by use-file-preview.ts for consistent labeling
 */
export const FILE_TYPE_LABELS = {
  // Images
  'image/png': 'PNG Image',
  'image/jpeg': 'JPEG Image',
  'image/gif': 'GIF Image',
  'image/webp': 'WebP Image',
  'image/svg+xml': 'SVG Image',
  // Documents
  'application/pdf': 'PDF Document',
  'application/msword': 'Word Document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word Document',
  'application/vnd.ms-excel': 'Excel Spreadsheet',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel Spreadsheet',
  'application/vnd.ms-powerpoint': 'PowerPoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint',
  // Text
  'text/plain': 'Text File',
  'text/markdown': 'Markdown',
  'text/csv': 'CSV File',
  'text/html': 'HTML File',
  'application/json': 'JSON File',
  // Code
  'text/javascript': 'JavaScript',
  'application/javascript': 'JavaScript',
  'text/typescript': 'TypeScript',
  'text/x-python': 'Python',
  'text/x-java-source': 'Java',
  'text/x-c': 'C',
  'text/x-c++': 'C++',
} as const satisfies Partial<Record<AllowedMimeType | 'text/typescript' | 'text/x-java-source' | 'text/x-c++', string>>;

/**
 * Type for file type labels - keys are MIME types with known labels
 */
export type FileTypeLabelMimeType = keyof typeof FILE_TYPE_LABELS;

/**
 * Get human-readable label for a MIME type
 * Returns 'File' for unknown types
 */
export function getFileTypeLabelFromMime(mimeType: string): string {
  return FILE_TYPE_LABELS[mimeType as FileTypeLabelMimeType] ?? 'File';
}
