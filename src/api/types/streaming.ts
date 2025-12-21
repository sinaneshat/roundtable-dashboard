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
import type { TypedLogger } from '@/api/types/logger';

// ============================================================================
// CONSTANTS
// ============================================================================

export const STREAM_BUFFER_TTL_SECONDS = 60 * 60;

// ============================================================================
// STREAM CHUNK TYPES
// ============================================================================

export const StreamChunkSchema = z.object({
  data: z.string(),
  timestamp: z.number(),
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

export type InitializeStreamBufferParams = {
  streamId: string;
  threadId: string;
  roundNumber: number;
  participantIndex: number;
  env: ApiEnv['Bindings'];
  logger?: TypedLogger;
};

export type AppendStreamChunkParams = {
  streamId: string;
  chunk: StreamChunk;
  env: ApiEnv['Bindings'];
  logger?: TypedLogger;
};

export type CompleteStreamBufferParams = {
  streamId: string;
  env: ApiEnv['Bindings'];
  logger?: TypedLogger;
};

export type FailStreamBufferParams = {
  streamId: string;
  errorMessage: string;
  env: ApiEnv['Bindings'];
  logger?: TypedLogger;
};

export type StreamResumeResult = {
  chunks: StreamChunk[];
  metadata: StreamBufferMetadata | null;
  isComplete: boolean;
};

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
