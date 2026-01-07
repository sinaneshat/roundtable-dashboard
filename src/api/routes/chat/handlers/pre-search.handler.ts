/**
 * Pre-Search Handler
 *
 * ✅ FOLLOWS: backend-patterns.md and moderator.handler.ts patterns
 * ✅ DATABASE-FIRST: Creates record before streaming
 * ✅ IDEMPOTENT: Returns existing results if already completed
 * ✅ SSE STREAMING: Streams search execution progress
 * ✅ SERVICE LAYER: Uses web-search.service.ts for business logic
 *
 * Architecture matches: src/api/routes/chat/handlers/moderator.handler.ts
 * Reference: backend-patterns.md lines 546-693 (SSE Streaming Pattern)
 */

import type { RouteHandler } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import { streamSSE } from 'hono/streaming';
import { ulid } from 'ulid';

import { ErrorContextBuilders } from '@/api/common/error-contexts';
import { createError } from '@/api/common/error-handling';
import { verifyThreadOwnership } from '@/api/common/permissions';
import { AIModels, createHandler, IdParamSchema, Responses, STREAMING_CONFIG, ThreadRoundParamSchema } from '@/api/core';
import { FinishReasons, IMAGE_MIME_TYPES, MessagePartTypes, MessageRoles, MessageStatuses, PollingStatuses, PreSearchQueryStatuses, PreSearchSseEvents, UIMessageRoles, WebSearchComplexities, WebSearchDepths } from '@/api/core/enums';
import {
  deductCreditsForAction,
  enforceCredits,
} from '@/api/services/billing';
import type { PreSearchTrackingContext } from '@/api/services/errors';
import { buildEmptyResponseError, extractErrorMetadata, initializePreSearchTracking, trackPreSearchComplete, trackQueryGeneration, trackWebSearchExecution } from '@/api/services/errors';
import { loadAttachmentContent } from '@/api/services/messages';
import { initializeOpenRouter, openRouterService } from '@/api/services/models';
import { analyzeQueryComplexity, IMAGE_ANALYSIS_FOR_SEARCH_PROMPT, simpleOptimizeQuery } from '@/api/services/prompts';
import {
  createSearchCache,
  generateSearchQuery,
  performWebSearch,
  streamSearchQuery,
} from '@/api/services/search';
import {
  appendPreSearchStreamChunk,
  clearActivePreSearchStream,
  completePreSearchStreamBuffer,
  createLivePreSearchResumeStream,
  failPreSearchStreamBuffer,
  getActivePreSearchStreamId,
  getPreSearchStreamChunks,
  initializePreSearchStreamBuffer,
  isPreSearchBufferStale,
} from '@/api/services/streaming';
import { getUserTier } from '@/api/services/usage';
import type { ApiEnv } from '@/api/types';
import { generatePreSearchStreamId } from '@/api/types/streaming';
import { getDbAsync } from '@/db';
import * as tables from '@/db';
import { formatAgeMs, getTimestampAge, hasTimestampExceededTimeout } from '@/db/utils/timestamps';
import type { MessagePart } from '@/lib/schemas/message-schemas';

import type { executePreSearchRoute, getThreadPreSearchesRoute } from '../route';
import type { GeneratedSearchQuery, MultiQueryGeneration, WebSearchResult } from '../schema';
import { PreSearchRequestSchema } from '../schema';

// ============================================================================
// IMAGE ANALYSIS FOR SEARCH CONTEXT
// ============================================================================

/**
 * Analyze images using vision model to extract searchable context
 *
 * This function is critical for web search with image attachments:
 * - Images cannot be directly searched, but their contents can inform search queries
 * - Uses a vision model to describe what's in the image
 * - The description is then used to generate relevant search queries
 *
 * @param fileParts - Image file parts loaded from attachments
 * @param env - API environment bindings
 * @returns Description of image contents for search context
 */
async function analyzeImagesForSearchContext(
  fileParts: Array<{
    type: string;
    data?: Uint8Array;
    mimeType?: string;
    filename?: string;
    url?: string;
  }>,
  env: ApiEnv['Bindings'],
): Promise<string> {
  // Filter for image files only
  const imageFileParts = fileParts.filter(
    (part): part is typeof part & { mimeType: string } =>
      !!part.mimeType && IMAGE_MIME_TYPES.includes(part.mimeType as typeof IMAGE_MIME_TYPES[number]),
  );

  if (imageFileParts.length === 0) {
    return '';
  }

  // Initialize OpenRouter for vision model
  initializeOpenRouter(env);

  try {
    // Build message parts for vision model
    const textPart = {
      type: MessagePartTypes.TEXT,
      text: IMAGE_ANALYSIS_FOR_SEARCH_PROMPT,
    };

    // Build file parts for images
    const filePartsList = imageFileParts
      .filter(part => part.data && part.mimeType)
      .map((part) => {
        // Convert Uint8Array to base64 using chunked approach
        const bytes = part.data!;
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
          binary += String.fromCharCode(...chunk);
        }
        const base64 = btoa(binary);
        const dataUrl = `data:${part.mimeType};base64,${base64}`;
        return {
          type: 'file' as const,
          mediaType: part.mimeType,
          url: dataUrl,
        };
      });

    // Call vision model to analyze images
    const result = await openRouterService.generateText({
      modelId: AIModels.IMAGE_ANALYSIS,
      messages: [
        {
          id: `img-analysis-${ulid()}`,
          role: UIMessageRoles.USER,
          parts: [textPart, ...filePartsList],
        },
      ],
      temperature: 0.3, // Lower temperature for more accurate descriptions
      maxTokens: 1000, // Enough for detailed description
    });

    const description = result.text.trim();

    if (description) {
      return `[Image Content Analysis]\n${description}`;
    }

    return '';
  } catch (error) {
    // Log error but don't fail the pre-search - continue without image context
    console.error('[Pre-search] Image analysis failed:', error);
    return '';
  }
}

