/**
 * Streaming Types
 *
 * Consolidated type definitions for SSE streaming, stream buffering, and resumption.
 * SINGLE SOURCE OF TRUTH for streaming-related types across all services.
 *
 * Services using these types:
 * - stream-buffer.service.ts
 * - resumable-stream.service.ts
 * - resumable-stream-context.service.ts
 * - resumable-stream-kv.service.ts
 */

import type { ExecutionContext } from 'hono';
import { z } from 'zod';

import { ParticipantStreamStatusSchema, StreamStatusSchema } from '@/api/core/enums';
import type { ApiEnv } from '@/api/types';

// ============================================================================
// CONSTANTS
// ============================================================================

export const STREAM_BUFFER_TTL_SECONDS = 60 * 60;

// ============================================================================
// SSE EVENT TYPE CLASSIFICATION
// ============================================================================

// AI SDK v5 SSE line prefixes - event types
// Used to classify chunks for deduplication during stream resumption
export const SSE_EVENT_TYPES = [
  'text-delta', // 0: prefix - text content
  'reasoning-delta', // g: prefix - reasoning/thinking content
  'finish', // d: prefix - stream finish
  'error', // 3: prefix - error event
  'step-finish', // e: prefix - step completion
  'data', // 2: prefix - tool results, metadata
  'unknown', // unrecognized prefix
] as const;

export const SSEEventTypeSchema = z.enum(SSE_EVENT_TYPES);
export type SSEEventType = z.infer<typeof SSEEventTypeSchema>;

// Map AI SDK line prefixes to event types
// Keys are string prefixes extracted from SSE data lines
export const SSE_PREFIX_TO_EVENT = {
  0: 'text-delta',
  g: 'reasoning-delta',
  d: 'finish',
  3: 'error',
  e: 'step-finish',
  2: 'data',
} as const satisfies Record<string, SSEEventType>;

/**
 * Parse SSE event type from AI SDK v5 formatted data line
 * Format: `{prefix}:{json_content}` or `{prefix}:"{string_content}"`
 */
export function parseSSEEventType(data: string): SSEEventType {
  // Skip empty lines or lines without colon
  if (!data || !data.includes(':')) {
    return 'unknown';
  }

  // Extract prefix (everything before first colon)
  const colonIndex = data.indexOf(':');
  const prefix = data.substring(0, colonIndex);

  // Check if prefix is a known SSE event prefix
  if (prefix in SSE_PREFIX_TO_EVENT) {
    return SSE_PREFIX_TO_EVENT[prefix as keyof typeof SSE_PREFIX_TO_EVENT];
  }

  return 'unknown';
}

// ============================================================================
// STREAM CHUNK TYPES
// ============================================================================

export const StreamChunkSchema = z.object({
  data: z.string(),
  timestamp: z.number(),
  // ✅ FIX: Added event type to enable deduplication during stream resumption
  // Reasoning chunks can be filtered to prevent duplicate thinking tags
  event: SSEEventTypeSchema.optional(),
});

export type StreamChunk = z.infer<typeof StreamChunkSchema>;

export const SSEChunkSchema = z.object({
  event: z.string().optional(),
  data: z.string(),
  timestamp: z.string(),
});

export type SSEChunk = z.infer<typeof SSEChunkSchema>;

export const SSEChunksArraySchema = z.array(SSEChunkSchema);

// ============================================================================
// STREAM METADATA TYPES
// ============================================================================

export const StreamBufferMetadataSchema = z.object({
  streamId: z.string(),
  threadId: z.string(),
  roundNumber: z.number(),
  participantIndex: z.number(),
  status: StreamStatusSchema,
  chunkCount: z.number(),
  createdAt: z.number(),
  completedAt: z.number().nullable(),
  errorMessage: z.string().nullable(),
});

export type StreamBufferMetadata = z.infer<typeof StreamBufferMetadataSchema>;

export const StreamMetadataSchema = z.object({
  streamId: z.string(),
  threadId: z.string(),
  roundNumber: z.number(),
  participantIndex: z.number(),
  status: StreamStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().optional(),
  errorMessage: z.string().optional(),
  chunkCount: z.number(),
});

