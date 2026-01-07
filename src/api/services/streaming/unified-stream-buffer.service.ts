/**
 * Unified Stream Buffer Service - Cloudflare KV-based SSE stream buffering
 *
 * **BACKEND SERVICE**: Enables stream resumption after page reload for all stream types
 * Following backend-patterns.md: Service layer for streaming infrastructure
 *
 * **PURPOSE**:
 * - Buffer SSE chunks from AI SDK streams (participant, moderator) into Cloudflare KV
 * - Buffer SSE events from pre-search streams into Cloudflare KV
 * - Enable resumption after page reload/connection loss
 * - Compatible with AI SDK v6 `consumeSseStream` callback
 *
 * **ARCHITECTURE**:
 * - Discriminated by stream phase (participant, moderator, pre-search)
 * - Chunks stored as individual KV keys (O(1) memory, no array accumulation)
 * - Metadata tracks chunk count and stream status
 * - Automatic cleanup on stream completion with 1-hour TTL
 *
 * **INTEGRATION**:
 * - Called from streaming handlers via callbacks
 * - Frontend resumes via GET endpoints checking KV for active streams
 *
 * @module api/services/unified-stream-buffer
 * @see /src/api/types/streaming.ts for type definitions
 */

import { FinishReasons, LogTypes, StreamPhases, StreamStatuses } from '@/api/core/enums';
import type { ApiEnv } from '@/api/types';
import type { TypedLogger } from '@/api/types/logger';
import { LogHelpers } from '@/api/types/logger';
import type {
  ModeratorStreamBufferMetadata,
  ModeratorStreamChunk,
  PreSearchStreamChunk,
  PreSearchStreamMetadata,
  StreamBufferMetadata,
  StreamChunk,
} from '@/api/types/streaming';
import {
  ModeratorStreamBufferMetadataSchema,
  parseSSEEventType,
  parseStreamBufferMetadata,
  PreSearchStreamChunkSchema,
  PreSearchStreamMetadataSchema,
  STREAM_BUFFER_TTL_SECONDS,
  StreamChunkSchema,
} from '@/api/types/streaming';

// ============================================================================
// KV KEY GENERATION - DISCRIMINATED BY STREAM PHASE
// ============================================================================

function getMetadataKey(streamId: string): string {
  return `stream:buffer:${streamId}:meta`;
}

function getChunkKey(streamId: string, index: number): string {
  return `stream:buffer:${streamId}:c:${index}`;
}

function getActiveKey(
  threadId: string,
  roundNumber: number,
  discriminator: string,
): string {
  return `stream:active:${threadId}:r${roundNumber}:${discriminator}`;
}

// ============================================================================
// PARTICIPANT STREAM BUFFER OPERATIONS
// ============================================================================

export async function initializeParticipantStreamBuffer(
  streamId: string,
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  if (!env?.KV) {
    logger?.warn('KV not available - skipping stream buffer initialization', LogHelpers.operation({
      operationName: 'initializeParticipantStreamBuffer',
      streamId,
      edgeCase: 'kv_not_available',
    }));
    return;
  }

  try {
    const metadata: StreamBufferMetadata = {
      streamId,
      threadId,
      roundNumber,
      participantIndex,
      status: StreamStatuses.ACTIVE,
      chunkCount: 0,
      createdAt: Date.now(),
      completedAt: null,
      errorMessage: null,
    };

    await env.KV.put(getMetadataKey(streamId), JSON.stringify(metadata), {
      expirationTtl: STREAM_BUFFER_TTL_SECONDS,
    });

    await env.KV.put(
      getActiveKey(threadId, roundNumber, `p${participantIndex}`),
      streamId,
      { expirationTtl: STREAM_BUFFER_TTL_SECONDS },
    );

    logger?.info('Initialized participant stream buffer', LogHelpers.operation({
      operationName: 'initializeParticipantStreamBuffer',
      streamId,
      threadId,
      roundNumber,
      participantIndex,
    }));
  } catch (error) {
    logger?.error('Failed to initialize participant stream buffer', LogHelpers.operation({
      operationName: 'initializeParticipantStreamBuffer',
      streamId,
      error: error instanceof Error ? error.message : 'Unknown error',
    }));
    throw error;
  }
}

