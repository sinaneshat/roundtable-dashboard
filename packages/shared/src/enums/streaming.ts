/**
 * Streaming and Flow State Enums
 *
 * Enums for managing stream lifecycle, flow states, and async operations.
 */

import { z } from '@hono/zod-openapi';

// ============================================================================
// OPERATION STATUS (Generic async operation lifecycle)
// ============================================================================

// 1. ARRAY CONSTANT
export const OPERATION_STATUSES = ['idle', 'pending', 'active', 'streaming', 'complete', 'failed'] as const;

// 2. ZOD SCHEMA
export const OperationStatusSchema = z.enum(OPERATION_STATUSES).openapi({
  description: 'Generic async operation lifecycle status',
  example: 'streaming',
});

// 3. TYPESCRIPT TYPE
export type OperationStatus = z.infer<typeof OperationStatusSchema>;

// 4. DEFAULT VALUE
export const DEFAULT_OPERATION_STATUS: OperationStatus = 'idle';

// 5. CONSTANT OBJECT
export const OperationStatuses = {
  IDLE: 'idle' as const,
  PENDING: 'pending' as const,
  ACTIVE: 'active' as const,
  STREAMING: 'streaming' as const,
  COMPLETE: 'complete' as const,
  FAILED: 'failed' as const,
} as const;

// ============================================================================
// STREAMING EVENT TYPE
// ============================================================================

// 1. ARRAY CONSTANT
export const STREAMING_EVENT_TYPES = ['start', 'chunk', 'complete', 'failed'] as const;

// 2. ZOD SCHEMA
export const StreamingEventTypeSchema = z.enum(STREAMING_EVENT_TYPES).openapi({
  description: 'Streaming event lifecycle type',
  example: 'chunk',
});

// 3. TYPESCRIPT TYPE
export type StreamingEventType = z.infer<typeof StreamingEventTypeSchema>;

// 4. DEFAULT VALUE
export const DEFAULT_STREAMING_EVENT_TYPE: StreamingEventType = 'start';

// 5. CONSTANT OBJECT
export const StreamingEventTypes = {
  START: 'start' as const,
  CHUNK: 'chunk' as const,
  COMPLETE: 'complete' as const,
  FAILED: 'failed' as const,
} as const;

// ============================================================================
// STREAM BUFFER STATUS (Resumable Streams)
// ============================================================================

// 1. ARRAY CONSTANT
export const STREAM_STATUSES = ['pending', 'initializing', 'streaming', 'completing', 'active', 'completed', 'failed', 'expired', 'timeout'] as const;

// 2. ZOD SCHEMA
export const StreamStatusSchema = z.enum(STREAM_STATUSES).openapi({
  description: 'Stream buffer status for resumable AI SDK streams',
  example: 'streaming',
});

// 3. TYPESCRIPT TYPE
export type StreamStatus = z.infer<typeof StreamStatusSchema>;

// 4. DEFAULT VALUE
export const DEFAULT_STREAM_STATUS: StreamStatus = 'pending';

// 5. CONSTANT OBJECT
export const StreamStatuses = {
  PENDING: 'pending' as const,
  INITIALIZING: 'initializing' as const,
  STREAMING: 'streaming' as const,
  COMPLETING: 'completing' as const,
  ACTIVE: 'active' as const,
  COMPLETED: 'completed' as const,
  FAILED: 'failed' as const,
  EXPIRED: 'expired' as const,
  TIMEOUT: 'timeout' as const,
} as const;

// ============================================================================
// PARTICIPANT STREAM STATUS (Round-Level Stream Tracking)
// ============================================================================

// 1. ARRAY CONSTANT
export const PARTICIPANT_STREAM_STATUSES = ['pending', 'active', 'completed', 'failed'] as const;

// 2. ZOD SCHEMA
export const ParticipantStreamStatusSchema = z.enum(PARTICIPANT_STREAM_STATUSES).openapi({
  description: 'Individual participant stream status within a round',
  example: 'active',
});

// 3. TYPESCRIPT TYPE
export type ParticipantStreamStatus = z.infer<typeof ParticipantStreamStatusSchema>;