export type StreamMetadata = z.infer<typeof StreamMetadataSchema>;

// ============================================================================
// RESUMABLE STREAM CONTEXT TYPES
// ============================================================================

export const ResumableStreamContextOptionsSchema = z.object({
  waitUntil: z.function(),
  env: z.any(),
  executionCtx: z.any().optional(),
}).describe('Options for ResumableStreamContext');

export type ResumableStreamContextOptions = {
  waitUntil: (promise: Promise<unknown>) => void;
  env: ApiEnv['Bindings'];
  executionCtx?: ExecutionContext;
};

export type ResumableStreamContext = {
  createNewResumableStream: (
    streamId: string,
    threadId: string,
    roundNumber: number,
    participantIndex: number,
    getStream: () => ReadableStream<string>,
  ) => Promise<void>;

  resumeExistingStream: (streamId: string) => Promise<ReadableStream<Uint8Array> | null>;

  isStreamActive: (streamId: string) => Promise<boolean>;

  getMetadata: (streamId: string) => Promise<StreamBufferMetadata | null>;

  getChunks: (streamId: string) => Promise<StreamChunk[] | null>;

  complete: (streamId: string) => Promise<void>;

  fail: (streamId: string, error: string) => Promise<void>;
};

// ============================================================================
// STREAM BUFFER SERVICE TYPES
// ============================================================================

export const InitializeStreamBufferParamsSchema = z.object({
  streamId: z.string(),
  threadId: z.string(),
  roundNumber: z.number(),
  participantIndex: z.number(),
  env: z.any(),
  logger: z.any().optional(),
});

export type InitializeStreamBufferParams = z.infer<typeof InitializeStreamBufferParamsSchema>;

export const AppendStreamChunkParamsSchema = z.object({
  streamId: z.string(),
  chunk: StreamChunkSchema,
  env: z.any(),
  logger: z.any().optional(),
});

export type AppendStreamChunkParams = z.infer<typeof AppendStreamChunkParamsSchema>;

export const CompleteStreamBufferParamsSchema = z.object({
  streamId: z.string(),
  env: z.any(),
  logger: z.any().optional(),
});

export type CompleteStreamBufferParams = z.infer<typeof CompleteStreamBufferParamsSchema>;

export const FailStreamBufferParamsSchema = z.object({
  streamId: z.string(),
  errorMessage: z.string(),
  env: z.any(),
  logger: z.any().optional(),
});

export type FailStreamBufferParams = z.infer<typeof FailStreamBufferParamsSchema>;

export const StreamResumeResultSchema = z.object({
  chunks: z.array(StreamChunkSchema),
  metadata: StreamBufferMetadataSchema.nullable(),
  isComplete: z.boolean(),
});

export type StreamResumeResult = z.infer<typeof StreamResumeResultSchema>;

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isStreamChunk(value: unknown): value is StreamChunk {
  return StreamChunkSchema.safeParse(value).success;
}

export function isSSEChunk(value: unknown): value is SSEChunk {
  return SSEChunkSchema.safeParse(value).success;
}

export function isStreamBufferMetadata(value: unknown): value is StreamBufferMetadata {
  return StreamBufferMetadataSchema.safeParse(value).success;
}

// ============================================================================
// ROUND MODERATOR STREAM TYPES
// ============================================================================

export const ModeratorStreamChunkSchema = z.object({
  data: z.string(),
  timestamp: z.number(),
});

export type ModeratorStreamChunk = z.infer<typeof ModeratorStreamChunkSchema>;

export const ModeratorStreamBufferMetadataSchema = z.object({
  streamId: z.string(),
  threadId: z.string(),
  roundNumber: z.number(),
  moderatorId: z.string(),
  status: StreamStatusSchema,
  chunkCount: z.number(),
  createdAt: z.number(),
  completedAt: z.number().nullable(),
  errorMessage: z.string().nullable(),
});