// ============================================================================
// POST Pre-Search Handler (Streaming)
// ============================================================================

/**
 * Execute pre-search with SSE streaming
 *
 * **DATABASE-FIRST PATTERN** (matches moderator.handler.ts):
 * 1. Check for existing completed search → return immediately
 * 2. Check for in-progress search → return conflict
 * 3. Create/update record with PENDING status
 * 4. Update to STREAMING status
 * 5. Stream search execution
 * 6. Update to COMPLETED with results
 * 7. Create message record with search data
 *
 * **SSE EVENT TYPES** (for frontend integration):
 * - `start`: Initial event with metadata
 * - `query`: Incremental query generation updates (query/rationale streaming)
 * - `result`: Search result updates (incremental source streaming)
 * - `answer_chunk`: Answer streaming chunks (progressive text generation)
 * - `answer_complete`: Final complete answer with metadata
 * - `answer_error`: Answer generation error (graceful degradation)
 * - `complete`: Search execution complete with statistics
 * - `done`: Final event with complete searchData payload
 * - `failed`: Error event with error details
 *
 * **REFACTOR NOTES**:
 * - Direct use of streamSearchQuery() instead of callback-based performPreSearches()
 * - Streaming answer integration via streamAnswerSummary() (75-80% faster TTFC)
 * - Simplified streaming logic - no nested callbacks
 *
 * **PATTERN**: Identical to councilModeratorRoundHandler architecture
 * **REFERENCE**: moderator.handler.ts:227-648, backend-patterns.md:546-693
 */