// 4. DEFAULT VALUE
export const DEFAULT_PARTICIPANT_STREAM_STATUS: ParticipantStreamStatus = 'pending';

// 5. CONSTANT OBJECT
export const ParticipantStreamStatuses = {
  PENDING: 'pending' as const,
  ACTIVE: 'active' as const,
  COMPLETED: 'completed' as const,
  FAILED: 'failed' as const,
} as const;

// ============================================================================
// ROUND EXECUTION STATUS (Server-side orchestration status)
// ============================================================================

// 1. ARRAY CONSTANT
export const ROUND_EXECUTION_STATUSES = ['not_started', 'running', 'completed', 'failed', 'incomplete'] as const;

// 2. ZOD SCHEMA
export const RoundExecutionStatusSchema = z.enum(ROUND_EXECUTION_STATUSES).openapi({
  description: 'Status of server-side round execution orchestration',
  example: 'running',
});

// 3. TYPESCRIPT TYPE
export type RoundExecutionStatus = z.infer<typeof RoundExecutionStatusSchema>;

// 4. DEFAULT VALUE
export const DEFAULT_ROUND_EXECUTION_STATUS: RoundExecutionStatus = 'not_started';

// 5. CONSTANT OBJECT
export const RoundExecutionStatuses = {
  NOT_STARTED: 'not_started' as const,
  RUNNING: 'running' as const,
  COMPLETED: 'completed' as const,
  FAILED: 'failed' as const,
  INCOMPLETE: 'incomplete' as const,
} as const;

// ============================================================================
// ROUND EXECUTION PHASE (Server-side orchestration phase)
// ============================================================================

// 1. ARRAY CONSTANT
export const ROUND_EXECUTION_PHASES = ['participants', 'moderator', 'complete'] as const;

// 2. ZOD SCHEMA
export const RoundExecutionPhaseSchema = z.enum(ROUND_EXECUTION_PHASES).openapi({
  description: 'Current phase of server-side round execution',
  example: 'participants',
});

// 3. TYPESCRIPT TYPE
export type RoundExecutionPhase = z.infer<typeof RoundExecutionPhaseSchema>;

// 4. DEFAULT VALUE
export const DEFAULT_ROUND_EXECUTION_PHASE: RoundExecutionPhase = 'participants';

// 5. CONSTANT OBJECT
export const RoundExecutionPhases = {
  PARTICIPANTS: 'participants' as const,
  MODERATOR: 'moderator' as const,
  COMPLETE: 'complete' as const,
} as const;

// ============================================================================
// FLOW STATE (Chat conversation flow lifecycle)
// ============================================================================

// 1. ARRAY CONSTANT
export const FLOW_STATES = ['idle', 'creating_thread', 'streaming_participants', 'creating_moderator', 'streaming_moderator', 'completing', 'navigating', 'complete'] as const;

// 2. ZOD SCHEMA
export const FlowStateSchema = z.enum(FLOW_STATES).openapi({
  description: 'Chat conversation flow lifecycle state',
  example: 'streaming_participants',
});

// 3. TYPESCRIPT TYPE
export type FlowState = z.infer<typeof FlowStateSchema>;

// 4. DEFAULT VALUE
export const DEFAULT_FLOW_STATE: FlowState = 'idle';

// 5. CONSTANT OBJECT
export const FlowStates = {
  IDLE: 'idle' as const,
  CREATING_THREAD: 'creating_thread' as const,
  STREAMING_PARTICIPANTS: 'streaming_participants' as const,
  CREATING_MODERATOR: 'creating_moderator' as const,
  STREAMING_MODERATOR: 'streaming_moderator' as const,
  COMPLETING: 'completing' as const,
  NAVIGATING: 'navigating' as const,
  COMPLETE: 'complete' as const,
} as const;

// ============================================================================
// CHAIN OF THOUGHT STEP STATUS
// ============================================================================

// 1. ARRAY CONSTANT
export const CHAIN_OF_THOUGHT_STEP_STATUSES = ['pending', 'active', 'complete'] as const;

