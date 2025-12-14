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
 *
 * @see /docs/type-inference-patterns.md for type safety patterns
 */

import type { ExecutionContext } from 'hono';
import { z } from 'zod';

import { ParticipantStreamStatusSchema, StreamStatusSchema } from '@/api/core/enums';
import type { ApiEnv } from '@/api/types';
import type { TypedLogger } from '@/api/types/logger';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Stream buffer TTL - 1 hour
 * Streams exceeding this are considered stale and auto-expire
 */
export const STREAM_BUFFER_TTL_SECONDS = 60 * 60;

// ============================================================================
// STREAM CHUNK TYPES
// ============================================================================

/**
 * Stream chunk schema for SSE protocol (simple format)
 */
export const StreamChunkSchema = z.object({
  data: z.string(),
  timestamp: z.number(),
});

/** Stream chunk format for SSE protocol */
export type StreamChunk = z.infer<typeof StreamChunkSchema>;

/**
 * SSE chunk schema - AI SDK v5 protocol format (with event field)
 */
export const SSEChunkSchema = z.object({
  event: z.string().optional(),
  data: z.string(),
  timestamp: z.string(),
});

/** SSE chunk for AI SDK v5 protocol */
export type SSEChunk = z.infer<typeof SSEChunkSchema>;

/**
 * Array of SSE chunks schema
 */
export const SSEChunksArraySchema = z.array(SSEChunkSchema);

// ============================================================================
// STREAM METADATA TYPES
// ============================================================================

/**
 * Stream buffer metadata schema (for KV storage)
 */
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

/** Stream buffer metadata */
export type StreamBufferMetadata = z.infer<typeof StreamBufferMetadataSchema>;

/**
 * Stream metadata schema - validates KV stored data (ISO date strings)
 */
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

/** Stream metadata with ISO date strings */
export type StreamMetadata = z.infer<typeof StreamMetadataSchema>;

// ============================================================================
// RESUMABLE STREAM CONTEXT TYPES
// ============================================================================

/**
 * Options for creating a resumable stream context
 */
export type ResumableStreamContextOptions = {
  /**
   * Function to extend worker lifetime for background processing
   * In Cloudflare Workers: `ctx.waitUntil`
   * In Next.js: `after` from 'next/server'
   */
  waitUntil: (promise: Promise<unknown>) => void;
  /**
   * Cloudflare KV environment bindings
   */
  env: ApiEnv['Bindings'];
  /**
   * Optional execution context for accessing waitUntil
   */
  executionCtx?: ExecutionContext;
};

/**
 * Stream context returned by createResumableStreamContext
 */
export type ResumableStreamContext = {
  /**
   * Create a new resumable stream and start buffering
   */
  createNewResumableStream: (
    streamId: string,
    threadId: string,
    roundNumber: number,
    participantIndex: number,
    getStream: () => ReadableStream<string>,
  ) => Promise<void>;

  /**
   * Resume an existing stream from KV buffer
   */
  resumeExistingStream: (streamId: string) => Promise<ReadableStream<Uint8Array> | null>;

  /**
   * Check if a stream is active
   */
  isStreamActive: (streamId: string) => Promise<boolean>;

  /**
   * Get stream metadata
   */
  getMetadata: (streamId: string) => Promise<StreamBufferMetadata | null>;

  /**
   * Get all buffered chunks
   */
  getChunks: (streamId: string) => Promise<StreamChunk[] | null>;

  /**
   * Mark stream as complete
   */
  complete: (streamId: string) => Promise<void>;

  /**
   * Mark stream as failed
   */
  fail: (streamId: string, error: string) => Promise<void>;
};

// ============================================================================
// STREAM BUFFER SERVICE TYPES
// ============================================================================

/**
 * Parameters for initializing a stream buffer
 */
export type InitializeStreamBufferParams = {
  streamId: string;
  threadId: string;
  roundNumber: number;
  participantIndex: number;
  env: ApiEnv['Bindings'];
  logger?: TypedLogger;
};

/**
 * Parameters for appending to stream buffer
 */
export type AppendStreamChunkParams = {
  streamId: string;
  chunk: StreamChunk;
  env: ApiEnv['Bindings'];
  logger?: TypedLogger;
};