export const executePreSearchHandler: RouteHandler<typeof executePreSearchRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: ThreadRoundParamSchema,
    validateBody: PreSearchRequestSchema,
    operationName: 'executePreSearch',
  },
  async (c) => {
    const { user } = c.auth();
    const { threadId, roundNumber } = c.validated.params;
    const body = c.validated.body;
    const db = await getDbAsync();

    const roundNum = Number.parseInt(roundNumber, 10);
    if (Number.isNaN(roundNum) || roundNum < 0) {
      throw createError.badRequest('Invalid round number', ErrorContextBuilders.validation('round_number'));
    }

    // Verify thread ownership
    // ✅ FIX: Removed thread.enableWebSearch check - users can enable web search mid-conversation
    // The act of calling this endpoint IS the user's intent to use web search for this round
    // The thread's enableWebSearch is now a default/preference, not a hard restriction
    await verifyThreadOwnership(threadId, user.id, db);

    // ✅ CREDITS: Enforce credits for web search (1 credit minimum for web search)
    // Skip round completion check - pre-search is PART of the round, not a new round
    // Actual deduction happens per successful query execution
    await enforceCredits(user.id, 1, { skipRoundCheck: true });

    // ✅ DATABASE-FIRST: Check if record exists, create if not
    // Record may not exist when web search is enabled mid-conversation
    // (thread was created without enableWebSearch, user enabled it later)
    let existingSearch = await db.query.chatPreSearch.findFirst({
      where: (fields, { and, eq: eqOp }) => and(
        eqOp(fields.threadId, threadId),
        eqOp(fields.roundNumber, roundNum),
      ),
    });

    // ✅ AUTO-CREATE: If record doesn't exist, create it (supports mid-conversation web search enable)
    // This handles the case where thread was created without web search, then user enables it later
    // The act of calling this endpoint IS the user's intent to use web search for this round
    if (!existingSearch) {
      const [newSearch] = await db
        .insert(tables.chatPreSearch)
        .values({
          id: ulid(),
          threadId,
          roundNumber: roundNum,
          userQuery: body.userQuery,
          status: MessageStatuses.PENDING,
          createdAt: new Date(),
        })
        .returning();

      if (!newSearch) {
        throw createError.internal('Failed to create pre-search record', ErrorContextBuilders.database('insert', 'chatPreSearch'));
      }
      existingSearch = newSearch;
    }

    // ✅ IDEMPOTENT: Return existing if already completed
    if (existingSearch.status === MessageStatuses.COMPLETE && existingSearch.searchData) {
      return Responses.ok(c, existingSearch);
    }

    // Check for stale STREAMING status
    if (existingSearch.status === MessageStatuses.STREAMING) {
      // Check if stream has timed out using clean timestamp utilities
      if (hasTimestampExceededTimeout(existingSearch.createdAt, STREAMING_CONFIG.STREAM_TIMEOUT_MS)) {
        // SSE connections can get interrupted without backend knowing
        await db.update(tables.chatPreSearch)
          .set({
            status: MessageStatuses.FAILED,
            errorMessage: `Stream timeout after ${formatAgeMs(getTimestampAge(existingSearch.createdAt))} - SSE connection likely interrupted`,
          })
          .where(eq(tables.chatPreSearch.id, existingSearch.id));

        // Continue to create new search below
      } else {
        // ✅ LIVE STREAM RESUMPTION: Try to resume from KV buffer
        const ageMs = getTimestampAge(existingSearch.createdAt);
        const existingStreamId = await getActivePreSearchStreamId(threadId, roundNum, c.env);

        if (existingStreamId) {
          // ✅ FIX: Check if buffer is stale BEFORE attempting live resume
          // If no new chunks in 5 seconds, original stream likely dead - reset and restart
          // Short timeout (5s) for fast detection when user refreshes mid-stream
          const bufferIsStale = await isPreSearchBufferStale(existingStreamId, c.env, 5_000);

          if (bufferIsStale) {
            // Buffer is stale - original stream died (page refresh killed it)
            // Clear KV tracking and reset DB status to allow fresh start
            await clearActivePreSearchStream(threadId, roundNum, c.env);
            await db.update(tables.chatPreSearch)
              .set({
                status: MessageStatuses.PENDING,
                errorMessage: null,
              })
              .where(eq(tables.chatPreSearch.id, existingSearch.id));

            // Continue to start fresh stream below (don't return here)
          } else {
            // Buffer is active - return live resume stream
            // ✅ PATTERN: Uses Responses.sse() builder for consistent SSE headers
            const liveStream = createLivePreSearchResumeStream(existingStreamId, c.env);
            return Responses.sse(liveStream, {
              streamId: existingStreamId,
              resumedFromBuffer: true,
            });
          }
        } else {
          // FALLBACK: No active stream ID (KV not available in local dev)
          return Responses.polling(c, {
            status: PollingStatuses.STREAMING,
            resourceId: existingSearch.id,
            message: `Pre-search is in progress (age: ${formatAgeMs(ageMs)}). Please poll for completion.`,
            retryAfterMs: 2000,
          });
        }
      }
    }

    // ✅ STREAMING: Update to streaming status
    await db.update(tables.chatPreSearch)
      .set({ status: MessageStatuses.STREAMING })
      .where(eq(tables.chatPreSearch.id, existingSearch.id));

    // ============================================================================
    // ✅ REFACTORED: Direct streamText with Output.object() integration (no callbacks)
    // ============================================================================
    // Pattern from moderator.handler.ts:91-120
    // Uses AI SDK v6 streamText with Output.object() and partialOutputStream iterator
    // ✅ STREAM BUFFER: Generate stream ID and initialize buffer for resumption
    const streamId = generatePreSearchStreamId(threadId, roundNum);
    await initializePreSearchStreamBuffer(streamId, threadId, roundNum, existingSearch.id, c.env);

    // ✅ POSTHOG LLM TRACKING: Initialize pre-search tracking
    const { session } = c.auth();
    const userTier = await getUserTier(user.id);
    const { traceId: preSearchTraceId, parentSpanId: preSearchParentSpanId } = initializePreSearchTracking();

    return streamSSE(c, async (stream) => {
      // ✅ BUFFERED SSE: Wrapper to buffer all SSE events for stream resumption
      const bufferedWriteSSE = async (payload: { event: string; data: string }) => {
        // Write to stream
        await stream.writeSSE(payload);
        // Buffer for resumption (fire and forget)
        c.executionCtx.waitUntil(
          appendPreSearchStreamChunk(streamId, payload.event, payload.data, c.env),
        );
      };

      // ✅ POSTHOG TRACKING CONTEXT
      const trackingContext: PreSearchTrackingContext = {
        userId: user.id,
        sessionId: session?.id,
        threadId,
        roundNumber: roundNum,
        userQuery: body.userQuery,
        userTier,
      };

      // ✅ Define startTime outside try for error tracking access
      const startTime = performance.now();

      try {
        const searchCache = createSearchCache();
        const queryGenerationStartTime = performance.now();

        // ✅ MULTI-QUERY: Stream query generation and get all queries
        let multiQueryResult: MultiQueryGeneration | null = null;

        // ✅ ALWAYS ATTEMPT AI GENERATION: Generate meaningful search queries for any input
        // The AI will extract searchable terms from any content including conversational input
        {
          // ✅ IMAGE ANALYSIS: Analyze uploaded images to extract searchable context
          // This is critical for web search with image attachments - images must be described
          // before we can generate relevant search queries about their contents
          let imageContext = '';
          if (body.attachmentIds && body.attachmentIds.length > 0) {
            try {
              const { fileParts } = await loadAttachmentContent({
                attachmentIds: body.attachmentIds,
                r2Bucket: c.env.UPLOADS_R2_BUCKET,
                db,
              });

              if (fileParts.length > 0) {
                // Analyze images with vision model to get searchable descriptions
                imageContext = await analyzeImagesForSearchContext(fileParts, c.env);
              }
            } catch (error) {
              // Log but don't fail - continue without image context
              console.error('[Pre-search] Failed to load/analyze attachments:', error);
            }
          }

          // ✅ FILE CONTEXT: Include uploaded file content in query generation
          // This ensures search queries are relevant to both user message AND file contents
          // Combine text file context with image analysis context
          let combinedContext = '';
          if (body.fileContext && body.fileContext.trim()) {
            combinedContext = body.fileContext.trim();
          }
          if (imageContext) {
            combinedContext = combinedContext
              ? `${combinedContext}\n\n${imageContext}`
              : imageContext;
          }

          let queryMessage = body.userQuery;
          if (combinedContext) {
            queryMessage = `${body.userQuery}\n\n<file-context>\nThe user has uploaded files with the following content that should be considered when generating search queries:\n${combinedContext}\n</file-context>`;
          }

          // ✅ NORMAL FLOW: Attempt AI generation for searchable queries
          try {
            const queryStream = streamSearchQuery(queryMessage, c.env);

            // ✅ INCREMENTAL STREAMING: Stream each query update as it's generated
            // Track best partial result for graceful fallback if final validation fails
            const lastSentQueries: string[] = [];
            let lastTotalQueries = 0;
            // ✅ TYPE: Use generic partial type to handle AI SDK's PartialObject
            let bestPartialResult: {
              totalQueries?: string | number;
              analysisRationale?: string;
              queries?: Array<Partial<GeneratedSearchQuery> | undefined>;
            } | null = null;

            // ✅ RESILIENT STREAMING: Wrap iteration in try-catch to preserve partial progress
            try {
              for await (const partialResult of queryStream.partialOutputStream) {
                // Track best partial result seen (most complete version)
                if (partialResult.queries && partialResult.queries.length > 0) {
                  bestPartialResult = partialResult;
                }

                // Send start event once we know totalQueries
                // Coerce string numbers to actual numbers
                const totalQueries = typeof partialResult.totalQueries === 'string'
                  ? Number.parseInt(partialResult.totalQueries, 10)
                  : partialResult.totalQueries;

                if (totalQueries && totalQueries !== lastTotalQueries) {
                  lastTotalQueries = totalQueries;
                  await bufferedWriteSSE({
                    event: PreSearchSseEvents.START,
                    data: JSON.stringify({
                      timestamp: Date.now(),
                      userQuery: body.userQuery,
                      totalQueries,
                      analysisRationale: partialResult.analysisRationale || '',
                    }),
                  });
                }

                // Stream each query as it becomes available
                if (partialResult.queries && partialResult.queries.length > 0) {
                  for (let i = 0; i < partialResult.queries.length; i++) {
                    const query = partialResult.queries[i];
                    if (query?.query && query.query !== lastSentQueries[i]) {
                      await bufferedWriteSSE({
                        event: PreSearchSseEvents.QUERY,
                        data: JSON.stringify({
                          timestamp: Date.now(),
                          query: query.query || '',
                          rationale: query.rationale || '',
                          searchDepth: query.searchDepth || WebSearchDepths.BASIC,
                          index: i,
                          total: totalQueries || 1,
                        }),
                      });
                      lastSentQueries[i] = query.query;
                    }
                  }
                }
              }
            } catch (streamErr) {
              console.error('[Pre-search] Query streaming error:', streamErr);
            }

            // ✅ GRACEFUL OBJECT RETRIEVAL: Try to get final object, fall back to partial
            try {
              multiQueryResult = await queryStream.output;
            } catch (_objectError) {
              // ✅ FALLBACK TO PARTIAL: If final validation fails but we have partial queries, use them
              if (bestPartialResult?.queries && bestPartialResult.queries.length > 0) {
                // ✅ RECONSTRUCT from partial result
                // Filter for queries that have the minimum required fields
                const validQueries = bestPartialResult.queries.filter(
                  (q): q is Partial<GeneratedSearchQuery> & { query: string } =>
                    !!(q?.query && typeof q.query === 'string'),
                );

                if (validQueries.length > 0) {
                  // ✅ RECONSTRUCT: Build complete GeneratedSearchQuery objects with required fields
                  multiQueryResult = {
                    totalQueries: validQueries.length,
                    analysisRationale: bestPartialResult.analysisRationale || 'Recovered from streaming partial result',
                    queries: validQueries.map((q): GeneratedSearchQuery => ({
                      query: q.query, // Already validated to exist
                      rationale: q.rationale || 'Query from partial streaming result',
                      searchDepth: q.searchDepth || WebSearchDepths.ADVANCED,
                      // Optional fields with defaults
                      complexity: q.complexity || WebSearchComplexities.MODERATE,
                      sourceCount: q.sourceCount,
                      requiresFullContent: q.requiresFullContent,
                      chunksPerSource: q.chunksPerSource,
                      topic: q.topic,
                      timeRange: q.timeRange,
                      needsAnswer: q.needsAnswer,
                      includeImages: q.includeImages,
                      includeImageDescriptions: q.includeImageDescriptions,
                      analysis: q.analysis,
                    })),
                  };
                } else {
                  // No valid queries in partial - rethrow original error
                  throw _objectError;
                }
              } else {
                // No partial result to fall back to - rethrow original error
                throw _objectError;
              }
            }

            // ✅ FIX: Send FINAL query events with correct searchDepth values
            // During streaming, partial objects may have incomplete searchDepth (defaulted to 'basic')
            // Send corrected events with the complete data from final result
            if (multiQueryResult?.queries) {
              for (let i = 0; i < multiQueryResult.queries.length; i++) {
                const query = multiQueryResult.queries[i];
                if (query?.query) {
                  await bufferedWriteSSE({
                    event: PreSearchSseEvents.QUERY,
                    data: JSON.stringify({
                      timestamp: Date.now(),
                      query: query.query,
                      rationale: query.rationale || '',
                      searchDepth: query.searchDepth || WebSearchDepths.ADVANCED,
                      index: i,
                      total: multiQueryResult.totalQueries || multiQueryResult.queries.length,
                      final: true, // Flag to indicate this is the final/corrected data
                    }),
                  });
                }
              }
            }

            // Validate generation succeeded
            if (!multiQueryResult || !multiQueryResult.queries || multiQueryResult.queries.length === 0) {
              throw createError.internal(
                'Query generation failed - no queries produced',
                {
                  errorType: 'external_service',
                  service: 'openrouter',
                  operation: 'stream_query_generation',
                },
              );
            }
          } catch {
          // ✅ FALLBACK LEVEL 1: Try non-streaming generation (streaming failed completely)
            try {
              multiQueryResult = await generateSearchQuery(body.userQuery, c.env);

              // Validate generation succeeded
              if (!multiQueryResult || !multiQueryResult.queries || multiQueryResult.queries.length === 0) {
                throw createError.internal(
                  'Non-streaming query generation failed - no queries produced',
                  {
                    errorType: 'external_service',
                    service: 'openrouter',
                    operation: 'non_stream_query_generation',
                  },
                );
              }

              // Send start event for non-streaming result
              await bufferedWriteSSE({
                event: PreSearchSseEvents.START,
                data: JSON.stringify({
                  timestamp: Date.now(),
                  userQuery: body.userQuery,
                  totalQueries: multiQueryResult.totalQueries,
                  analysisRationale: multiQueryResult.analysisRationale || '',
                }),
              });

              // Send all queries at once (non-streaming)
              for (let i = 0; i < multiQueryResult.queries.length; i++) {
                const query = multiQueryResult.queries[i];
                if (query) {
                  await bufferedWriteSSE({
                    event: PreSearchSseEvents.QUERY,
                    data: JSON.stringify({
                      timestamp: Date.now(),
                      query: query.query || '',
                      rationale: query.rationale || '',
                      searchDepth: query.searchDepth || WebSearchDepths.BASIC,
                      index: i,
                      total: multiQueryResult.totalQueries,
                    }),
                  });
                }
              }
            } catch {
              // ✅ FALLBACK: If AI generation fails, extract key terms from user input
              const optimizedQuery = simpleOptimizeQuery(body.userQuery);

              // Create fallback with single query using extracted terms
              multiQueryResult = {
                totalQueries: 1,
                analysisRationale: 'Searching based on key terms from your message',
                queries: [{
                  query: optimizedQuery,
                  searchDepth: WebSearchDepths.BASIC,
                  complexity: WebSearchComplexities.MODERATE,
                  rationale: 'Searching for relevant information based on your input',
                  sourceCount: 4,
                  requiresFullContent: false,
                  chunksPerSource: 1,
                  needsAnswer: 'basic',
                  analysis: `Extracting search terms from: "${body.userQuery}"`,
                }],
              };

              // Send start event
              await bufferedWriteSSE({
                event: PreSearchSseEvents.START,
                data: JSON.stringify({
                  timestamp: Date.now(),
                  userQuery: body.userQuery,
                  totalQueries: 1,
                  analysisRationale: 'Searching based on key terms from your message',
                }),
              });

              // Send query event
              const fallbackQuery = multiQueryResult.queries[0];
              if (fallbackQuery) {
                await bufferedWriteSSE({
                  event: PreSearchSseEvents.QUERY,
                  data: JSON.stringify({
                    timestamp: Date.now(),
                    query: fallbackQuery.query,
                    rationale: fallbackQuery.rationale,
                    searchDepth: WebSearchDepths.BASIC,
                    index: 0,
                    total: 1,
                  }),
                });
              }
            }
          }
        }

        // Type guard
        if (!multiQueryResult) {
          throw createError.internal(
            'Failed to generate search queries',
            {
              errorType: 'external_service',
              service: 'openrouter',
              operation: 'query_generation',
            },
          );
        }

        const rawGeneratedQueries = multiQueryResult.queries;

        // ✅ COMPLEXITY-AWARE: Limit queries based on user prompt complexity
        // Simple queries (definitions, single facts) = 1 query
        // Moderate queries (how-to, comparisons) = 2 queries max
        // Complex queries (multi-part, research) = 3 queries max
        const complexityResult = analyzeQueryComplexity(body.userQuery);

        // Apply complexity limits - slice queries to maxQueries
        // ✅ FIX: Filter out queries with empty/whitespace-only query strings (can occur from partial AI streaming)
        const generatedQueries = rawGeneratedQueries
          .slice(0, complexityResult.maxQueries)
          .filter(q => q.query && q.query.trim().length > 0);
        const totalQueries = Math.min(generatedQueries.length, complexityResult.maxQueries);

        // Apply default search depth and source count to queries that lack them
        for (const query of generatedQueries) {
          if (!query.searchDepth) {
            query.searchDepth = complexityResult.defaultSearchDepth;
          }
          if (!query.sourceCount) {
            query.sourceCount = complexityResult.defaultSourceCount;
          }
        }

        // ✅ STREAM: Notify frontend about complexity decision
        // Note: We may have already sent START during fallback, but frontend handles duplicates
        await bufferedWriteSSE({
          event: PreSearchSseEvents.START,
          data: JSON.stringify({
            timestamp: Date.now(),
            userQuery: body.userQuery,
            totalQueries,
            analysisRationale: multiQueryResult.analysisRationale,
            complexity: complexityResult.complexity,
            complexityReasoning: complexityResult.reasoning,
          }),
        });

        // ✅ POSTHOG TRACKING: Track query generation completion
        const queryGenerationDuration = performance.now() - queryGenerationStartTime;
        c.executionCtx.waitUntil(
          trackQueryGeneration(
            trackingContext,
            {
              traceId: preSearchTraceId,
              parentSpanId: preSearchParentSpanId,
              queriesGenerated: totalQueries,
              analysisRationale: multiQueryResult.analysisRationale || '',
              complexity: complexityResult.complexity,
              modelId: 'google/gemini-2.5-flash', // WEB_SEARCH model from AIModels
            },
            queryGenerationDuration,
          ),
        );

        // ✅ MULTI-QUERY EXECUTION: Execute all queries and collect results
        const allResults: Array<{ query: GeneratedSearchQuery; result: WebSearchResult | null; duration: number }> = [];

        for (let queryIndex = 0; queryIndex < generatedQueries.length; queryIndex++) {
          const generatedQuery = generatedQueries[queryIndex];

          // Type guard - skip if query is undefined (shouldn't happen but TypeScript requires this)
          if (!generatedQuery) {
            continue;
          }

          // Check cache first
          let result: WebSearchResult | null = null;
          if (searchCache.has(generatedQuery.query)) {
            result = searchCache.get(generatedQuery.query);
            if (result) {
              await bufferedWriteSSE({
                event: PreSearchSseEvents.RESULT,
                data: JSON.stringify({
                  timestamp: Date.now(),
                  query: result.query,
                  answer: result.answer,
                  results: result.results,
                  resultCount: result.results.length,
                  responseTime: 0,
                  index: queryIndex,
                  total: totalQueries,
                }),
              });
              allResults.push({ query: generatedQuery, result, duration: 0 });
              continue;
            }
          }

          // Execute search for this query
          const searchStartTime = performance.now();
          try {
            // Send initial "searching" state
            await bufferedWriteSSE({
              event: PreSearchSseEvents.RESULT,
              data: JSON.stringify({
                timestamp: Date.now(),
                query: generatedQuery.query,
                answer: null,
                results: [],
                resultCount: 0,
                responseTime: 0,
                index: queryIndex,
                total: totalQueries,
                status: 'searching',
              }),
            });

            // Dynamic source count based on complexity
            const complexity = generatedQuery.complexity ?? WebSearchComplexities.MODERATE;
            let defaultSourceCount = 5;
            if (complexity === WebSearchComplexities.BASIC) {
              defaultSourceCount = 3;
            } else if (complexity === WebSearchComplexities.DEEP) {
              defaultSourceCount = 8;
            }

            // Execute search with AI-driven parameters
            // Coerce string numbers to actual numbers
            const sourceCount = typeof generatedQuery.sourceCount === 'string'
              ? Number.parseInt(generatedQuery.sourceCount, 10)
              : generatedQuery.sourceCount;
            const chunksPerSource = typeof generatedQuery.chunksPerSource === 'string'
              ? Number.parseInt(generatedQuery.chunksPerSource, 10)
              : generatedQuery.chunksPerSource;

            // ✅ TAVILY PATTERN: Comprehensive data extraction
            // - Always include images for visual context
            // - Always include raw markdown content for participants
            // - No answer generation - participants synthesize directly
            result = await performWebSearch(
              {
                query: generatedQuery.query,
                maxResults: sourceCount ?? defaultSourceCount,
                searchDepth: generatedQuery.searchDepth ?? WebSearchDepths.ADVANCED,
                chunksPerSource: chunksPerSource ?? 2,
                includeImages: true, // ✅ ALWAYS include images from pages
                includeImageDescriptions: false, // Skip AI descriptions for speed
                includeAnswer: false, // ✅ NO ANSWER - raw data only
                includeFavicon: true,
                includeRawContent: 'markdown', // ✅ ALWAYS include raw markdown content
                topic: generatedQuery.topic,
                timeRange: generatedQuery.timeRange,
                autoParameters: false,
              },
              c.env,
              complexity,
            );
            const searchDuration = performance.now() - searchStartTime;

            searchCache.set(generatedQuery.query, result);

            // Stream results progressively
            if (result.results.length > 0) {
              for (let i = 0; i < result.results.length; i++) {
                await bufferedWriteSSE({
                  event: PreSearchSseEvents.RESULT,
                  data: JSON.stringify({
                    timestamp: Date.now(),
                    query: result.query,
                    answer: null,
                    results: result.results.slice(0, i + 1),
                    resultCount: i + 1,
                    responseTime: searchDuration,
                    index: queryIndex,
                    total: totalQueries,
                    status: 'processing',
                  }),
                });

                if (i < result.results.length - 1) {
                  await new Promise(resolve => setTimeout(resolve, 50));
                }
              }
            }

            // Send final result for this query
            await bufferedWriteSSE({
              event: PreSearchSseEvents.RESULT,
              data: JSON.stringify({
                timestamp: Date.now(),
                query: result.query,
                answer: null,
                results: result.results,
                resultCount: result.results.length,
                responseTime: searchDuration,
                index: queryIndex,
                total: totalQueries,
                status: PreSearchQueryStatuses.COMPLETE,
              }),
            });

            allResults.push({ query: generatedQuery, result, duration: searchDuration });

            // ✅ POSTHOG TRACKING: Track successful web search execution
            c.executionCtx.waitUntil(
              trackWebSearchExecution(
                trackingContext,
                {
                  traceId: preSearchTraceId,
                  parentSpanId: preSearchParentSpanId,
                  searchQuery: generatedQuery.query,
                  searchIndex: queryIndex,
                  totalSearches: totalQueries,
                  resultsCount: result.results.length,
                  searchDepth: generatedQuery.searchDepth || 'basic',
                },
                searchDuration,
                { cacheHit: false },
              ),
            );

            // ✅ CREDITS: Deduct for successful web search query
            c.executionCtx.waitUntil(
              deductCreditsForAction(user.id, 'webSearchQuery', { threadId }),
            );
          } catch (error) {
            const searchDurationOnError = performance.now() - searchStartTime;

            await bufferedWriteSSE({
              event: PreSearchSseEvents.RESULT,
              data: JSON.stringify({
                timestamp: Date.now(),
                query: generatedQuery.query,
                answer: null,
                results: [],
                resultCount: 0,
                responseTime: 0,
                index: queryIndex,
                total: totalQueries,
                status: 'error',
                error: error instanceof Error ? error.message : 'Search failed',
              }),
            });
            allResults.push({ query: generatedQuery, result: null, duration: 0 });

            // ✅ POSTHOG TRACKING: Track failed web search execution
            c.executionCtx.waitUntil(
              trackWebSearchExecution(
                trackingContext,
                {
                  traceId: preSearchTraceId,
                  parentSpanId: preSearchParentSpanId,
                  searchQuery: generatedQuery.query,
                  searchIndex: queryIndex,
                  totalSearches: totalQueries,
                  resultsCount: 0,
                  searchDepth: generatedQuery.searchDepth || 'basic',
                },
                searchDurationOnError,
                {
                  isError: true,
                  error: error instanceof Error ? error : new Error(String(error)),
                },
              ),
            );
          }
        }

        // Combine all results - NO ANSWER GENERATION during pre-search
        // ✅ TAVILY PATTERN: Expose raw data directly to participants
        // Participants synthesize from raw content, not from pre-generated summaries
        const successfulResults = allResults.filter((r): r is { query: GeneratedSearchQuery; result: WebSearchResult; duration: number } => r.result !== null);
        const allSearchResults = successfulResults.flatMap(r => r.result.results);

        const totalTime = performance.now() - startTime;
        const isSuccess = successfulResults.length > 0;

        // Send complete event with multi-query statistics
        await bufferedWriteSSE({
          event: PreSearchSseEvents.COMPLETE,
          data: JSON.stringify({
            timestamp: Date.now(),
            totalSearches: totalQueries,
            successfulSearches: successfulResults.length,
            failedSearches: totalQueries - successfulResults.length,
            totalResults: allSearchResults.length,
          }),
        });

        // Save results to database
        // ✅ TAVILY PATTERN: Store raw results with full content, no summaries
        if (isSuccess) {
          const searchData = {
            queries: allResults.map((r, idx) => ({
              query: r.query.query,
              rationale: r.query.rationale,
              searchDepth: r.query.searchDepth || WebSearchDepths.BASIC,
              index: idx,
              total: totalQueries,
            })),
            // ✅ FULL RAW DATA: Include fullContent, rawContent for participant access
            // ✅ FIX: Include index for frontend matching during progressive streaming
            results: successfulResults.map((r, idx) => {
              // Find original query index from allResults
              const originalIdx = allResults.findIndex(ar => ar.query === r.query);
              // ✅ TYPE-SAFE: Capture result in const - type predicate guarantees non-null
              const searchResult = r.result;
              return {
                query: searchResult.query,
                answer: null, // No pre-generated answers - participants synthesize from raw data
                results: searchResult.results.map((res: WebSearchResult['results'][number]) => ({
                  title: res.title,
                  url: res.url,
                  content: res.content,
                  excerpt: res.excerpt,
                  fullContent: res.fullContent, // ✅ CRITICAL: Full scraped content
                  rawContent: res.rawContent, // ✅ CRITICAL: Raw markdown content
                  score: res.score,
                  publishedDate: res.publishedDate ?? null,
                  domain: res.domain,
                  metadata: res.metadata,
                  images: res.images,
                })),
                responseTime: r.duration,
                index: originalIdx >= 0 ? originalIdx : idx, // ✅ Original query index for matching
              };
            }),
            summary: multiQueryResult.analysisRationale || `Multi-query search: ${totalQueries} queries`,
            successCount: successfulResults.length,
            failureCount: totalQueries - successfulResults.length,
            totalResults: allSearchResults.length,
            totalTime,
            // ✅ NO combinedAnswer - participants synthesize directly from raw data
          };

          // Update search record
          await db.update(tables.chatPreSearch)
            .set({
              status: MessageStatuses.COMPLETE,
              searchData,
              completedAt: new Date(),
            })
            .where(eq(tables.chatPreSearch.id, existingSearch.id));

          // ✅ TYPE-SAFE: Create message record with properly typed pre-search metadata
          const preSearchMsgId = `pre-search-${roundNum}-${ulid()}`;
          await db.insert(tables.chatMessage)
            .values({
              id: preSearchMsgId,
              threadId,
              role: MessageRoles.ASSISTANT,
              parts: [{
                type: MessagePartTypes.TEXT,
                text: JSON.stringify({ type: 'web_search_results', ...searchData }),
              }] satisfies MessagePart[],
              roundNumber: roundNum,
              // ✅ TYPE-SAFE: Use DbPreSearchMessageMetadata discriminated union
              metadata: {
                role: UIMessageRoles.SYSTEM,
                roundNumber: roundNum,
                isPreSearch: true as const,
                preSearch: searchData,
              },
              createdAt: new Date(),
            })
            .onConflictDoNothing();

          // Send final done event with complete data
          await bufferedWriteSSE({
            event: PreSearchSseEvents.DONE,
            data: JSON.stringify(searchData),
          });

          // ✅ POSTHOG TRACKING: Track successful pre-search completion
          c.executionCtx.waitUntil(
            trackPreSearchComplete(
              trackingContext,
              {
                traceId: preSearchTraceId,
                parentSpanId: preSearchParentSpanId,
                totalQueries,
                successfulSearches: successfulResults.length,
                failedSearches: totalQueries - successfulResults.length,
                totalResults: allSearchResults.length,
              },
              totalTime,
            ),
          );

          // ✅ BUFFER COMPLETION: Mark stream as complete and clear active
          c.executionCtx.waitUntil(
            Promise.all([
              completePreSearchStreamBuffer(streamId, c.env),
              clearActivePreSearchStream(threadId, roundNum, c.env),
            ]),
          );
        } else {
          // Mark as failed if no successful searches
          // ✅ UNIFIED ERROR HANDLING: Use ErrorMetadataService for consistent error categorization
          const errorMetadata = buildEmptyResponseError({
            inputTokens: 0,
            outputTokens: 0,
            finishReason: FinishReasons.FAILED,
          });

          await db.update(tables.chatPreSearch)
            .set({
              status: MessageStatuses.FAILED,
              errorMessage: errorMetadata.errorMessage || 'No successful searches completed',
            })
            .where(eq(tables.chatPreSearch.id, existingSearch.id));

          await bufferedWriteSSE({
            event: PreSearchSseEvents.FAILED,
            data: JSON.stringify({
              error: errorMetadata.errorMessage || 'No successful searches completed',
              errorCategory: errorMetadata.errorCategory,
            }),
          });

          // ✅ POSTHOG TRACKING: Track failed pre-search (no successful searches)
          c.executionCtx.waitUntil(
            trackPreSearchComplete(
              trackingContext,
              {
                traceId: preSearchTraceId,
                parentSpanId: preSearchParentSpanId,
                totalQueries,
                successfulSearches: 0,
                failedSearches: totalQueries,
                totalResults: 0,
              },
              totalTime,
              {
                isError: true,
                errorCategory: errorMetadata.errorCategory,
              },
            ),
          );

          // ✅ BUFFER FAILURE: Mark stream as failed and clear active
          c.executionCtx.waitUntil(
            Promise.all([
              failPreSearchStreamBuffer(streamId, errorMetadata.errorMessage || 'No successful searches completed', c.env),
              clearActivePreSearchStream(threadId, roundNum, c.env),
            ]),
          );
        }
      } catch (error) {
        // ✅ UNIFIED ERROR HANDLING: Use ErrorMetadataService for consistent error categorization
        const errorMetadata = extractErrorMetadata({
          providerMetadata: {},
          response: error,
          finishReason: FinishReasons.ERROR,
          usage: { inputTokens: 0, outputTokens: 0 },
          text: '',
        });

        await db.update(tables.chatPreSearch)
          .set({
            status: MessageStatuses.FAILED,
            errorMessage: errorMetadata.errorMessage || (error instanceof Error ? error.message : 'Unknown error'),
          })
          .where(eq(tables.chatPreSearch.id, existingSearch.id));

        await bufferedWriteSSE({
          event: PreSearchSseEvents.FAILED,
          data: JSON.stringify({
            error: errorMetadata.errorMessage || (error instanceof Error ? error.message : 'Pre-search failed'),
            errorCategory: errorMetadata.errorCategory,
            isTransient: errorMetadata.isTransientError,
          }),
        });

        // ✅ POSTHOG TRACKING: Track pre-search error
        c.executionCtx.waitUntil(
          trackPreSearchComplete(
            trackingContext,
            {
              traceId: preSearchTraceId,
              parentSpanId: preSearchParentSpanId,
              totalQueries: 0,
              successfulSearches: 0,
              failedSearches: 0,
              totalResults: 0,
            },
            performance.now() - startTime,
            {
              isError: true,
              error: error instanceof Error ? error : new Error(String(error)),
              errorCategory: errorMetadata.errorCategory,
            },
          ),
        );

        // ✅ BUFFER FAILURE: Mark stream as failed and clear active
        const errorMsg = errorMetadata.errorMessage || (error instanceof Error ? error.message : 'Pre-search failed');
        c.executionCtx.waitUntil(
          Promise.all([
            failPreSearchStreamBuffer(streamId, errorMsg, c.env),
            clearActivePreSearchStream(threadId, roundNum, c.env),
          ]),
        );
      }
    });
  },
);