export async function appendParticipantStreamChunk(
  streamId: string,
  data: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  if (!env?.KV) {
    return;
  }

  try {
    const chunk: StreamChunk = {
      data,
      timestamp: Date.now(),
      event: parseSSEEventType(data),
    };

    const metadataKey = getMetadataKey(streamId);
    const metadata = parseStreamBufferMetadata(await env.KV.get(metadataKey, 'json'));

    if (!metadata) {
      logger?.warn('Stream metadata not found during chunk append', LogHelpers.operation({
        operationName: 'appendParticipantStreamChunk',
        streamId,
        edgeCase: 'metadata_not_found',
      }));
      return;
    }

    const chunkIndex = metadata.chunkCount;

    await env.KV.put(
      getChunkKey(streamId, chunkIndex),
      JSON.stringify(chunk),
      { expirationTtl: STREAM_BUFFER_TTL_SECONDS },
    );

    metadata.chunkCount = chunkIndex + 1;
    await env.KV.put(metadataKey, JSON.stringify(metadata), {
      expirationTtl: STREAM_BUFFER_TTL_SECONDS,
    });
  } catch (error) {
    logger?.error('Failed to append participant stream chunk', LogHelpers.operation({
      operationName: 'appendParticipantStreamChunk',
      streamId,
      chunkDataLength: data.length,
      error: error instanceof Error ? error.message : 'Unknown error',
    }));
  }
}

export async function completeParticipantStreamBuffer(
  streamId: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  if (!env?.KV) {
    return;
  }

  try {
    const metadataKey = getMetadataKey(streamId);
    const metadata = parseStreamBufferMetadata(await env.KV.get(metadataKey, 'json'));

    if (!metadata) {
      logger?.warn('Stream metadata not found during completion', LogHelpers.operation({
        operationName: 'completeParticipantStreamBuffer',
        streamId,
        edgeCase: 'metadata_not_found',
      }));
      return;
    }

    const updatedMetadata: StreamBufferMetadata = {
      ...metadata,
      status: StreamStatuses.COMPLETED,
      completedAt: Date.now(),
    };

    await env.KV.put(metadataKey, JSON.stringify(updatedMetadata), {
      expirationTtl: STREAM_BUFFER_TTL_SECONDS,
    });

    logger?.info('Completed participant stream buffer', LogHelpers.operation({
      operationName: 'completeParticipantStreamBuffer',
      streamId,
      chunkCount: updatedMetadata.chunkCount,
    }));
  } catch (error) {
    logger?.error('Failed to complete participant stream buffer', LogHelpers.operation({
      operationName: 'completeParticipantStreamBuffer',
      streamId,
      error: error instanceof Error ? error.message : 'Unknown error',
    }));
  }
}

export async function failParticipantStreamBuffer(
  streamId: string,
  errorMessage: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  if (!env?.KV) {
    return;
  }

  try {
    const metadataKey = getMetadataKey(streamId);
    const metadata = parseStreamBufferMetadata(await env.KV.get(metadataKey, 'json'));

    if (!metadata) {
      logger?.warn('Stream metadata not found during failure', LogHelpers.operation({
        operationName: 'failParticipantStreamBuffer',
        streamId,
        edgeCase: 'metadata_not_found',
      }));
      return;
    }

    const errorChunk: StreamChunk = {
      data: `3:${JSON.stringify({ error: errorMessage })}`,
      timestamp: Date.now(),
      event: 'error',
    };

    const errorChunkIndex = metadata.chunkCount;
    await env.KV.put(
      getChunkKey(streamId, errorChunkIndex),
      JSON.stringify(errorChunk),
      { expirationTtl: STREAM_BUFFER_TTL_SECONDS },
    );

    const updatedMetadata: StreamBufferMetadata = {
      ...metadata,
      status: StreamStatuses.FAILED,
      completedAt: Date.now(),
      errorMessage,
      chunkCount: errorChunkIndex + 1,
    };

    await env.KV.put(metadataKey, JSON.stringify(updatedMetadata), {
      expirationTtl: STREAM_BUFFER_TTL_SECONDS,
    });

    logger?.info('Marked participant stream buffer as failed', LogHelpers.operation({
      operationName: 'failParticipantStreamBuffer',
      streamId,
      errorMessage,
    }));
  } catch (error) {
    logger?.error('Failed to mark participant stream as failed', LogHelpers.operation({
      operationName: 'failParticipantStreamBuffer',
      streamId,
      error: error instanceof Error ? error.message : 'Unknown error',
    }));
  }
}