/**
 * Parameters for completing a stream buffer
 */
export type CompleteStreamBufferParams = {
  streamId: string;
  env: ApiEnv['Bindings'];
  logger?: TypedLogger;
};

/**
 * Parameters for failing a stream buffer
 */
export type FailStreamBufferParams = {
  streamId: string;
  errorMessage: string;
  env: ApiEnv['Bindings'];
  logger?: TypedLogger;
};

/**
 * Stream resume result
 */
export type StreamResumeResult = {
  chunks: StreamChunk[];
  metadata: StreamBufferMetadata | null;
  isComplete: boolean;
};

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard: Check if value is a StreamChunk
 */
export function isStreamChunk(value: unknown): value is StreamChunk {
  return StreamChunkSchema.safeParse(value).success;
}

/**
 * Type guard: Check if value is an SSEChunk
 */
export function isSSEChunk(value: unknown): value is SSEChunk {
  return SSEChunkSchema.safeParse(value).success;
}

/**
 * Type guard: Check if value is StreamBufferMetadata
 */
export function isStreamBufferMetadata(value: unknown): value is StreamBufferMetadata {
  return StreamBufferMetadataSchema.safeParse(value).success;
}

// ============================================================================
// ANALYSIS STREAM TYPES
// ============================================================================

/**
 * Analysis stream chunk schema
 * Used for object stream buffering (JSON being built incrementally)
 */
export const AnalysisStreamChunkSchema = z.object({
  data: z.string(),
  timestamp: z.number(),
});

/** Analysis stream chunk format */
export type AnalysisStreamChunk = z.infer<typeof AnalysisStreamChunkSchema>;

/**
 * Analysis stream buffer metadata schema
 */
export const AnalysisStreamBufferMetadataSchema = z.object({
  streamId: z.string(),
  threadId: z.string(),
  roundNumber: z.number(),
  analysisId: z.string(),
  status: StreamStatusSchema,
  chunkCount: z.number(),
  createdAt: z.number(),
  completedAt: z.number().nullable(),
  errorMessage: z.string().nullable(),
});

/** Analysis stream buffer metadata */
export type AnalysisStreamBufferMetadata = z.infer<typeof AnalysisStreamBufferMetadataSchema>;

/**
 * Type guard: Check if value is AnalysisStreamChunk
 */
export function isAnalysisStreamChunk(value: unknown): value is AnalysisStreamChunk {
  return AnalysisStreamChunkSchema.safeParse(value).success;
}

/**
 * Type guard: Check if value is AnalysisStreamBufferMetadata
 */
export function isAnalysisStreamBufferMetadata(value: unknown): value is AnalysisStreamBufferMetadata {
  return AnalysisStreamBufferMetadataSchema.safeParse(value).success;
}

// ============================================================================
// PRE-SEARCH STREAM TYPES
// ============================================================================

/**
 * Pre-search stream chunk schema
 * Used for SSE format (event: data\n\n)
 */
export const PreSearchStreamChunkSchema = z.object({
  index: z.number(),
  event: z.string(),
  data: z.string(),
  timestamp: z.number(),
});

/** Pre-search stream chunk format */
export type PreSearchStreamChunk = z.infer<typeof PreSearchStreamChunkSchema>;

/**
 * Pre-search stream metadata schema
 */
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

/** Pre-search stream metadata */
export type PreSearchStreamMetadata = z.infer<typeof PreSearchStreamMetadataSchema>;

/**
 * Type guard: Check if value is PreSearchStreamChunk
 */
export function isPreSearchStreamChunk(value: unknown): value is PreSearchStreamChunk {
  return PreSearchStreamChunkSchema.safeParse(value).success;
}

/**
 * Type guard: Check if value is PreSearchStreamMetadata
 */
export function isPreSearchStreamMetadata(value: unknown): value is PreSearchStreamMetadata {
  return PreSearchStreamMetadataSchema.safeParse(value).success;
}

// ============================================================================
// RESUMABLE STREAM KV TYPES (Moved from resumable-stream-kv.service.ts)
// ============================================================================

/**
 * Stream state schema stored in KV
 * ✅ FOLLOWS: 5-part enum pattern from /docs/type-inference-patterns.md
 */