export type ModeratorStreamBufferMetadata = z.infer<typeof ModeratorStreamBufferMetadataSchema>;

export function isModeratorStreamChunk(value: unknown): value is ModeratorStreamChunk {
  return ModeratorStreamChunkSchema.safeParse(value).success;
}

export function isModeratorStreamBufferMetadata(value: unknown): value is ModeratorStreamBufferMetadata {
  return ModeratorStreamBufferMetadataSchema.safeParse(value).success;
}

// ============================================================================
// PRE-SEARCH STREAM TYPES
// ============================================================================

export const PreSearchStreamChunkSchema = z.object({
  index: z.number(),
  event: z.string(),
  data: z.string(),
  timestamp: z.number(),
});

export type PreSearchStreamChunk = z.infer<typeof PreSearchStreamChunkSchema>;

export const PreSearchStreamMetadataSchema = z.object({
  streamId: z.string(),
  threadId: z.string(),
  roundNumber: z.number(),
  preSearchId: z.string(),
  status: StreamStatusSchema,
  chunkCount: z.number(),
  createdAt: z.number(),
  completedAt: z.number().optional(),
  errorMessage: z.string().optional(),
});

export type PreSearchStreamMetadata = z.infer<typeof PreSearchStreamMetadataSchema>;

export function isPreSearchStreamChunk(value: unknown): value is PreSearchStreamChunk {
  return PreSearchStreamChunkSchema.safeParse(value).success;
}

export function isPreSearchStreamMetadata(value: unknown): value is PreSearchStreamMetadata {
  return PreSearchStreamMetadataSchema.safeParse(value).success;
}

// ============================================================================
// RESUMABLE STREAM KV TYPES
// ============================================================================

export const StreamStateSchema = z.object({
  threadId: z.string(),
  roundNumber: z.number(),
  participantIndex: z.number(),
  status: StreamStatusSchema,
  messageId: z.string().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  errorMessage: z.string().nullable(),
  lastHeartbeatAt: z.string().nullable(),
  chunkCount: z.number(),
});

export type StreamState = z.infer<typeof StreamStateSchema>;

export const ThreadActiveStreamSchema = z.object({
  streamId: z.string(),
  roundNumber: z.number(),
  participantIndex: z.number(),
  createdAt: z.string(),
  totalParticipants: z.number(),
  participantStatuses: z.record(z.string(), ParticipantStreamStatusSchema),
});

export type ThreadActiveStream = z.infer<typeof ThreadActiveStreamSchema>;

export function isStreamState(value: unknown): value is StreamState {
  return StreamStateSchema.safeParse(value).success;
}

export function isThreadActiveStream(value: unknown): value is ThreadActiveStream {
  return ThreadActiveStreamSchema.safeParse(value).success;
}

// ============================================================================
// UNIFIED STREAM ID UTILITIES
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for stream phase values
export const STREAM_PHASES = ['presearch', 'participant', 'moderator'] as const;

// 3️⃣ ZOD SCHEMA - Runtime validation
export const StreamPhaseSchema = z.enum(STREAM_PHASES);

// 4️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type StreamPhase = z.infer<typeof StreamPhaseSchema>;

// 5️⃣ CONSTANT OBJECT - For usage in code (prevents typos)
export const StreamPhases = {
  PRESEARCH: 'presearch' as const,
  PARTICIPANT: 'participant' as const,
  MODERATOR: 'moderator' as const,
} as const;

// METADATA - Phase information and ordering
export const StreamPhaseMetadata: Record<StreamPhase, {
  label: string;
  order: number;
  prefix: string;
  isParallel: boolean;
}> = {
  [StreamPhases.PRESEARCH]: {
    label: 'Pre-Search',
    order: 0,
    prefix: 'presearch',
    isParallel: false,
  },
  [StreamPhases.PARTICIPANT]: {
    label: 'Participant',
    order: 1,
    prefix: 'participant',
    isParallel: true,
  },
  [StreamPhases.MODERATOR]: {
    label: 'Moderator',
    order: 2,
    prefix: 'moderator',
    isParallel: false,
  },
} as const;

