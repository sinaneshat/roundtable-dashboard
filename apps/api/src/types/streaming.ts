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

import type { StreamPhase } from '@roundtable/shared/enums';
import {
  ParticipantStreamStatusSchema,
  SSEEventTypeSchema,
  StreamPhases,
  StreamStatusSchema,
} from '@roundtable/shared/enums';
import type { ExecutionContext } from 'hono';
import * as z from 'zod';

import type { ApiEnv } from '@/types';
import { TypedLoggerSchema } from '@/types/logger';

// ============================================================================
// CONSTANTS
// ============================================================================

export const STREAM_BUFFER_TTL_SECONDS = 60 * 60;

// ============================================================================
// STREAM CHUNK TYPES
// ============================================================================

export const StreamChunkSchema = z.object({
  data: z.string(),
  event: SSEEventTypeSchema.optional(),
  timestamp: z.number(),
});

export type StreamChunk = z.infer<typeof StreamChunkSchema>;

export const SSEChunkSchema = z.object({
  data: z.string(),
  event: z.string().optional(),
  timestamp: z.string(),
});

export type SSEChunk = z.infer<typeof SSEChunkSchema>;

export const SSEChunksArraySchema = z.array(SSEChunkSchema);

// ============================================================================
// STREAM METADATA TYPES
// ============================================================================

export const StreamBufferMetadataSchema = z.object({
  chunkCount: z.number(),
  completedAt: z.number().nullable(),
  createdAt: z.number(),
  errorMessage: z.string().nullable(),
  participantIndex: z.number(),
  roundNumber: z.number(),
  status: StreamStatusSchema,
  streamId: z.string(),
  threadId: z.string(),
});

export type StreamBufferMetadata = z.infer<typeof StreamBufferMetadataSchema>;

export const StreamMetadataSchema = z.object({
  chunkCount: z.number(),
  completedAt: z.string().optional(),
  createdAt: z.string(),
  errorMessage: z.string().optional(),
  participantIndex: z.number(),
  roundNumber: z.number(),
  status: StreamStatusSchema,
  streamId: z.string(),
  threadId: z.string(),
  updatedAt: z.string(),
});

export type StreamMetadata = z.infer<typeof StreamMetadataSchema>;

// ============================================================================
// RESUMABLE STREAM CONTEXT TYPES
// ============================================================================

export const ResumableStreamContextOptionsSchema = z.object({
  env: z.custom<ApiEnv['Bindings']>(),
  executionCtx: z.custom<ExecutionContext>().optional(),
  waitUntil: z.custom<(promise: Promise<unknown>) => void>(),
}).describe('Options for ResumableStreamContext');

export type ResumableStreamContextOptions = z.infer<typeof ResumableStreamContextOptionsSchema>;

export const ResumableStreamContextSchema = z.object({
  complete: z.custom<(streamId: string) => Promise<void>>(),
  createNewResumableStream: z.custom<(
    streamId: string,
    threadId: string,
    roundNumber: number,
    participantIndex: number,
    getStream: () => ReadableStream<string>,
  ) => Promise<void>>(),
  fail: z.custom<(streamId: string, error: string) => Promise<void>>(),
  getChunks: z.custom<(streamId: string) => Promise<StreamChunk[] | null>>(),
  getMetadata: z.custom<(streamId: string) => Promise<StreamBufferMetadata | null>>(),
  isStreamActive: z.custom<(streamId: string) => Promise<boolean>>(),
  resumeExistingStream: z.custom<(streamId: string) => Promise<ReadableStream<Uint8Array> | null>>(),
});

export type ResumableStreamContext = z.infer<typeof ResumableStreamContextSchema>;

// ============================================================================
// STREAM BUFFER SERVICE TYPES
// ============================================================================

export const InitializeStreamBufferParamsSchema = z.object({
  env: z.custom<ApiEnv['Bindings']>(),
  logger: TypedLoggerSchema.optional(),
  participantIndex: z.number(),
  roundNumber: z.number(),
  streamId: z.string(),
  threadId: z.string(),
});

export type InitializeStreamBufferParams = z.infer<typeof InitializeStreamBufferParamsSchema>;

export const AppendStreamChunkParamsSchema = z.object({
  chunk: StreamChunkSchema,
  env: z.custom<ApiEnv['Bindings']>(),
  logger: TypedLoggerSchema.optional(),
  streamId: z.string(),
});

