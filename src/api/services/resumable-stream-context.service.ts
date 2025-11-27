/**
 * Resumable Stream Context Service - Cloudflare KV-based stream persistence
 *
 * **PURPOSE**: Provides AI SDK v6 compatible resumable stream functionality
 * using Cloudflare KV instead of Redis (used by the `resumable-stream` package)
 *
 * **ARCHITECTURE**:
 * - Simulates pub/sub pattern using KV polling
 * - Uses `ctx.waitUntil()` for background stream execution
 * - Chunks buffered to KV with automatic TTL cleanup
 *
 * **AI SDK INTEGRATION**:
 * - Compatible with `consumeSseStream` callback pattern
 * - Supports `resume: true` in useChat hook
 * - Provides GET endpoint for stream resumption
 *
 * **CLOUDFLARE WORKERS PATTERN**:
 * - Uses `ctx.waitUntil()` to extend worker lifetime
 * - Stream continues in background regardless of HTTP disconnect
 * - KV provides eventual consistency with ~60ms propagation
 *
 * @module api/services/resumable-stream-context
 */

import type { ExecutionContext } from 'hono';

import { StreamStatuses } from '@/api/core/enums';
import type { ApiEnv } from '@/api/types';

import type { StreamBufferMetadata, StreamChunk } from './stream-buffer.service';
import {
  appendStreamChunk,
  completeStreamBuffer,
  createLiveParticipantResumeStream,
  failStreamBuffer,
  getStreamChunks,
  getStreamMetadata,
  initializeStreamBuffer,
} from './stream-buffer.service';

// ============================================================================
// Types
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
   * @param streamId - Unique stream identifier
   * @param threadId - Thread ID
   * @param roundNumber - Round number
   * @param participantIndex - Participant index
   * @param getStream - Function that returns the SSE stream to buffer
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
   * @param streamId - Stream ID to resume
   * @returns ReadableStream that polls KV for chunks
   */
  resumeExistingStream: (streamId: string) => Promise<ReadableStream<Uint8Array> | null>;

  /**
   * Check if a stream is active
   * @param streamId - Stream ID to check
   */
  isStreamActive: (streamId: string) => Promise<boolean>;

  /**
   * Get stream metadata
   * @param streamId - Stream ID
   */
  getMetadata: (streamId: string) => Promise<StreamBufferMetadata | null>;

  /**
   * Get all buffered chunks
   * @param streamId - Stream ID
   */
  getChunks: (streamId: string) => Promise<StreamChunk[] | null>;

  /**
   * Mark stream as complete
   * @param streamId - Stream ID
   */
  complete: (streamId: string) => Promise<void>;

  /**
   * Mark stream as failed
   * @param streamId - Stream ID
   * @param error - Error message
   */
  fail: (streamId: string, error: string) => Promise<void>;
};

// ============================================================================
// Implementation
// ============================================================================

/**
 * Create a resumable stream context for Cloudflare KV
 *
 * **Usage** (similar to `resumable-stream` package):
 * ```typescript
 * const streamContext = createResumableStreamContext({
 *   waitUntil: ctx.waitUntil.bind(ctx),
 *   env: c.env,
 * });
 *
 * // In POST handler - create new stream
 * await streamContext.createNewResumableStream(
 *   streamId,
 *   threadId,
 *   roundNumber,
 *   participantIndex,
 *   () => result.toUIMessageStreamResponse().body,
 * );
 *
 * // In GET handler - resume existing stream
 * const stream = await streamContext.resumeExistingStream(streamId);
 * ```
 *
 * @param options - Configuration options
 * @returns Resumable stream context
 */