export function generatePreSearchStreamId(threadId: string, roundNumber: number): string {
  return `${threadId}_r${roundNumber}_${StreamPhases.PRESEARCH}`;
}

export function generateParticipantStreamId(threadId: string, roundNumber: number, participantIndex: number): string {
  return `${threadId}_r${roundNumber}_${StreamPhases.PARTICIPANT}_${participantIndex}`;
}

export function generateModeratorStreamId(threadId: string, roundNumber: number): string {
  return `${threadId}_r${roundNumber}_${StreamPhases.MODERATOR}`;
}

export function parseStreamId(streamId: string): {
  threadId: string;
  roundNumber: number;
  phase: StreamPhase;
  participantIndex?: number;
} | null {
  const presearchMatch = streamId.match(/^(.+)_r(\d+)_presearch$/);
  if (presearchMatch) {
    return {
      threadId: presearchMatch[1]!,
      roundNumber: Number.parseInt(presearchMatch[2]!, 10),
      phase: StreamPhases.PRESEARCH,
    };
  }

  const participantMatch = streamId.match(/^(.+)_r(\d+)_participant_(\d+)$/);
  if (participantMatch) {
    return {
      threadId: participantMatch[1]!,
      roundNumber: Number.parseInt(participantMatch[2]!, 10),
      phase: StreamPhases.PARTICIPANT,
      participantIndex: Number.parseInt(participantMatch[3]!, 10),
    };
  }

  const moderatorMatch = streamId.match(/^(.+)_r(\d+)_moderator$/);
  if (moderatorMatch) {
    return {
      threadId: moderatorMatch[1]!,
      roundNumber: Number.parseInt(moderatorMatch[2]!, 10),
      phase: StreamPhases.MODERATOR,
    };
  }

  return null;
}

export function getStreamPhase(streamId: string): StreamPhase | null {
  const parsed = parseStreamId(streamId);
  return parsed?.phase ?? null;
}

export function isPreSearchStreamId(streamId: string): boolean {
  return getStreamPhase(streamId) === StreamPhases.PRESEARCH;
}

export function isParticipantStreamId(streamId: string): boolean {
  return getStreamPhase(streamId) === StreamPhases.PARTICIPANT;
}

export function isModeratorStreamId(streamId: string): boolean {
  return getStreamPhase(streamId) === StreamPhases.MODERATOR;
}

// ============================================================================
// SAFE PARSERS FOR KV DATA
// ============================================================================

export function parseStreamBufferMetadata(data: unknown): StreamBufferMetadata | null {
  const result = StreamBufferMetadataSchema.safeParse(data);
  return result.success ? result.data : null;
}

export function parseStreamChunksArray(data: unknown): StreamChunk[] | null {
  const result = z.array(StreamChunkSchema).safeParse(data);
  return result.success ? result.data : null;
}

export function parseModeratorStreamBufferMetadata(data: unknown): ModeratorStreamBufferMetadata | null {
  const result = ModeratorStreamBufferMetadataSchema.safeParse(data);
  return result.success ? result.data : null;
}

export function parseModeratorStreamChunksArray(data: unknown): ModeratorStreamChunk[] | null {
  const result = z.array(ModeratorStreamChunkSchema).safeParse(data);
  return result.success ? result.data : null;
}

export function parsePreSearchStreamMetadata(data: unknown): PreSearchStreamMetadata | null {
  const result = PreSearchStreamMetadataSchema.safeParse(data);
  return result.success ? result.data : null;
}

export function parsePreSearchStreamChunksArray(data: unknown): PreSearchStreamChunk[] | null {
  const result = z.array(PreSearchStreamChunkSchema).safeParse(data);
  return result.success ? result.data : null;
}

export function parseStreamState(data: unknown): StreamState | null {
  const result = StreamStateSchema.safeParse(data);
  return result.success ? result.data : null;
}

export function parseThreadActiveStream(data: unknown): ThreadActiveStream | null {
  const result = ThreadActiveStreamSchema.safeParse(data);
  return result.success ? result.data : null;
}