export const StreamStateSchema = z.object({
  threadId: z.string(),
  roundNumber: z.number(),
  participantIndex: z.number(),
  status: StreamStatusSchema,
  messageId: z.string().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  errorMessage: z.string().nullable(),
  // Heartbeat tracking for dead stream detection
  lastHeartbeatAt: z.string().nullable(),
  chunkCount: z.number(),
});

/** Stream state type */
export type StreamState = z.infer<typeof StreamStateSchema>;

/**
 * Thread active stream schema stored at thread level
 * ✅ FOLLOWS: AI SDK documentation pattern for resumable streams
 */
export const ThreadActiveStreamSchema = z.object({
  streamId: z.string(),
  roundNumber: z.number(),
  participantIndex: z.number(),
  createdAt: z.string(),
  // Track round-level completion for proper resumption
  totalParticipants: z.number(),
  // ✅ Uses ParticipantStreamStatusSchema from core enums
  // Note: Zod records require string keys, number indices are stored as string keys in JSON
  participantStatuses: z.record(z.string(), ParticipantStreamStatusSchema),
});

/** Thread active stream type */
export type ThreadActiveStream = z.infer<typeof ThreadActiveStreamSchema>;

/**
 * Type guard: Check if value is StreamState
 */
export function isStreamState(value: unknown): value is StreamState {
  return StreamStateSchema.safeParse(value).success;
}

/**
 * Type guard: Check if value is ThreadActiveStream
 */
export function isThreadActiveStream(value: unknown): value is ThreadActiveStream {
  return ThreadActiveStreamSchema.safeParse(value).success;
}

// ============================================================================
// UNIFIED STREAM ID UTILITIES
// ============================================================================

/**
 * Stream phase identifiers for unified stream ID format
 * Used to identify which phase a stream belongs to from its ID
 */
export const STREAM_PHASES = ['presearch', 'participant', 'analyzer'] as const;
export type StreamPhase = (typeof STREAM_PHASES)[number];

/**
 * Unified stream ID format: {threadId}_r{roundNumber}_{phase}[_{index}]
 *
 * Examples:
 * - Pre-search: thread123_r0_presearch
 * - Participant 0: thread123_r0_participant_0
 * - Participant 1: thread123_r0_participant_1
 * - Analyzer: thread123_r0_analyzer
 *
 * This unifies the previously inconsistent formats:
 * - OLD pre-search: presearch_{threadId}_{roundNumber}_{timestamp}
 * - OLD participant: {threadId}_r{roundNumber}_p{participantIndex}
 * - OLD analyzer: analysis:{threadId}:r{roundNumber}
 */

/**
 * Generate unified stream ID for pre-search
 */
export function generatePreSearchStreamId(threadId: string, roundNumber: number): string {
  return `${threadId}_r${roundNumber}_presearch`;
}

/**
 * Generate unified stream ID for participant
 */
export function generateParticipantStreamId(threadId: string, roundNumber: number, participantIndex: number): string {
  return `${threadId}_r${roundNumber}_participant_${participantIndex}`;
}

/**
 * Generate unified stream ID for analyzer
 */
export function generateAnalyzerStreamId(threadId: string, roundNumber: number): string {
  return `${threadId}_r${roundNumber}_analyzer`;
}

/**
 * Parse stream ID to extract components
 * Returns null if stream ID doesn't match expected format
 */