export function createResumableStreamContext(
  options: ResumableStreamContextOptions,
): ResumableStreamContext {
  const { waitUntil, env } = options;

  return {
    async createNewResumableStream(
      streamId: string,
      threadId: string,
      roundNumber: number,
      participantIndex: number,
      getStream: () => ReadableStream<string>,
    ): Promise<void> {
      // Initialize stream buffer in KV
      await initializeStreamBuffer(streamId, threadId, roundNumber, participantIndex, env);

      // Start background buffering via waitUntil
      // This ensures the stream continues even if HTTP connection closes
      const bufferStream = async () => {
        try {
          const stream = getStream();
          const reader = stream.getReader();

          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              await completeStreamBuffer(streamId, env);
              break;
            }

            // Buffer chunk to KV
            await appendStreamChunk(streamId, value, env);
          }
        } catch (error) {
          // Only fail if it's a real error, not an abort
          const isAbortError = error instanceof Error && (
            error.name === 'AbortError'
            || error.message.includes('abort')
            || error.message.includes('cancel')
          );

          if (!isAbortError) {
            await failStreamBuffer(
              streamId,
              error instanceof Error ? error.message : 'Stream buffer error',
              env,
            );
          }
          // On abort, preserve buffer state for potential resumption
        }
      };

      // Execute buffering in background
      waitUntil(bufferStream());
    },

    async resumeExistingStream(streamId: string): Promise<ReadableStream<Uint8Array> | null> {
      const metadata = await getStreamMetadata(streamId, env);

      if (!metadata) {
        return null;
      }

      // If stream is complete or failed, return static chunks
      if (metadata.status === StreamStatuses.COMPLETED || metadata.status === StreamStatuses.FAILED) {
        const chunks = await getStreamChunks(streamId, env);
        if (!chunks) {
          return null;
        }

        // Return static stream of all chunks
        const encoder = new TextEncoder();
        return new ReadableStream({
          start(controller) {
            for (const chunk of chunks) {
              controller.enqueue(encoder.encode(chunk.data));
            }
            controller.close();
          },
        });
      }

      // Stream is still active - return live polling stream
      return createLiveParticipantResumeStream(streamId, env);
    },

    async isStreamActive(streamId: string): Promise<boolean> {
      const metadata = await getStreamMetadata(streamId, env);
      return metadata?.status === StreamStatuses.ACTIVE
        || metadata?.status === StreamStatuses.STREAMING;
    },

    async getMetadata(streamId: string): Promise<StreamBufferMetadata | null> {
      return getStreamMetadata(streamId, env);
    },

    async getChunks(streamId: string): Promise<StreamChunk[] | null> {
      return getStreamChunks(streamId, env);
    },

    async complete(streamId: string): Promise<void> {
      await completeStreamBuffer(streamId, env);
    },

    async fail(streamId: string, error: string): Promise<void> {
      await failStreamBuffer(streamId, error, env);
    },
  };
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Generate stream ID for participant streams
 * Format: {threadId}_r{roundNumber}_p{participantIndex}
 */
export function generateParticipantStreamId(
  threadId: string,
  roundNumber: number,
  participantIndex: number,
): string {
  return `${threadId}_r${roundNumber}_p${participantIndex}`;
}

/**
 * Parse participant stream ID
 */
export function parseParticipantStreamId(streamId: string): {
  threadId: string;
  roundNumber: number;
  participantIndex: number;
} | null {
  const match = streamId.match(/^(.+)_r(\d+)_p(\d+)$/);
  if (!match || match.length < 4) {
    return null;
  }

  return {
    threadId: match[1] as string,
    roundNumber: Number.parseInt(match[2] as string, 10),
    participantIndex: Number.parseInt(match[3] as string, 10),
  };
}

/**
 * Create resumable stream context with execution context
 * Convenience wrapper for Hono handlers
 */
export function createResumableStreamContextFromHono(
  c: { env: ApiEnv['Bindings']; executionCtx: ExecutionContext },
): ResumableStreamContext {
  return createResumableStreamContext({
    waitUntil: c.executionCtx.waitUntil.bind(c.executionCtx),
    env: c.env,
    executionCtx: c.executionCtx,
  });
}