export type AppendStreamChunkParams = z.infer<typeof AppendStreamChunkParamsSchema>;

export const CompleteStreamBufferParamsSchema = z.object({
  env: z.custom<ApiEnv['Bindings']>(),
  logger: TypedLoggerSchema.optional(),
  streamId: z.string(),
});

export type CompleteStreamBufferParams = z.infer<typeof CompleteStreamBufferParamsSchema>;

export const FailStreamBufferParamsSchema = z.object({
  env: z.custom<ApiEnv['Bindings']>(),
  errorMessage: z.string(),
  logger: TypedLoggerSchema.optional(),
  streamId: z.string(),
});

export type FailStreamBufferParams = z.infer<typeof FailStreamBufferParamsSchema>;

export const StreamResumeResultSchema = z.object({
  chunks: z.array(StreamChunkSchema),
  isComplete: z.boolean(),
  metadata: StreamBufferMetadataSchema.nullable(),
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
  chunkCount: z.number(),
  completedAt: z.number().nullable(),
  createdAt: z.number(),
  errorMessage: z.string().nullable(),
  moderatorId: z.string(),
  roundNumber: z.number(),
  status: StreamStatusSchema,
  streamId: z.string(),
  threadId: z.string(),
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
  data: z.string(),
  event: z.string(),
  index: z.number(),
  timestamp: z.number(),
});

export type PreSearchStreamChunk = z.infer<typeof PreSearchStreamChunkSchema>;

export const PreSearchStreamMetadataSchema = z.object({
  chunkCount: z.number(),
  completedAt: z.number().optional(),
  createdAt: z.number(),
  errorMessage: z.string().optional(),
  preSearchId: z.string(),
  roundNumber: z.number(),
  status: StreamStatusSchema,
  streamId: z.string(),
  threadId: z.string(),
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
  chunkCount: z.number(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
  errorMessage: z.string().nullable(),
  lastHeartbeatAt: z.string().nullable(),
  messageId: z.string().nullable(),
  participantIndex: z.number(),
  roundNumber: z.number(),
  status: StreamStatusSchema,
  threadId: z.string(),
});

export type StreamState = z.infer<typeof StreamStateSchema>;

export const ThreadActiveStreamSchema = z.object({
  /** Attachment IDs from the original request - shared across all participants in the round */
  attachmentIds: z.array(z.string()).optional(),
  createdAt: z.string(),
  participantIndex: z.number(),
  participantStatuses: z.record(z.string(), ParticipantStreamStatusSchema),
  roundNumber: z.number(),
  streamId: z.string(),
  totalParticipants: z.number(),
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

export const StreamPhaseMetadata: Record<StreamPhase, {
  label: string;
  order: number;
  prefix: string;
  isParallel: boolean;
}> = {
  [StreamPhases.MODERATOR]: {
    isParallel: false,
    label: 'Moderator',
    order: 2,
    prefix: 'moderator',
  },
  [StreamPhases.PARTICIPANT]: {
    isParallel: true,
    label: 'Participant',
    order: 1,
    prefix: 'participant',
  },
  [StreamPhases.PRESEARCH]: {
    isParallel: false,
    label: 'Pre-Search',
    order: 0,
    prefix: 'presearch',
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
  if (presearchMatch?.[1] && presearchMatch[2]) {
    return {
      phase: StreamPhases.PRESEARCH,
      roundNumber: Number.parseInt(presearchMatch[2], 10),
      threadId: presearchMatch[1],
    };
  }

  const participantMatch = streamId.match(/^(.+)_r(\d+)_participant_(\d+)$/);
  if (participantMatch?.[1] && participantMatch[2] && participantMatch[3]) {
    return {
      participantIndex: Number.parseInt(participantMatch[3], 10),
      phase: StreamPhases.PARTICIPANT,
      roundNumber: Number.parseInt(participantMatch[2], 10),
      threadId: participantMatch[1],
    };
  }

  const moderatorMatch = streamId.match(/^(.+)_r(\d+)_moderator$/);
  if (moderatorMatch?.[1] && moderatorMatch[2]) {
    return {
      phase: StreamPhases.MODERATOR,
      roundNumber: Number.parseInt(moderatorMatch[2], 10),
      threadId: moderatorMatch[1],
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