// 2. ZOD SCHEMA
export const ChainOfThoughtStepStatusSchema = z.enum(CHAIN_OF_THOUGHT_STEP_STATUSES).openapi({
  description: 'Chain of thought reasoning step status',
  example: 'active',
});

// 3. TYPESCRIPT TYPE
export type ChainOfThoughtStepStatus = z.infer<typeof ChainOfThoughtStepStatusSchema>;

// 4. DEFAULT VALUE
export const DEFAULT_CHAIN_OF_THOUGHT_STEP_STATUS: ChainOfThoughtStepStatus = 'pending';

// 5. CONSTANT OBJECT
export const ChainOfThoughtStepStatuses = {
  PENDING: 'pending' as const,
  ACTIVE: 'active' as const,
  COMPLETE: 'complete' as const,
} as const;

// ============================================================================
// PENDING MESSAGE VALIDATION REASON
// ============================================================================

// 1. ARRAY CONSTANT
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

// 2. ZOD SCHEMA
export const PendingMessageValidationReasonSchema = z.enum(PENDING_MESSAGE_VALIDATION_REASONS).openapi({
  description: 'Reason why pending message cannot be sent',
  example: 'waiting for pre-search',
});

// 3. TYPESCRIPT TYPE
export type PendingMessageValidationReason = z.infer<typeof PendingMessageValidationReasonSchema>;

// 4. DEFAULT VALUE
export const DEFAULT_PENDING_MESSAGE_VALIDATION_REASON: PendingMessageValidationReason = 'no pending message or expected participants';

// 5. CONSTANT OBJECT
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
// ROUND PHASE (Unified stream resumption phase tracking)
// ============================================================================

// 1. ARRAY CONSTANT
export const ROUND_PHASES = ['idle', 'pre_search', 'participants', 'moderator', 'complete'] as const;

// 2. ZOD SCHEMA
export const RoundPhaseSchema = z.enum(ROUND_PHASES).openapi({
  description: 'Current phase of a conversation round for stream resumption',
  example: 'participants',
});

// 3. TYPESCRIPT TYPE
export type RoundPhase = z.infer<typeof RoundPhaseSchema>;

// 4. DEFAULT VALUE
export const DEFAULT_ROUND_PHASE: RoundPhase = 'idle';

// 5. CONSTANT OBJECT
export const RoundPhases = {
  IDLE: 'idle' as const,
  PRE_SEARCH: 'pre_search' as const,
  PARTICIPANTS: 'participants' as const,
  MODERATOR: 'moderator' as const,
  COMPLETE: 'complete' as const,
} as const;

// ============================================================================
// STREAM PHASE (Active streaming phases for API)
// ============================================================================

// 1. ARRAY CONSTANT
export const STREAM_PHASES = ['presearch', 'participant', 'moderator'] as const;

// 2. ZOD SCHEMA
export const StreamPhaseSchema = z.enum(STREAM_PHASES).openapi({
  description: 'Current phase of an active stream',
  example: 'participant',
});

// 3. TYPESCRIPT TYPE
export type StreamPhase = z.infer<typeof StreamPhaseSchema>;

// 4. DEFAULT VALUE
export const DEFAULT_STREAM_PHASE: StreamPhase = 'participant';

// 5. CONSTANT OBJECT
export const StreamPhases = {
  PRESEARCH: 'presearch' as const,
  PARTICIPANT: 'participant' as const,
  MODERATOR: 'moderator' as const,
} as const;

// 6. TYPE GUARD (optional helper)
export function isStreamPhase(value: unknown): value is StreamPhase {
  return StreamPhaseSchema.safeParse(value).success;
}

// ============================================================================
// RECOVERY STRATEGY (Stream resumption recovery approach)
// ============================================================================

// 1. ARRAY CONSTANT
export const RECOVERY_STRATEGIES = ['full', 'partial', 'restart'] as const;

// 2. DEFAULT VALUE
export const DEFAULT_RECOVERY_STRATEGY: RecoveryStrategy = 'full';