export function parseStreamId(streamId: string): {
  threadId: string;
  roundNumber: number;
  phase: StreamPhase;
  participantIndex?: number;
} | null {
  // Pattern: {threadId}_r{roundNumber}_{phase}[_{index}]
  // Examples: thread123_r0_presearch, thread123_r0_participant_0, thread123_r0_analyzer

  // Match pre-search: {threadId}_r{roundNumber}_presearch
  const presearchMatch = streamId.match(/^(.+)_r(\d+)_presearch$/);
  if (presearchMatch) {
    return {
      threadId: presearchMatch[1]!,
      roundNumber: parseInt(presearchMatch[2]!, 10),
      phase: 'presearch',
    };
  }

  // Match participant: {threadId}_r{roundNumber}_participant_{index}
  const participantMatch = streamId.match(/^(.+)_r(\d+)_participant_(\d+)$/);
  if (participantMatch) {
    return {
      threadId: participantMatch[1]!,
      roundNumber: parseInt(participantMatch[2]!, 10),
      phase: 'participant',
      participantIndex: parseInt(participantMatch[3]!, 10),
    };
  }

  // Match analyzer: {threadId}_r{roundNumber}_analyzer
  const analyzerMatch = streamId.match(/^(.+)_r(\d+)_analyzer$/);
  if (analyzerMatch) {
    return {
      threadId: analyzerMatch[1]!,
      roundNumber: parseInt(analyzerMatch[2]!, 10),
      phase: 'analyzer',
    };
  }

  // Legacy format support: {threadId}_r{roundNumber}_p{participantIndex}
  const legacyParticipantMatch = streamId.match(/^(.+)_r(\d+)_p(\d+)$/);
  if (legacyParticipantMatch) {
    return {
      threadId: legacyParticipantMatch[1]!,
      roundNumber: parseInt(legacyParticipantMatch[2]!, 10),
      phase: 'participant',
      participantIndex: parseInt(legacyParticipantMatch[3]!, 10),
    };
  }

  return null;
}

/**
 * Get the phase from a stream ID
 * Returns null if stream ID doesn't match expected format
 */
export function getStreamPhase(streamId: string): StreamPhase | null {
  const parsed = parseStreamId(streamId);
  return parsed?.phase ?? null;
}

/**
 * Check if stream ID is for pre-search
 */
export function isPreSearchStreamId(streamId: string): boolean {
  return getStreamPhase(streamId) === 'presearch';
}

/**
 * Check if stream ID is for participant
 */
export function isParticipantStreamId(streamId: string): boolean {
  return getStreamPhase(streamId) === 'participant';
}

/**
 * Check if stream ID is for analyzer
 */
export function isAnalyzerStreamId(streamId: string): boolean {
  return getStreamPhase(streamId) === 'analyzer';
}

// ============================================================================
// SAFE PARSERS FOR KV DATA
// ============================================================================

/**
 * Safely parse StreamBufferMetadata from KV data
 * @returns Parsed metadata or null if invalid
 */
export function parseStreamBufferMetadata(data: unknown): StreamBufferMetadata | null {
  const result = StreamBufferMetadataSchema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Safely parse StreamChunk array from KV data
 * @returns Parsed chunks array or null if invalid
 */
export function parseStreamChunksArray(data: unknown): StreamChunk[] | null {
  const result = z.array(StreamChunkSchema).safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Safely parse AnalysisStreamBufferMetadata from KV data
 * @returns Parsed metadata or null if invalid
 */
export function parseAnalysisStreamBufferMetadata(data: unknown): AnalysisStreamBufferMetadata | null {
  const result = AnalysisStreamBufferMetadataSchema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Safely parse AnalysisStreamChunk array from KV data
 * @returns Parsed chunks array or null if invalid
 */
export function parseAnalysisStreamChunksArray(data: unknown): AnalysisStreamChunk[] | null {
  const result = z.array(AnalysisStreamChunkSchema).safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Safely parse PreSearchStreamMetadata from KV data
 * @returns Parsed metadata or null if invalid
 */
export function parsePreSearchStreamMetadata(data: unknown): PreSearchStreamMetadata | null {
  const result = PreSearchStreamMetadataSchema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Safely parse PreSearchStreamChunk array from KV data
 * @returns Parsed chunks array or null if invalid
 */
export function parsePreSearchStreamChunksArray(data: unknown): PreSearchStreamChunk[] | null {
  const result = z.array(PreSearchStreamChunkSchema).safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Safely parse StreamState from KV data
 * @returns Parsed state or null if invalid
 */
export function parseStreamState(data: unknown): StreamState | null {
  const result = StreamStateSchema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Safely parse ThreadActiveStream from KV data
 * @returns Parsed stream or null if invalid
 */
export function parseThreadActiveStream(data: unknown): ThreadActiveStream | null {
  const result = ThreadActiveStreamSchema.safeParse(data);
  return result.success ? result.data : null;
}
