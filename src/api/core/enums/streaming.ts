/**
 * Streaming and Flow State Enums
 *
 * Enums for managing stream lifecycle, flow states, and async operations.
 */

import { z } from '@hono/zod-openapi';

// ============================================================================
// GENERIC OPERATION STATUS
// ============================================================================

export const OPERATION_STATUSES = ['idle', 'pending', 'active', 'streaming', 'complete', 'failed'] as const;

export const DEFAULT_OPERATION_STATUS: OperationStatus = 'idle';

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
// STREAMING EVENT TYPE
// ============================================================================

export const STREAMING_EVENT_TYPES = ['start', 'chunk', 'complete', 'failed'] as const;

export const StreamingEventTypeSchema = z.enum(STREAMING_EVENT_TYPES).openapi({
  description: 'Streaming event lifecycle type',
  example: 'chunk',
});

export type StreamingEventType = z.infer<typeof StreamingEventTypeSchema>;

export const StreamingEventTypes = {
  START: 'start' as const,
  CHUNK: 'chunk' as const,
  COMPLETE: 'complete' as const,
  FAILED: 'failed' as const,
} as const;

// ============================================================================
// STREAM BUFFER STATUS (Resumable Streams)
// ============================================================================

export const STREAM_STATUSES = ['pending', 'initializing', 'streaming', 'completing', 'active', 'completed', 'failed', 'expired', 'timeout'] as const;

export const DEFAULT_STREAM_STATUS: StreamStatus = 'pending';

export const StreamStatusSchema = z.enum(STREAM_STATUSES).openapi({
  description: 'Stream buffer status for resumable AI SDK streams',
  example: 'streaming',
});

export type StreamStatus = z.infer<typeof StreamStatusSchema>;

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

export const PARTICIPANT_STREAM_STATUSES = ['active', 'completed', 'failed'] as const;

export const DEFAULT_PARTICIPANT_STREAM_STATUS: ParticipantStreamStatus = 'active';

export const ParticipantStreamStatusSchema = z.enum(PARTICIPANT_STREAM_STATUSES).openapi({
  description: 'Individual participant stream status within a round',
  example: 'active',
});

export type ParticipantStreamStatus = z.infer<typeof ParticipantStreamStatusSchema>;

export const ParticipantStreamStatuses = {
  ACTIVE: 'active' as const,
  COMPLETED: 'completed' as const,
  FAILED: 'failed' as const,
} as const;

// ============================================================================
// FLOW STATE (Chat conversation flow lifecycle)
// ============================================================================

export const FLOW_STATES = ['idle', 'creating_thread', 'streaming_participants', 'creating_moderator', 'streaming_moderator', 'completing', 'navigating', 'complete'] as const;

export const DEFAULT_FLOW_STATE: FlowState = 'idle';

export const FlowStateSchema = z.enum(FLOW_STATES).openapi({
  description: 'Chat conversation flow lifecycle state',
  example: 'streaming_participants',
});

export type FlowState = z.infer<typeof FlowStateSchema>;

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
// PENDING MESSAGE VALIDATION REASON
// ============================================================================

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

export const PendingMessageValidationReasonSchema = z.enum(PENDING_MESSAGE_VALIDATION_REASONS).openapi({
  description: 'Reason why pending message cannot be sent',
  example: 'waiting for pre-search',
});

export type PendingMessageValidationReason = z.infer<typeof PendingMessageValidationReasonSchema>;

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

/**
 * Round Phase - Current phase of a conversation round for resumption
 *
 * Order of phases in a complete round:
 * 1. pre_search - Web search is executing (if enabled)
 * 2. participants - AI participants are streaming responses
 * 3. moderator - Moderator message is being generated
 * 4. complete - All phases finished successfully
 *
 * Used by ThreadStreamResumptionState to determine where to resume.
 */
export const ROUND_PHASES = ['idle', 'pre_search', 'participants', 'moderator', 'complete'] as const;

export const DEFAULT_ROUND_PHASE: RoundPhase = 'idle';

export const RoundPhaseSchema = z.enum(ROUND_PHASES).openapi({
  description: 'Current phase of a conversation round for stream resumption',
  example: 'participants',
});

export type RoundPhase = z.infer<typeof RoundPhaseSchema>;

export const RoundPhases = {
  IDLE: 'idle' as const,
  PRE_SEARCH: 'pre_search' as const,
  PARTICIPANTS: 'participants' as const,
  MODERATOR: 'moderator' as const,
  COMPLETE: 'complete' as const,
} as const;