// 3. ZOD SCHEMA
export const RecoveryStrategySchema = z.enum(RECOVERY_STRATEGIES).openapi({
  description: 'Strategy for recovering from stream interruption',
  example: 'full',
});

// 4. TYPESCRIPT TYPE
export type RecoveryStrategy = z.infer<typeof RecoveryStrategySchema>;

// 5. CONSTANT OBJECT
export const RecoveryStrategies = {
  FULL: 'full' as const,
  PARTIAL: 'partial' as const,
  RESTART: 'restart' as const,
} as const;

// ============================================================================
// POLLING STATUS (API Responses)
// ============================================================================

// 1. ARRAY CONSTANT
export const POLLING_STATUSES = ['pending', 'streaming', 'processing'] as const;

// 2. ZOD SCHEMA
export const PollingStatusSchema = z.enum(POLLING_STATUSES).openapi({
  description: 'Status of a polling operation for async API responses',
  example: 'pending',
});

// 3. TYPESCRIPT TYPE
export type PollingStatus = z.infer<typeof PollingStatusSchema>;

// 4. DEFAULT VALUE
export const DEFAULT_POLLING_STATUS: PollingStatus = 'pending';

// 5. CONSTANT OBJECT
export const PollingStatuses = {
  PENDING: 'pending' as const,
  STREAMING: 'streaming' as const,
  PROCESSING: 'processing' as const,
} as const;

// ============================================================================
// PRE-SEARCH STREAMING EVENT TYPES
// ============================================================================

// 1. ARRAY CONSTANT
export const PRE_SEARCH_STREAMING_EVENT_TYPES = [
  'pre_search_start',
  'pre_search_query_generated',
  'pre_search_query',
  'pre_search_result',
  'pre_search_complete',
  'pre_search_error',
] as const;

// 2. ZOD SCHEMA
export const PreSearchStreamingEventTypeSchema = z.enum(PRE_SEARCH_STREAMING_EVENT_TYPES).openapi({
  description: 'Pre-search streaming event type for web search lifecycle',
  example: 'pre_search_query_generated',
});

// 3. TYPESCRIPT TYPE
export type PreSearchStreamingEventType = z.infer<typeof PreSearchStreamingEventTypeSchema>;

// 4. DEFAULT VALUE
export const DEFAULT_PRE_SEARCH_STREAMING_EVENT_TYPE: PreSearchStreamingEventType = 'pre_search_start';

// 5. CONSTANT OBJECT
export const PreSearchStreamingEventTypes = {
  PRE_SEARCH_START: 'pre_search_start' as const,
  PRE_SEARCH_QUERY_GENERATED: 'pre_search_query_generated' as const,
  PRE_SEARCH_QUERY: 'pre_search_query' as const,
  PRE_SEARCH_RESULT: 'pre_search_result' as const,
  PRE_SEARCH_COMPLETE: 'pre_search_complete' as const,
  PRE_SEARCH_ERROR: 'pre_search_error' as const,
} as const;

// ============================================================================
// SSE EVENT TYPE (AI SDK v6 SSE line prefixes)
// ============================================================================

// 1. ARRAY CONSTANT
// AI SDK v6 SSE line prefixes - event types for classifying chunks during stream resumption
export const SSE_EVENT_TYPES = [
  'text-delta', // 0: prefix - text content
  'reasoning-delta', // g: prefix - reasoning/thinking content
  'finish', // d: prefix - stream finish
  'error', // 3: prefix - error event
  'step-finish', // e: prefix - step completion
  'data', // 2: prefix - tool results, metadata
  'unknown', // unrecognized prefix
] as const;

// 2. ZOD SCHEMA
export const SSEEventTypeSchema = z.enum(SSE_EVENT_TYPES).openapi({
  description: 'AI SDK v6 SSE event type for stream chunk classification',
  example: 'text-delta',
});

// 3. TYPESCRIPT TYPE
export type SSEEventType = z.infer<typeof SSEEventTypeSchema>;

// 4. DEFAULT VALUE
export const DEFAULT_SSE_EVENT_TYPE: SSEEventType = 'unknown';