// ============================================================================
// LIST PRE-SEARCHES HANDLER
// ============================================================================

/**
 * Get all pre-search results for a thread
 * ✅ FOLLOWS: getThreadAnalysesHandler pattern exactly
 * ✅ ORPHAN CLEANUP: Marks stale STREAMING/PENDING searches as FAILED
 */
export const getThreadPreSearchesHandler: RouteHandler<typeof getThreadPreSearchesRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: IdParamSchema,
    operationName: 'getThreadPreSearches',
  },
  async (c) => {
    const { user } = c.auth();
    const { id: threadId } = c.validated.params;
    const db = await getDbAsync();

    await verifyThreadOwnership(threadId, user.id, db);

    const allPreSearches = await db.query.chatPreSearch.findMany({
      where: eq(tables.chatPreSearch.threadId, threadId),
      orderBy: (fields, { asc }) => [asc(fields.roundNumber)],
    });

    // Mark stale STREAMING/PENDING searches as FAILED
    // ✅ FIX: Check KV buffer for recent activity before marking as orphaned
    // A search with recent KV chunks is still actively running and should not be marked failed
    const potentialOrphans = allPreSearches.filter((search) => {
      if (search.status !== MessageStatuses.STREAMING && search.status !== MessageStatuses.PENDING) {
        return false;
      }

      // Check if timestamp has exceeded orphan cleanup timeout
      return hasTimestampExceededTimeout(search.createdAt, STREAMING_CONFIG.ORPHAN_CLEANUP_TIMEOUT_MS);
    });

    // Filter to truly orphaned searches by checking KV for recent activity
    const orphanedSearches: typeof potentialOrphans = [];
    for (const search of potentialOrphans) {
      const streamId = generatePreSearchStreamId(threadId, search.roundNumber);
      const chunks = await getPreSearchStreamChunks(streamId, c.env);

      // If KV has recent chunks, the stream is still active - don't mark as orphaned
      if (chunks && chunks.length > 0) {
        const lastChunkTime = Math.max(...chunks.map(chunk => chunk.timestamp));
        const isStale = Date.now() - lastChunkTime > STREAMING_CONFIG.STALE_CHUNK_TIMEOUT_MS;

        if (!isStale) {
          // Stream is still active, skip orphan cleanup for this search
          continue;
        }
      }

      // No recent KV activity OR no KV available - this is truly orphaned
      orphanedSearches.push(search);
    }

    if (orphanedSearches.length > 0) {
      // Update orphaned searches to FAILED status
      for (const search of orphanedSearches) {
        // Clean up KV tracking for this orphaned search
        await clearActivePreSearchStream(threadId, search.roundNumber, c.env);

        await db.update(tables.chatPreSearch)
          .set({
            status: MessageStatuses.FAILED,
            errorMessage: 'Search timed out after 2 minutes. This may have been caused by a page refresh or connection issue during streaming.',
          })
          .where(eq(tables.chatPreSearch.id, search.id));
      }

      // Reload pre-searches after cleanup
      const updatedPreSearches = await db.query.chatPreSearch.findMany({
        where: eq(tables.chatPreSearch.threadId, threadId),
        orderBy: (fields, { asc }) => [asc(fields.roundNumber)],
      });

      return Responses.ok(c, {
        items: updatedPreSearches,
        count: updatedPreSearches.length,
      });
    }

    return Responses.ok(c, {
      items: allPreSearches,
      count: allPreSearches.length,
    });
  },
);