export async function getActiveParticipantStreamId(
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<string | null> {
  if (!env?.KV) {
    return null;
  }

  try {
    const streamId = await env.KV.get(
      getActiveKey(threadId, roundNumber, `p${participantIndex}`),
      'text',
    );

    if (streamId) {
      logger?.info('Found active participant stream', LogHelpers.operation({
        operationName: 'getActiveParticipantStreamId',
        threadId,
        roundNumber,
        participantIndex,
        streamId,
      }));
    }

    return streamId;
  } catch (error) {
    logger?.error('Failed to get active participant stream ID', LogHelpers.operation({
      operationName: 'getActiveParticipantStreamId',
      threadId,
      roundNumber,
      participantIndex,
      error: error instanceof Error ? error.message : 'Unknown error',
    }));
    return null;
  }
}

export async function getParticipantStreamMetadata(
  streamId: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<StreamBufferMetadata | null> {
  if (!env?.KV) {
    return null;
  }

  try {
    const metadata = parseStreamBufferMetadata(await env.KV.get(getMetadataKey(streamId), 'json'));

    if (metadata) {
      logger?.info('Retrieved participant stream metadata', LogHelpers.operation({
        operationName: 'getParticipantStreamMetadata',
        streamId,
        status: metadata.status,
        chunkCount: metadata.chunkCount,
      }));
    }

    return metadata;
  } catch (error) {
    logger?.error('Failed to get participant stream metadata', LogHelpers.operation({
      operationName: 'getParticipantStreamMetadata',
      streamId,
      error: error instanceof Error ? error.message : 'Unknown error',
    }));
    return null;
  }
}

export async function getParticipantStreamChunks(
  streamId: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<StreamChunk[] | null> {
  if (!env?.KV) {
    return null;
  }

  try {
    const metadata = parseStreamBufferMetadata(await env.KV.get(getMetadataKey(streamId), 'json'));

    if (!metadata) {
      return null;
    }

    if (metadata.chunkCount === 0) {
      return [];
    }

    const BATCH_SIZE = 100;
    const chunks: StreamChunk[] = [];

    for (let batchStart = 0; batchStart < metadata.chunkCount; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, metadata.chunkCount);
      const batchPromises: Promise<string | null>[] = [];

      for (let i = batchStart; i < batchEnd; i++) {
        batchPromises.push(env.KV.get(getChunkKey(streamId, i), 'text'));
      }

      const batchResults = await Promise.all(batchPromises);

      for (const result of batchResults) {
        if (result) {
          const parseResult = StreamChunkSchema.safeParse(JSON.parse(result));
          if (parseResult.success) {
            chunks.push(parseResult.data);
          }
        }
      }
    }

    if (chunks.length > 0) {
      logger?.info('Retrieved participant stream chunks', LogHelpers.operation({
        operationName: 'getParticipantStreamChunks',
        streamId,
        chunkCount: chunks.length,
      }));
    }

    return chunks;
  } catch (error) {
    logger?.error('Failed to get participant stream chunks', LogHelpers.operation({
      operationName: 'getParticipantStreamChunks',
      streamId,
      error: error instanceof Error ? error.message : 'Unknown error',
    }));
    return null;
  }
}

export async function clearActiveParticipantStream(
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  if (!env?.KV) {
    return;
  }

  try {
    await env.KV.delete(getActiveKey(threadId, roundNumber, `p${participantIndex}`));

    logger?.info('Cleared active participant stream tracking', LogHelpers.operation({
      operationName: 'clearActiveParticipantStream',
      threadId,
      roundNumber,
      participantIndex,
    }));
  } catch (error) {
    logger?.warn('Failed to clear active participant stream', LogHelpers.operation({
      operationName: 'clearActiveParticipantStream',
      threadId,
      roundNumber,
      participantIndex,
      edgeCase: 'clear_failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    }));
  }
}

export async function deleteParticipantStreamBuffer(
  streamId: string,
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  if (!env?.KV) {
    return;
  }

  try {
    const metadata = parseStreamBufferMetadata(await env.KV.get(getMetadataKey(streamId), 'json'));
    const chunkCount = metadata?.chunkCount || 0;

    const BATCH_SIZE = 50;
    for (let batchStart = 0; batchStart < chunkCount; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, chunkCount);
      const deletePromises: Promise<void>[] = [];

      for (let i = batchStart; i < batchEnd; i++) {
        deletePromises.push(env.KV.delete(getChunkKey(streamId, i)));
      }

      await Promise.all(deletePromises);
    }

    await Promise.all([
      env.KV.delete(getMetadataKey(streamId)),
      env.KV.delete(getActiveKey(threadId, roundNumber, `p${participantIndex}`)),
    ]);

    logger?.info(`Deleted participant stream buffer with ${chunkCount} chunks`, LogHelpers.operation({
      operationName: 'deleteParticipantStreamBuffer',
      streamId,
    }));
  } catch (error) {
    logger?.warn('Failed to delete participant stream buffer', LogHelpers.operation({
      operationName: 'deleteParticipantStreamBuffer',
      streamId,
      edgeCase: 'delete_failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    }));
  }
}

export type ResumeStreamOptions = {
  pollIntervalMs?: number;
  maxPollDurationMs?: number;
  noNewDataTimeoutMs?: number;
  filterReasoningOnReplay?: boolean;
  startFromChunkIndex?: number;
};

export function createLiveParticipantResumeStream(
  streamId: string,
  env: ApiEnv['Bindings'],
  options: ResumeStreamOptions = {},
): ReadableStream<Uint8Array> {
  const {
    pollIntervalMs = 100,
    maxPollDurationMs = 5 * 60 * 1000,
    noNewDataTimeoutMs = 30 * 1000,
    filterReasoningOnReplay = false,
    startFromChunkIndex = 0,
  } = options;
  const encoder = new TextEncoder();
  let isClosed = false;

  const safeClose = (
    controller: ReadableStreamDefaultController<Uint8Array>,
  ) => {
    if (isClosed) {
      return;
    }
    try {
      isClosed = true;
      controller.close();
    } catch {
      // Controller already closed
    }
  };

  const safeEnqueue = (
    controller: ReadableStreamDefaultController<Uint8Array>,
    data: Uint8Array,
  ) => {
    if (isClosed) {
      return false;
    }
    try {
      controller.enqueue(data);
      return true;
    } catch {
      isClosed = true;
      return false;
    }
  };

  return new ReadableStream({
    async start(controller) {
      let lastChunkIndex = startFromChunkIndex;
      const startTime = Date.now();
      let lastNewDataTime = Date.now();

      const shouldSendChunk = (chunk: { data: string; event?: string }): boolean => {
        if (!filterReasoningOnReplay)
          return true;
        return chunk.event !== 'reasoning-delta';
      };

      try {
        const initialChunks = await getParticipantStreamChunks(streamId, env);
        if (initialChunks && initialChunks.length > startFromChunkIndex) {
          for (let i = startFromChunkIndex; i < initialChunks.length; i++) {
            const chunk = initialChunks[i];
            if (chunk && shouldSendChunk(chunk)) {
              if (!safeEnqueue(controller, encoder.encode(chunk.data))) {
                return;
              }
            }
          }
          lastChunkIndex = initialChunks.length;
          lastNewDataTime = Date.now();
        }

        const initialMetadata = await getParticipantStreamMetadata(streamId, env);
        if (
          initialMetadata?.status === StreamStatuses.COMPLETED
          || initialMetadata?.status === StreamStatuses.FAILED
        ) {
          safeClose(controller);
          return;
        }

        // eslint-disable-next-line no-unmodified-loop-condition
        while (!isClosed) {
          if (Date.now() - startTime > maxPollDurationMs) {
            safeClose(controller);
            return;
          }

          const chunks = await getParticipantStreamChunks(streamId, env);
          const metadata = await getParticipantStreamMetadata(streamId, env);

          if (chunks && chunks.length > lastChunkIndex) {
            for (let i = lastChunkIndex; i < chunks.length; i++) {
              const chunk = chunks[i];
              if (chunk && shouldSendChunk(chunk)) {
                if (!safeEnqueue(controller, encoder.encode(chunk.data))) {
                  return;
                }
              }
            }
            lastChunkIndex = chunks.length;
            lastNewDataTime = Date.now();
          }

          if (
            metadata?.status === StreamStatuses.COMPLETED
            || metadata?.status === StreamStatuses.FAILED
          ) {
            safeClose(controller);
            return;
          }

          const timeSinceLastNewData = Date.now() - lastNewDataTime;
          if (timeSinceLastNewData > noNewDataTimeoutMs) {
            const syntheticFinish = `data: {"type":"finish","finishReason":"${FinishReasons.UNKNOWN}","usage":{"promptTokens":0,"completionTokens":0}}\n\n`;
            safeEnqueue(controller, encoder.encode(syntheticFinish));
            safeClose(controller);
            return;
          }

          await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
        }
      } catch {
        safeClose(controller);
      }
    },

    cancel() {
      isClosed = true;
    },
  });
}

// ============================================================================
// PRE-SEARCH STREAM BUFFER OPERATIONS
// ============================================================================

export async function initializePreSearchStreamBuffer(
  streamId: string,
  threadId: string,
  roundNumber: number,
  preSearchId: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  if (!env?.KV) {
    logger?.debug('KV not available, skipping pre-search stream buffer init');
    return;
  }

  try {
    const metadata: PreSearchStreamMetadata = {
      streamId,
      threadId,
      roundNumber,
      preSearchId,
      status: StreamStatuses.ACTIVE,
      chunkCount: 0,
      createdAt: Date.now(),
    };

    await Promise.all([
      env.KV.put(getMetadataKey(streamId), JSON.stringify(metadata), {
        expirationTtl: STREAM_BUFFER_TTL_SECONDS,
      }),
      env.KV.put(getActiveKey(threadId, roundNumber, StreamPhases.PRESEARCH), streamId, {
        expirationTtl: STREAM_BUFFER_TTL_SECONDS,
      }),
    ]);

    logger?.debug('Initialized pre-search stream buffer', {
      logType: LogTypes.OPERATION,
      operationName: 'initializePreSearchStreamBuffer',
      streamId,
      threadId,
      roundNumber,
    });
  } catch (error) {
    logger?.warn('Failed to initialize pre-search stream buffer', {
      logType: LogTypes.EDGE_CASE,
      scenario: 'pre_search_buffer_init_failed',
      streamId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export async function appendPreSearchStreamChunk(
  streamId: string,
  event: string,
  data: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  if (!env?.KV) {
    return;
  }

  try {
    const metadataKey = getMetadataKey(streamId);
    const rawMetadata = await env.KV.get(metadataKey, 'json');
    const metadataResult = PreSearchStreamMetadataSchema.safeParse(rawMetadata);

    if (!metadataResult.success) {
      logger?.warn('Stream metadata not found during chunk append', {
        logType: LogTypes.EDGE_CASE,
        scenario: 'pre_search_metadata_not_found',
        streamId,
      });
      return;
    }

    const metadata = metadataResult.data;
    const chunkIndex = metadata.chunkCount;

    const newChunk: PreSearchStreamChunk = {
      index: chunkIndex,
      event,
      data,
      timestamp: Date.now(),
    };

    await env.KV.put(
      getChunkKey(streamId, chunkIndex),
      JSON.stringify(newChunk),
      { expirationTtl: STREAM_BUFFER_TTL_SECONDS },
    );

    const updatedMetadata = { ...metadata, chunkCount: chunkIndex + 1 };
    await env.KV.put(metadataKey, JSON.stringify(updatedMetadata), {
      expirationTtl: STREAM_BUFFER_TTL_SECONDS,
    });
  } catch (error) {
    logger?.warn('Failed to append pre-search stream chunk', {
      logType: LogTypes.EDGE_CASE,
      scenario: 'pre_search_chunk_append_failed',
      streamId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export async function completePreSearchStreamBuffer(
  streamId: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  if (!env?.KV) {
    return;
  }

  try {
    const metadataKey = getMetadataKey(streamId);
    const raw = await env.KV.get(metadataKey, 'json');
    const result = PreSearchStreamMetadataSchema.safeParse(raw);

    if (!result.success) {
      return;
    }

    const metadata = {
      ...result.data,
      status: StreamStatuses.COMPLETED,
      completedAt: Date.now(),
    };

    await env.KV.put(metadataKey, JSON.stringify(metadata), {
      expirationTtl: STREAM_BUFFER_TTL_SECONDS,
    });

    logger?.debug('Completed pre-search stream buffer', {
      logType: LogTypes.OPERATION,
      operationName: 'completePreSearchStreamBuffer',
      streamId,
    });
  } catch (error) {
    logger?.warn('Failed to complete pre-search stream buffer', {
      logType: LogTypes.EDGE_CASE,
      scenario: 'pre_search_buffer_complete_failed',
      streamId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export async function failPreSearchStreamBuffer(
  streamId: string,
  errorMessage: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  if (!env?.KV) {
    return;
  }

  try {
    const metadataKey = getMetadataKey(streamId);
    const raw = await env.KV.get(metadataKey, 'json');
    const result = PreSearchStreamMetadataSchema.safeParse(raw);

    if (!result.success) {
      return;
    }

    const metadata = {
      ...result.data,
      status: StreamStatuses.FAILED,
      completedAt: Date.now(),
      errorMessage,
    };

    await env.KV.put(metadataKey, JSON.stringify(metadata), {
      expirationTtl: STREAM_BUFFER_TTL_SECONDS,
    });

    logger?.debug('Failed pre-search stream buffer', {
      logType: LogTypes.OPERATION,
      operationName: 'failPreSearchStreamBuffer',
      streamId,
      errorMessage,
    });
  } catch (error) {
    logger?.warn('Failed to fail pre-search stream buffer', {
      logType: LogTypes.EDGE_CASE,
      scenario: 'pre_search_buffer_fail_failed',
      streamId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export async function clearActivePreSearchStream(
  threadId: string,
  roundNumber: number,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  if (!env?.KV) {
    return;
  }

  try {
    await env.KV.delete(getActiveKey(threadId, roundNumber, StreamPhases.PRESEARCH));
    logger?.debug('Cleared active pre-search stream', {
      logType: LogTypes.OPERATION,
      operationName: 'clearActivePreSearchStream',
      threadId,
      roundNumber,
    });
  } catch (error) {
    logger?.warn('Failed to clear active pre-search stream', {
      logType: LogTypes.EDGE_CASE,
      scenario: 'pre_search_clear_failed',
      threadId,
      roundNumber,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export async function getActivePreSearchStreamId(
  threadId: string,
  roundNumber: number,
  env: ApiEnv['Bindings'],
): Promise<string | null> {
  if (!env?.KV) {
    return null;
  }

  try {
    return await env.KV.get(getActiveKey(threadId, roundNumber, StreamPhases.PRESEARCH));
  } catch {
    return null;
  }
}

export async function getPreSearchStreamMetadata(
  streamId: string,
  env: ApiEnv['Bindings'],
): Promise<PreSearchStreamMetadata | null> {
  if (!env?.KV) {
    return null;
  }

  try {
    const raw = await env.KV.get(getMetadataKey(streamId), 'json');
    const result = PreSearchStreamMetadataSchema.safeParse(raw);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export async function getPreSearchStreamChunks(
  streamId: string,
  env: ApiEnv['Bindings'],
): Promise<PreSearchStreamChunk[] | null> {
  if (!env?.KV) {
    return null;
  }

  try {
    const metadata = await getPreSearchStreamMetadata(streamId, env);

    if (!metadata) {
      return null;
    }

    if (metadata.chunkCount === 0) {
      return [];
    }

    const BATCH_SIZE = 50;
    const chunks: PreSearchStreamChunk[] = [];

    for (let batchStart = 0; batchStart < metadata.chunkCount; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, metadata.chunkCount);
      const batchPromises: Promise<string | null>[] = [];

      for (let i = batchStart; i < batchEnd; i++) {
        batchPromises.push(env.KV.get(getChunkKey(streamId, i), 'text'));
      }

      const batchResults = await Promise.all(batchPromises);

      for (const result of batchResults) {
        if (result) {
          const parseResult = PreSearchStreamChunkSchema.safeParse(JSON.parse(result));
          if (parseResult.success) {
            chunks.push(parseResult.data);
          }
        }
      }
    }

    return chunks;
  } catch {
    return null;
  }
}

export async function isPreSearchBufferStale(
  streamId: string,
  env: ApiEnv['Bindings'],
  maxStaleMs = 5_000,
): Promise<boolean> {
  if (!env?.KV) {
    return true;
  }

  try {
    const chunks = await getPreSearchStreamChunks(streamId, env);

    if (!chunks || chunks.length === 0) {
      return true;
    }

    const lastChunk = chunks[chunks.length - 1];
    if (!lastChunk?.timestamp) {
      return true;
    }

    const timeSinceLastChunk = Date.now() - lastChunk.timestamp;
    return timeSinceLastChunk > maxStaleMs;
  } catch {
    return true;
  }
}

export function createLivePreSearchResumeStream(
  streamId: string,
  env: ApiEnv['Bindings'],
  pollIntervalMs = 100,
  maxPollDurationMs = 5 * 60 * 1000,
  noNewDataTimeoutMs = 5 * 1000,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let isClosed = false;

  const safeClose = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    if (isClosed) {
      return;
    }
    try {
      isClosed = true;
      controller.close();
    } catch {
      // Controller already closed
    }
  };

  const safeEnqueue = (controller: ReadableStreamDefaultController<Uint8Array>, data: Uint8Array) => {
    if (isClosed) {
      return false;
    }
    try {
      controller.enqueue(data);
      return true;
    } catch {
      isClosed = true;
      return false;
    }
  };

  return new ReadableStream({
    async start(controller) {
      let lastChunkIndex = 0;
      const startTime = Date.now();
      let lastNewDataTime = Date.now();

      try {
        const initialChunks = await getPreSearchStreamChunks(streamId, env);
        if (initialChunks && initialChunks.length > 0) {
          for (const chunk of initialChunks) {
            const sseData = `event: ${chunk.event}\ndata: ${chunk.data}\n\n`;
            if (!safeEnqueue(controller, encoder.encode(sseData))) {
              return;
            }
          }
          lastChunkIndex = initialChunks.length;
          lastNewDataTime = Date.now();
        }

        const initialMetadata = await getPreSearchStreamMetadata(streamId, env);
        if (initialMetadata?.status === StreamStatuses.COMPLETED || initialMetadata?.status === StreamStatuses.FAILED) {
          safeClose(controller);
          return;
        }

        // eslint-disable-next-line no-unmodified-loop-condition
        while (!isClosed) {
          if (Date.now() - startTime > maxPollDurationMs) {
            safeClose(controller);
            return;
          }

          const chunks = await getPreSearchStreamChunks(streamId, env);
          const metadata = await getPreSearchStreamMetadata(streamId, env);

          if (chunks && chunks.length > lastChunkIndex) {
            for (let i = lastChunkIndex; i < chunks.length; i++) {
              const chunk = chunks[i];
              if (chunk) {
                const sseData = `event: ${chunk.event}\ndata: ${chunk.data}\n\n`;
                if (!safeEnqueue(controller, encoder.encode(sseData))) {
                  return;
                }
              }
            }
            lastChunkIndex = chunks.length;
            lastNewDataTime = Date.now();
          }

          if (metadata?.status === StreamStatuses.COMPLETED || metadata?.status === StreamStatuses.FAILED) {
            safeClose(controller);
            return;
          }

          const timeSinceLastNewData = Date.now() - lastNewDataTime;
          if (timeSinceLastNewData > noNewDataTimeoutMs) {
            const syntheticDone = `event: done\ndata: {"interrupted":true,"reason":"stream_timeout"}\n\n`;
            safeEnqueue(controller, encoder.encode(syntheticDone));
            safeClose(controller);
            return;
          }

          await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
        }
      } catch {
        safeClose(controller);
      }
    },

    cancel() {
      isClosed = true;
    },
  });
}

// ============================================================================
// MODERATOR STREAM BUFFER OPERATIONS (STUB - FOR FUTURE IMPLEMENTATION)
// ============================================================================

export async function initializeModeratorStreamBuffer(
  streamId: string,
  threadId: string,
  roundNumber: number,
  moderatorId: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  if (!env?.KV) {
    return;
  }

  try {
    const metadata: ModeratorStreamBufferMetadata = {
      streamId,
      threadId,
      roundNumber,
      moderatorId,
      status: StreamStatuses.ACTIVE,
      chunkCount: 0,
      createdAt: Date.now(),
      completedAt: null,
      errorMessage: null,
    };

    await Promise.all([
      env.KV.put(getMetadataKey(streamId), JSON.stringify(metadata), {
        expirationTtl: STREAM_BUFFER_TTL_SECONDS,
      }),
      env.KV.put(getActiveKey(threadId, roundNumber, StreamPhases.MODERATOR), streamId, {
        expirationTtl: STREAM_BUFFER_TTL_SECONDS,
      }),
    ]);

    logger?.info('Initialized moderator stream buffer', LogHelpers.operation({
      operationName: 'initializeModeratorStreamBuffer',
      streamId,
      threadId,
      roundNumber,
    }));
  } catch (error) {
    logger?.error('Failed to initialize moderator stream buffer', LogHelpers.operation({
      operationName: 'initializeModeratorStreamBuffer',
      streamId,
      error: error instanceof Error ? error.message : 'Unknown error',
    }));
  }
}

export async function appendModeratorStreamChunk(
  streamId: string,
  data: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
): Promise<void> {
  if (!env?.KV) {
    return;
  }

  try {
    const metadataKey = getMetadataKey(streamId);
    const rawMetadata = await env.KV.get(metadataKey, 'json');
    const metadataResult = ModeratorStreamBufferMetadataSchema.safeParse(rawMetadata);

    if (!metadataResult.success) {
      logger?.warn('Stream metadata not found during chunk append', {
        logType: LogTypes.EDGE_CASE,
        scenario: 'moderator_metadata_not_found',
        streamId,
      });
      return;
    }

    const metadata = metadataResult.data;
    const chunkIndex = metadata.chunkCount;

    const newChunk: ModeratorStreamChunk = {
      data,
      timestamp: Date.now(),
    };

    await env.KV.put(
      getChunkKey(streamId, chunkIndex),
      JSON.stringify(newChunk),
      { expirationTtl: STREAM_BUFFER_TTL_SECONDS },
    );

    const updatedMetadata = { ...metadata, chunkCount: chunkIndex + 1 };
    await env.KV.put(metadataKey, JSON.stringify(updatedMetadata), {
      expirationTtl: STREAM_BUFFER_TTL_SECONDS,
    });
  } catch (error) {
    logger?.warn('Failed to append moderator stream chunk', {
      logType: LogTypes.EDGE_CASE,
      scenario: 'moderator_chunk_append_failed',
      streamId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