// 5. CONSTANT OBJECT
export const SSEEventTypes = {
  TEXT_DELTA: 'text-delta' as const,
  REASONING_DELTA: 'reasoning-delta' as const,
  FINISH: 'finish' as const,
  ERROR: 'error' as const,
  STEP_FINISH: 'step-finish' as const,
  DATA: 'data' as const,
  UNKNOWN: 'unknown' as const,
} as const;

// Map AI SDK line prefixes to event types
// Keys are string prefixes extracted from SSE data lines
export const SSE_PREFIX_TO_EVENT = {
  0: 'text-delta',
  g: 'reasoning-delta',
  d: 'finish',
  3: 'error',
  e: 'step-finish',
  2: 'data',
} as const satisfies Record<string | number, SSEEventType>;

/**
 * Parse SSE event type from AI SDK v6 formatted data line
 * Format: `{prefix}:{json_content}` or `{prefix}:"{string_content}"`
 */
export function parseSSEEventType(data: string): SSEEventType {
  // Skip empty lines or lines without colon
  if (!data || !data.includes(':')) {
    return SSEEventTypes.UNKNOWN;
  }

  // Extract prefix (everything before first colon)
  const colonIndex = data.indexOf(':');
  const prefix = data.substring(0, colonIndex);

  // Check if prefix is a known SSE event prefix
  if (prefix in SSE_PREFIX_TO_EVENT) {
    return SSE_PREFIX_TO_EVENT[prefix as keyof typeof SSE_PREFIX_TO_EVENT];
  }

  return SSEEventTypes.UNKNOWN;
}

// ============================================================================
// ROUND ORCHESTRATION QUEUE MESSAGE TYPE
// ============================================================================

// 1. ARRAY CONSTANT
export const ROUND_ORCHESTRATION_MESSAGE_TYPES = [
  'trigger-participant',
  'trigger-moderator',
  'check-round-completion',
  'trigger-pre-search',
] as const;

// 2. ZOD SCHEMA
export const RoundOrchestrationMessageTypeSchema = z.enum(ROUND_ORCHESTRATION_MESSAGE_TYPES).openapi({
  description: 'Round orchestration queue message type discriminator',
  example: 'trigger-participant',
});

// 3. TYPESCRIPT TYPE
export type RoundOrchestrationMessageType = z.infer<typeof RoundOrchestrationMessageTypeSchema>;

// 4. DEFAULT VALUE
export const DEFAULT_ROUND_ORCHESTRATION_MESSAGE_TYPE: RoundOrchestrationMessageType = 'trigger-participant';

// 5. CONSTANT OBJECT
export const RoundOrchestrationMessageTypes = {
  TRIGGER_PARTICIPANT: 'trigger-participant' as const,
  TRIGGER_MODERATOR: 'trigger-moderator' as const,
  CHECK_ROUND_COMPLETION: 'check-round-completion' as const,
  TRIGGER_PRE_SEARCH: 'trigger-pre-search' as const,
} as const;

// ============================================================================
// CHECK ROUND COMPLETION REASON
// ============================================================================

// 1. ARRAY CONSTANT
export const CHECK_ROUND_COMPLETION_REASONS = [
  'stale_stream',
  'resume_trigger',
  'scheduled_check',
] as const;

// 2. ZOD SCHEMA
export const CheckRoundCompletionReasonSchema = z.enum(CHECK_ROUND_COMPLETION_REASONS).openapi({
  description: 'Reason for triggering a round completion check',
  example: 'resume_trigger',
});

// 3. TYPESCRIPT TYPE
export type CheckRoundCompletionReason = z.infer<typeof CheckRoundCompletionReasonSchema>;

// 4. DEFAULT VALUE
export const DEFAULT_CHECK_ROUND_COMPLETION_REASON: CheckRoundCompletionReason = 'scheduled_check';

// 5. CONSTANT OBJECT
export const CheckRoundCompletionReasons = {
  STALE_STREAM: 'stale_stream' as const,
  RESUME_TRIGGER: 'resume_trigger' as const,
  SCHEDULED_CHECK: 'scheduled_check' as const,
} as const;
