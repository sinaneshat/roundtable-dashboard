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
import { TAVILY_COST_PER_SEARCH } from '@roundtable/shared/constants';
import { CreditActions, FinishReasons, IMAGE_MIME_TYPES, MessagePartTypes, MessageRoles, MessageStatuses, PollingStatuses, PreSearchQueryStatuses, PreSearchSseEvents, UIMessageRoles, WebSearchComplexities, WebSearchDepths } from '@roundtable/shared/enums';
import { eq } from 'drizzle-orm';
import { streamSSE } from 'hono/streaming';
import { ulid } from 'ulid';

import { invalidateMessagesCache } from '@/common/cache-utils';
import { ErrorContextBuilders } from '@/common/error-contexts';
import { createError } from '@/common/error-handling';
import { verifyThreadOwnership } from '@/common/permissions';
import type { ImageAnalysisBillingContext } from '@/common/schemas/billing-context';
import { AIModels, createHandler, IdParamSchema, Responses, STREAMING_CONFIG, ThreadRoundParamSchema } from '@/core';
import { getDbAsync } from '@/db';
import * as tables from '@/db';
import { formatAgeMs, getTimestampAge, hasTimestampExceededTimeout } from '@/db/utils/timestamps';
import { extractSessionToken } from '@/lib/auth';
import { log } from '@/lib/logger';
import type { MessagePart } from '@/lib/schemas';
import {
  deductCreditsForAction,
  enforceCredits,
  finalizeCredits,
} from '@/services/billing';
import { getProjectRagContext } from '@/services/context';
import type { PreSearchTrackingContext } from '@/services/errors';
import { buildEmptyResponseError, extractErrorMetadata, extractModelPricing, generateTraceId, initializePreSearchTracking, trackLLMGeneration, trackPreSearchComplete, trackQueryGeneration, trackWebSearchExecution } from '@/services/errors';
import { loadAttachmentContent, loadAttachmentContentUrl } from '@/services/messages';
import { getModelById, initializeOpenRouter, openRouterService } from '@/services/models';
import { analyzeQueryComplexity, IMAGE_ANALYSIS_FOR_SEARCH_PROMPT, simpleOptimizeQuery } from '@/services/prompts';
import {
  createSearchCache,
  generateSearchQuery,
  performWebSearch,
  streamSearchQuery,
} from '@/services/search';
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
  markPreSearchCompletedInExecution,
} from '@/services/streaming';
import { getUserTier } from '@/services/usage';
import type { ApiEnv } from '@/types';
import { generatePreSearchStreamId } from '@/types/streaming';

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
 * @param billingContext - Billing context for credit deduction
 * @returns Description of image contents for search context
 */
async function analyzeImagesForSearchContext(
  fileParts: {
    type: string;
    data?: Uint8Array;
    mimeType?: string;
    filename?: string | undefined;
    url?: string;
    image?: string; // URL for image parts from loadAttachmentContentUrl
    mediaType?: string; // For ModelFilePart compatibility
  }[],
  env: ApiEnv['Bindings'],
  billingContext?: ImageAnalysisBillingContext,
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
      text: IMAGE_ANALYSIS_FOR_SEARCH_PROMPT,
      type: MessagePartTypes.TEXT,
    };

    // Build file parts for images - support both URL-based and data-based parts
    // All parts use type: 'file' for UIMessage compatibility
    const filePartsList = imageFileParts
      .filter(part => (part.data || part.url || part.image) && part.mimeType)
      .map((part) => {
        // URL-based parts (from loadAttachmentContentUrl in production)
        // Check for image URL first (ModelImagePartUrl format), then file URL
        if (part.image?.startsWith('http')) {
          return {
            mediaType: part.mimeType,
            type: 'file' as const,
            url: part.image,
          };
        }
        if (part.url?.startsWith('http')) {
          return {
            mediaType: part.mimeType,
            type: 'file' as const,
            url: part.url,
          };
        }
        // Data URL (already base64 encoded)
        if (part.url?.startsWith('data:')) {
          return {
            mediaType: part.mimeType,
            type: 'file' as const,
            url: part.url,
          };
        }
        // Fallback: Convert Uint8Array to base64 (localhost only)
        if (part.data) {
          const bytes = part.data;
          const chunks: string[] = [];
          const chunkSize = 8192;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
            chunks.push(String.fromCharCode(...chunk));
          }
          const base64 = btoa(chunks.join(''));
          const dataUrl = `data:${part.mimeType};base64,${base64}`;
          return {
            mediaType: part.mimeType,
            type: 'file' as const,
            url: dataUrl,
          };
        }
        return null;
      })
      .filter((part): part is NonNullable<typeof part> => part !== null);

    // Call vision model to analyze images
    const imageAnalysisStartTime = performance.now();
    const result = await openRouterService.generateText({
      maxTokens: 1000, // Enough for detailed description
      messages: [
        {
          id: `img-analysis-${ulid()}`,
          parts: [textPart, ...filePartsList],
          role: UIMessageRoles.USER,
        },
      ],
      modelId: AIModels.IMAGE_ANALYSIS,
      temperature: 0.3, // Lower temperature for more accurate descriptions
    });

    const description = result.text.trim();

    // ✅ BILLING + POSTHOG: Track image analysis costs
    if (billingContext && result.usage) {
      const rawInput = result.usage.inputTokens ?? 0;
      const rawOutput = result.usage.outputTokens ?? 0;
      const safeInputTokens = Number.isFinite(rawInput) ? rawInput : 0;
      const safeOutputTokens = Number.isFinite(rawOutput) ? rawOutput : 0;
      if (safeInputTokens > 0 || safeOutputTokens > 0) {
        // Credit deduction
        billingContext.executionCtx.waitUntil(
          finalizeCredits(billingContext.userId, `presearch-img-analysis-${ulid()}`, {
            action: CreditActions.AI_RESPONSE,
            inputTokens: safeInputTokens,
            modelId: AIModels.IMAGE_ANALYSIS,
            outputTokens: safeOutputTokens,
            threadId: billingContext.threadId,
          }),
        );

        // PostHog LLM tracking with actual provider cost
        const imageModel = getModelById(AIModels.IMAGE_ANALYSIS);
        const imagePricing = extractModelPricing(imageModel);
        const traceId = generateTraceId();

        billingContext.executionCtx.waitUntil(
          trackLLMGeneration(
            {
              modelId: AIModels.IMAGE_ANALYSIS,
              participantId: 'system',
              participantIndex: 0,
              roundNumber: 0,
              threadId: billingContext.threadId,
              threadMode: 'image_analysis',
              userId: billingContext.userId,
            },
            {
              finishReason: result.finishReason,
              text: description,
              usage: {
                inputTokens: safeInputTokens,
                outputTokens: safeOutputTokens,
              },
            },
            [{ content: IMAGE_ANALYSIS_FOR_SEARCH_PROMPT, role: 'user' }],
            traceId,
            imageAnalysisStartTime,
            {
              additionalProperties: {
                image_count: imageFileParts.length,
                operation_type: 'image_analysis',
              },
              modelPricing: imagePricing,
            },
          ),
        );
      }
    }

    if (description) {
      return `[Image Content Analysis]\n${description}`;
    }

    return '';
  } catch (error) {
    // Log error but don't fail the pre-search - continue without image context
    log.ai('warn', 'Pre-search image analysis failed', { error: error instanceof Error ? error.message : String(error) });
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
    operationName: 'executePreSearch',
    validateBody: PreSearchRequestSchema,
    validateParams: ThreadRoundParamSchema,
  },
  async (c) => {
    const { user } = c.auth();
    const { roundNumber, threadId } = c.validated.params;
    const body = c.validated.body;
    const db = await getDbAsync();

    const roundNum = Number.parseInt(roundNumber, 10);
    if (Number.isNaN(roundNum) || roundNum < 0) {
      throw createError.badRequest('Invalid round number', ErrorContextBuilders.validation('round_number'));
    }

    // Verify thread ownership and get thread data (need projectId for context)
    // ✅ FIX: Removed thread.enableWebSearch check - users can enable web search mid-conversation
    // The act of calling this endpoint IS the user's intent to use web search for this round
    // The thread's enableWebSearch is now a default/preference, not a hard restriction
    const thread = await verifyThreadOwnership(threadId, user.id, db);

    // ✅ CREDITS: Enforce credits for web search (1 credit minimum for web search)
    // Skip round completion check - pre-search is PART of the round, not a new round
    // Actual deduction happens per successful query execution
    await enforceCredits(user.id, 1, { skipRoundCheck: true });

    // ✅ DATABASE-FIRST: Check if record exists, create if not
    // Record may not exist when web search is enabled mid-conversation
    // (thread was created without enableWebSearch, user enabled it later)
    // ✅ OPTIMIZED: Select only needed columns for faster query
    let existingSearch = await db.query.chatPreSearch.findFirst({
      columns: {
        completedAt: true,
        createdAt: true,
        errorMessage: true,
        id: true,
        roundNumber: true,
        searchData: true,
        status: true,
        threadId: true,
        userQuery: true,
      },
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
          createdAt: new Date(),
          id: ulid(),
          roundNumber: roundNum,
          status: MessageStatuses.PENDING,
          threadId,
          userQuery: body.userQuery,
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
            errorMessage: `Stream timeout after ${formatAgeMs(getTimestampAge(existingSearch.createdAt))} - SSE connection likely interrupted`,
            status: MessageStatuses.FAILED,
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
                errorMessage: null,
                status: MessageStatuses.PENDING,
              })
              .where(eq(tables.chatPreSearch.id, existingSearch.id));

            // Continue to start fresh stream below (don't return here)
          } else {
            // Buffer is active - return live resume stream
            // ✅ PATTERN: Uses Responses.sse() builder for consistent SSE headers
            const liveStream = createLivePreSearchResumeStream(existingStreamId, c.env);
            return Responses.sse(liveStream, {
              resumedFromBuffer: true,
              streamId: existingStreamId,
            });
          }
        } else {
          // FALLBACK: No active stream ID (KV not available in local dev)
          return Responses.polling(c, {
            message: `Pre-search is in progress (age: ${formatAgeMs(ageMs)}). Please poll for completion.`,
            resourceId: existingSearch.id,
            retryAfterMs: 2000,
            status: PollingStatuses.STREAMING,
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
    const { parentSpanId: preSearchParentSpanId, traceId: preSearchTraceId } = initializePreSearchTracking();

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
        roundNumber: roundNum,
        sessionId: session?.id,
        threadId,
        userId: user.id,
        userQuery: body.userQuery,
        userTier,
      };

      // ✅ PROJECT CONTEXT: Fetch instructions and RAG context to inform query generation
      let projectContext: { instructions?: string | null; ragContext?: string } | undefined;
      if (thread.projectId) {
        const ragResult = await getProjectRagContext({
          ai: c.env.AI,
          db,
          maxResults: 3, // Fewer results for pre-search (focus on query generation)
          projectId: thread.projectId,
          query: body.userQuery,
          userId: user.id,
        });
        if (ragResult.instructions || ragResult.ragContext) {
          projectContext = {
            instructions: ragResult.instructions,
            ragContext: ragResult.ragContext,
          };
        }
      }

      // ✅ Define startTime outside try for error tracking access
      const startTime = performance.now();

      // ✅ FIX: Analyze query complexity UPFRONT before streaming starts
      // This prevents the race condition where frontend sees more queries than will execute
      // Moved from line 860 to here - frontend now only sees queries that WILL execute
      const complexityResult = analyzeQueryComplexity(body.userQuery);
      const maxQueries = complexityResult.maxQueries;

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
              // Use URL-based loading in production to avoid memory-intensive base64 encoding
              const baseUrl = new URL(c.req.url).origin;
              const canUseUrlLoading = Boolean(baseUrl && user.id && c.env.BETTER_AUTH_SECRET);

              const { fileParts } = canUseUrlLoading
                ? await loadAttachmentContentUrl({
                    attachmentIds: body.attachmentIds,
                    baseUrl,
                    db,
                    r2Bucket: c.env.UPLOADS_R2_BUCKET,
                    secret: c.env.BETTER_AUTH_SECRET,
                    threadId,
                    userId: user.id,
                  })
                : await loadAttachmentContent({
                    attachmentIds: body.attachmentIds,
                    db,
                    r2Bucket: c.env.UPLOADS_R2_BUCKET,
                  });

              if (fileParts.length > 0) {
                // Analyze images with vision model to get searchable descriptions
                // ✅ BILLING: Pass billing context for credit deduction
                imageContext = await analyzeImagesForSearchContext(fileParts, c.env, {
                  executionCtx: c.executionCtx,
                  threadId,
                  userId: user.id,
                });
              }
            } catch (error) {
              // Log but don't fail - continue without image context
              log.ai('warn', 'Pre-search failed to load/analyze attachments', { error: error instanceof Error ? error.message : String(error) });
            }
          }

          // ✅ FILE CONTEXT: Include uploaded file content in query generation
          // This ensures search queries are relevant to both user message AND file contents
          // Combine text file context with image analysis context
          let combinedContext = '';
          if (body.fileContext?.trim()) {
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
            const queryStream = await streamSearchQuery(queryMessage, c.env, undefined, projectContext);

            // ✅ INCREMENTAL STREAMING: Stream each query update as it's generated
            // Track best partial result for graceful fallback if final validation fails
            const lastSentQueries: string[] = [];
            let lastTotalQueries = 0;
            // ✅ TYPE: Use generic partial type to handle AI SDK's PartialObject
            let bestPartialResult: {
              totalQueries?: string | number;
              analysisRationale?: string;
              queries?: (Partial<GeneratedSearchQuery> | undefined)[];
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

                // ✅ FIX: Use maxQueries (from complexity analysis) to cap totalQueries
                // This ensures frontend only sees as many queries as will actually execute
                const effectiveTotalQueries = Math.min(totalQueries || 1, maxQueries);

                if (effectiveTotalQueries && effectiveTotalQueries !== lastTotalQueries) {
                  lastTotalQueries = effectiveTotalQueries;
                  await bufferedWriteSSE({
                    data: JSON.stringify({
                      analysisRationale: partialResult.analysisRationale || '',
                      timestamp: Date.now(),
                      totalQueries: effectiveTotalQueries,
                      userQuery: body.userQuery,
                    }),
                    event: PreSearchSseEvents.START,
                  });
                }

                // ✅ FIX: Only stream queries up to maxQueries limit
                // Prevents race condition where frontend shows skeleton cards for queries that won't execute
                if (partialResult.queries && partialResult.queries.length > 0) {
                  const queriesToStream = Math.min(partialResult.queries.length, maxQueries);
                  for (let i = 0; i < queriesToStream; i++) {
                    const query = partialResult.queries[i];
                    if (query?.query && query.query !== lastSentQueries[i]) {
                      await bufferedWriteSSE({
                        data: JSON.stringify({
                          index: i,
                          query: query.query || '',
                          rationale: query.rationale || '',
                          searchDepth: query.searchDepth || WebSearchDepths.BASIC,
                          timestamp: Date.now(),
                          total: effectiveTotalQueries,
                        }),
                        event: PreSearchSseEvents.QUERY,
                      });
                      lastSentQueries[i] = query.query;
                    }
                  }
                }
              }
            } catch (streamErr) {
              log.ai('error', 'Pre-search query streaming error', { error: streamErr instanceof Error ? streamErr.message : String(streamErr) });
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
                    analysisRationale: bestPartialResult.analysisRationale || 'Recovered from streaming partial result',
                    queries: validQueries.map((q): GeneratedSearchQuery => ({
                      analysis: q.analysis,
                      chunksPerSource: q.chunksPerSource,
                      // Optional fields with defaults
                      complexity: q.complexity || WebSearchComplexities.MODERATE,
                      includeImageDescriptions: q.includeImageDescriptions,
                      includeImages: q.includeImages,
                      needsAnswer: q.needsAnswer,
                      query: q.query, // Already validated to exist
                      rationale: q.rationale || 'Query from partial streaming result',
                      requiresFullContent: q.requiresFullContent,
                      searchDepth: q.searchDepth || WebSearchDepths.ADVANCED,
                      sourceCount: q.sourceCount,
                      timeRange: q.timeRange,
                      topic: q.topic,
                    })),
                    totalQueries: validQueries.length,
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
            // ✅ ALSO: Limit to maxQueries to match what will actually execute
            if (multiQueryResult?.queries) {
              const finalQueriesToSend = Math.min(multiQueryResult.queries.length, maxQueries);
              for (let i = 0; i < finalQueriesToSend; i++) {
                const query = multiQueryResult.queries[i];
                if (query?.query) {
                  await bufferedWriteSSE({
                    data: JSON.stringify({
                      final: true, // Flag to indicate this is the final/corrected data
                      index: i,
                      query: query.query,
                      rationale: query.rationale || '',
                      searchDepth: query.searchDepth || WebSearchDepths.ADVANCED,
                      timestamp: Date.now(),
                      total: finalQueriesToSend,
                    }),
                    event: PreSearchSseEvents.QUERY,
                  });
                }
              }
            }

            // Validate generation succeeded
            if (!multiQueryResult?.queries || multiQueryResult.queries.length === 0) {
              throw createError.internal(
                'Query generation failed - no queries produced',
                {
                  errorType: 'external_service',
                  operation: 'stream_query_generation',
                  service: 'openrouter',
                },
              );
            }

            // ✅ BILLING: Deduct credits for query generation AI call (streaming)
            try {
              const queryUsage = await queryStream.usage;
              if (queryUsage) {
                const rawInput = queryUsage.inputTokens ?? 0;
                const rawOutput = queryUsage.outputTokens ?? 0;
                const safeInputTokens = Number.isFinite(rawInput) ? rawInput : 0;
                const safeOutputTokens = Number.isFinite(rawOutput) ? rawOutput : 0;
                if (safeInputTokens > 0 || safeOutputTokens > 0) {
                  c.executionCtx.waitUntil(
                    finalizeCredits(user.id, `presearch-query-${streamId}`, {
                      action: CreditActions.AI_RESPONSE,
                      inputTokens: safeInputTokens,
                      modelId: AIModels.WEB_SEARCH,
                      outputTokens: safeOutputTokens,
                      threadId,
                    }),
                  );
                }
              }
            } catch (billingError) {
              log.billing('error', 'Pre-search query generation billing failed', { error: billingError instanceof Error ? billingError.message : String(billingError) });
            }
          } catch {
          // ✅ FALLBACK LEVEL 1: Try non-streaming generation (streaming failed completely)
            try {
              const queryGenResult = await generateSearchQuery(body.userQuery, c.env, undefined, projectContext);
              multiQueryResult = queryGenResult.output;

              // Validate generation succeeded
              if (!multiQueryResult?.queries || multiQueryResult.queries.length === 0) {
                throw createError.internal(
                  'Non-streaming query generation failed - no queries produced',
                  {
                    errorType: 'external_service',
                    operation: 'non_stream_query_generation',
                    service: 'openrouter',
                  },
                );
              }

              // ✅ BILLING: Deduct credits for query generation AI call (non-streaming)
              if (queryGenResult.usage) {
                const rawInput = queryGenResult.usage.inputTokens ?? 0;
                const rawOutput = queryGenResult.usage.outputTokens ?? 0;
                const safeInputTokens = Number.isFinite(rawInput) ? rawInput : 0;
                const safeOutputTokens = Number.isFinite(rawOutput) ? rawOutput : 0;
                if (safeInputTokens > 0 || safeOutputTokens > 0) {
                  c.executionCtx.waitUntil(
                    finalizeCredits(user.id, `presearch-query-fallback-${streamId}`, {
                      action: CreditActions.AI_RESPONSE,
                      inputTokens: safeInputTokens,
                      modelId: AIModels.WEB_SEARCH,
                      outputTokens: safeOutputTokens,
                      threadId,
                    }),
                  );
                }
              }

              // Send start event for non-streaming result
              await bufferedWriteSSE({
                data: JSON.stringify({
                  analysisRationale: multiQueryResult.analysisRationale || '',
                  timestamp: Date.now(),
                  totalQueries: multiQueryResult.totalQueries,
                  userQuery: body.userQuery,
                }),
                event: PreSearchSseEvents.START,
              });

              // Send all queries at once (non-streaming)
              for (let i = 0; i < multiQueryResult.queries.length; i++) {
                const query = multiQueryResult.queries[i];
                if (query) {
                  await bufferedWriteSSE({
                    data: JSON.stringify({
                      index: i,
                      query: query.query || '',
                      rationale: query.rationale || '',
                      searchDepth: query.searchDepth || WebSearchDepths.BASIC,
                      timestamp: Date.now(),
                      total: multiQueryResult.totalQueries,
                    }),
                    event: PreSearchSseEvents.QUERY,
                  });
                }
              }
            } catch {
              // ✅ FALLBACK: If AI generation fails, extract key terms from user input
              const optimizedQuery = simpleOptimizeQuery(body.userQuery);

              // Create fallback with single query using extracted terms
              multiQueryResult = {
                analysisRationale: 'Searching based on key terms from your message',
                queries: [{
                  analysis: `Extracting search terms from: "${body.userQuery}"`,
                  chunksPerSource: 1,
                  complexity: WebSearchComplexities.MODERATE,
                  needsAnswer: 'basic',
                  query: optimizedQuery,
                  rationale: 'Searching for relevant information based on your input',
                  requiresFullContent: false,
                  searchDepth: WebSearchDepths.BASIC,
                  sourceCount: 4,
                }],
                totalQueries: 1,
              };

              // Send start event
              await bufferedWriteSSE({
                data: JSON.stringify({
                  analysisRationale: 'Searching based on key terms from your message',
                  timestamp: Date.now(),
                  totalQueries: 1,
                  userQuery: body.userQuery,
                }),
                event: PreSearchSseEvents.START,
              });

              // Send query event
              const fallbackQuery = multiQueryResult.queries[0];
              if (fallbackQuery) {
                await bufferedWriteSSE({
                  data: JSON.stringify({
                    index: 0,
                    query: fallbackQuery.query,
                    rationale: fallbackQuery.rationale,
                    searchDepth: WebSearchDepths.BASIC,
                    timestamp: Date.now(),
                    total: 1,
                  }),
                  event: PreSearchSseEvents.QUERY,
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
              operation: 'query_generation',
              service: 'openrouter',
            },
          );
        }

        const rawGeneratedQueries = multiQueryResult.queries;

        // ✅ COMPLEXITY-AWARE: Limit queries based on user prompt complexity
        // Simple queries (definitions, single facts) = 1 query
        // Moderate queries (how-to, comparisons) = 2 queries max
        // Complex queries (multi-part, research) = 3 queries max
        // NOTE: complexityResult and maxQueries already computed UPFRONT before streaming
        // to prevent race condition where frontend sees more queries than will execute

        // Apply complexity limits - slice queries to maxQueries
        // ✅ FIX: Filter out queries with empty/whitespace-only query strings (can occur from partial AI streaming)
        // ✅ BUG FIX: Preserve original indices to match query events sent earlier
        // Query events use indices from the RAW array, so result events must use the same indices
        const generatedQueries = rawGeneratedQueries
          .slice(0, maxQueries)
          .map((q, originalIndex) => ({ ...q, _originalIndex: originalIndex }))
          .filter(q => q.query && q.query.trim().length > 0);
        const totalQueries = Math.min(generatedQueries.length, maxQueries);

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
          data: JSON.stringify({
            analysisRationale: multiQueryResult.analysisRationale,
            complexity: complexityResult.complexity,
            complexityReasoning: complexityResult.reasoning,
            timestamp: Date.now(),
            totalQueries,
            userQuery: body.userQuery,
          }),
          event: PreSearchSseEvents.START,
        });

        // ✅ POSTHOG TRACKING: Track query generation completion
        const queryGenerationDuration = performance.now() - queryGenerationStartTime;
        c.executionCtx.waitUntil(
          trackQueryGeneration(
            trackingContext,
            {
              analysisRationale: multiQueryResult.analysisRationale || '',
              complexity: complexityResult.complexity,
              modelId: AIModels.WEB_SEARCH,
              parentSpanId: preSearchParentSpanId,
              queriesGenerated: totalQueries,
              traceId: preSearchTraceId,
            },
            queryGenerationDuration,
          ),
        );

        // ✅ MULTI-QUERY EXECUTION: Execute all queries and collect results
        const allResults: { query: GeneratedSearchQuery; result: WebSearchResult | null; duration: number }[] = [];

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
                data: JSON.stringify({
                  answer: result.answer,
                  index: generatedQuery._originalIndex,
                  query: result.query,
                  responseTime: 0,
                  resultCount: result.results.length,
                  results: result.results,
                  timestamp: Date.now(),
                  total: totalQueries,
                }),
                event: PreSearchSseEvents.RESULT,
              });
              allResults.push({ duration: 0, query: generatedQuery, result });
              continue;
            }
          }

          // Execute search for this query
          const searchStartTime = performance.now();
          try {
            // Send initial "searching" state
            await bufferedWriteSSE({
              data: JSON.stringify({
                answer: null,
                index: generatedQuery._originalIndex,
                query: generatedQuery.query,
                responseTime: 0,
                resultCount: 0,
                results: [],
                status: 'searching',
                timestamp: Date.now(),
                total: totalQueries,
              }),
              event: PreSearchSseEvents.RESULT,
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
                autoParameters: false,
                chunksPerSource: chunksPerSource ?? 2,
                includeAnswer: false, // ✅ NO ANSWER - raw data only
                includeFavicon: true,
                includeImageDescriptions: false, // Skip AI descriptions for speed
                includeImages: true, // ✅ ALWAYS include images from pages
                includeRawContent: 'markdown', // ✅ ALWAYS include raw markdown content
                maxResults: sourceCount ?? defaultSourceCount,
                query: generatedQuery.query,
                searchDepth: generatedQuery.searchDepth ?? WebSearchDepths.ADVANCED,
                timeRange: generatedQuery.timeRange,
                topic: generatedQuery.topic,
              },
              c.env,
              complexity,
              undefined, // logger
              { threadId, userId: user.id }, // ✅ BILLING: Pass billing context
            );
            const searchDuration = performance.now() - searchStartTime;

            searchCache.set(generatedQuery.query, result);

            // Stream results progressively
            if (result.results.length > 0) {
              for (let i = 0; i < result.results.length; i++) {
                await bufferedWriteSSE({
                  data: JSON.stringify({
                    answer: null,
                    index: generatedQuery._originalIndex,
                    query: result.query,
                    responseTime: searchDuration,
                    resultCount: i + 1,
                    results: result.results.slice(0, i + 1),
                    status: 'processing',
                    timestamp: Date.now(),
                    total: totalQueries,
                  }),
                  event: PreSearchSseEvents.RESULT,
                });

                if (i < result.results.length - 1) {
                  await new Promise((resolve) => {
                    setTimeout(resolve, 50);
                  });
                }
              }
            }

            // Send final result for this query
            await bufferedWriteSSE({
              data: JSON.stringify({
                answer: null,
                index: generatedQuery._originalIndex,
                query: result.query,
                responseTime: searchDuration,
                resultCount: result.results.length,
                results: result.results,
                status: PreSearchQueryStatuses.COMPLETE,
                timestamp: Date.now(),
                total: totalQueries,
              }),
              event: PreSearchSseEvents.RESULT,
            });

            allResults.push({ duration: searchDuration, query: generatedQuery, result });

            // ✅ POSTHOG TRACKING: Track successful web search execution with actual cost
            c.executionCtx.waitUntil(
              trackWebSearchExecution(
                trackingContext,
                {
                  parentSpanId: preSearchParentSpanId,
                  resultsCount: result.results.length,
                  searchDepth: generatedQuery.searchDepth || 'basic',
                  searchIndex: queryIndex,
                  searchQuery: generatedQuery.query,
                  totalSearches: totalQueries,
                  traceId: preSearchTraceId,
                },
                searchDuration,
                { cacheHit: false, searchCostUsd: TAVILY_COST_PER_SEARCH },
              ),
            );

            // ✅ CREDITS: Deduct for successful web search query
            c.executionCtx.waitUntil(
              deductCreditsForAction(user.id, 'webSearchQuery', { threadId }),
            );
          } catch (error) {
            const searchDurationOnError = performance.now() - searchStartTime;

            await bufferedWriteSSE({
              data: JSON.stringify({
                answer: null,
                error: error instanceof Error ? error.message : 'Search failed',
                index: generatedQuery._originalIndex,
                query: generatedQuery.query,
                responseTime: 0,
                resultCount: 0,
                results: [],
                status: 'error',
                timestamp: Date.now(),
                total: totalQueries,
              }),
              event: PreSearchSseEvents.RESULT,
            });
            allResults.push({ duration: 0, query: generatedQuery, result: null });

            // ✅ POSTHOG TRACKING: Track failed web search execution
            c.executionCtx.waitUntil(
              trackWebSearchExecution(
                trackingContext,
                {
                  parentSpanId: preSearchParentSpanId,
                  resultsCount: 0,
                  searchDepth: generatedQuery.searchDepth || 'basic',
                  searchIndex: queryIndex,
                  searchQuery: generatedQuery.query,
                  totalSearches: totalQueries,
                  traceId: preSearchTraceId,
                },
                searchDurationOnError,
                {
                  error: error instanceof Error ? error : new Error(String(error)),
                  isError: true,
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
          data: JSON.stringify({
            failedSearches: totalQueries - successfulResults.length,
            successfulSearches: successfulResults.length,
            timestamp: Date.now(),
            totalResults: allSearchResults.length,
            totalSearches: totalQueries,
          }),
          event: PreSearchSseEvents.COMPLETE,
        });

        // Save results to database
        // ✅ TAVILY PATTERN: Store raw results with full content, no summaries
        if (isSuccess) {
          const searchData = {
            failureCount: totalQueries - successfulResults.length,
            queries: allResults.map((r, idx) => ({
              index: idx,
              query: r.query.query,
              rationale: r.query.rationale,
              searchDepth: r.query.searchDepth || WebSearchDepths.BASIC,
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
                answer: null, // No pre-generated answers - participants synthesize from raw data
                index: originalIdx >= 0 ? originalIdx : idx, // ✅ Original query index for matching
                query: searchResult.query,
                responseTime: r.duration,
                results: searchResult.results.map((res: WebSearchResult['results'][number]) => ({
                  content: res.content,
                  domain: res.domain,
                  excerpt: res.excerpt,
                  fullContent: res.fullContent, // ✅ CRITICAL: Full scraped content
                  images: res.images,
                  metadata: res.metadata,
                  publishedDate: res.publishedDate ?? null,
                  rawContent: res.rawContent, // ✅ CRITICAL: Raw markdown content
                  score: res.score,
                  title: res.title,
                  url: res.url,
                })),
              };
            }),
            successCount: successfulResults.length,
            summary: multiQueryResult.analysisRationale || `Multi-query search: ${totalQueries} queries`,
            totalResults: allSearchResults.length,
            totalTime,
            // ✅ NO combinedAnswer - participants synthesize directly from raw data
          };

          // Update search record
          await db.update(tables.chatPreSearch)
            .set({
              completedAt: new Date(),
              searchData,
              status: MessageStatuses.COMPLETE,
            })
            .where(eq(tables.chatPreSearch.id, existingSearch.id));

          // ✅ TYPE-SAFE: Create message record with properly typed pre-search metadata
          const preSearchMsgId = `pre-search-${roundNum}-${ulid()}`;
          await db.insert(tables.chatMessage)
            .values({
              createdAt: new Date(),
              id: preSearchMsgId,
              // ✅ TYPE-SAFE: Use DbPreSearchMessageMetadata discriminated union
              metadata: {
                isPreSearch: true as const,
                preSearch: searchData,
                role: UIMessageRoles.SYSTEM,
                roundNumber: roundNum,
              },
              parts: [{
                text: JSON.stringify({ type: 'web_search_results', ...searchData }),
                type: MessagePartTypes.TEXT,
              }] satisfies MessagePart[],
              role: MessageRoles.ASSISTANT,
              roundNumber: roundNum,
              threadId,
            })
            .onConflictDoNothing();

          // Invalidate message cache after inserting pre-search results
          await invalidateMessagesCache(db, threadId);

          // Send final done event with complete data
          await bufferedWriteSSE({
            data: JSON.stringify(searchData),
            event: PreSearchSseEvents.DONE,
          });

          // ✅ POSTHOG TRACKING: Track successful pre-search completion with total cost
          c.executionCtx.waitUntil(
            trackPreSearchComplete(
              trackingContext,
              {
                failedSearches: totalQueries - successfulResults.length,
                parentSpanId: preSearchParentSpanId,
                successfulSearches: successfulResults.length,
                totalQueries,
                totalResults: allSearchResults.length,
                totalWebSearchCostUsd: successfulResults.length * TAVILY_COST_PER_SEARCH,
                traceId: preSearchTraceId,
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

          // ✅ ORCHESTRATION: Trigger next phase (participants) via queue
          // Extract session token for queue authentication
          const sessionToken = extractSessionToken(c.req.header('cookie'));
          if (!sessionToken) {
            log.auth('warn', 'PreSearch no session token found', { cookieHeader: c.req.header('cookie')?.slice(0, 50) ?? 'none' });
          }
          if (sessionToken) {
            c.executionCtx.waitUntil(
              markPreSearchCompletedInExecution(
                db,
                threadId,
                roundNum,
                c.env.ROUND_ORCHESTRATION_QUEUE,
                sessionToken,
                c.env,
                body.attachmentIds,
              ),
            );
          }
        } else {
          // Mark as failed if no successful searches
          // ✅ UNIFIED ERROR HANDLING: Use ErrorMetadataService for consistent error categorization
          const errorMetadata = buildEmptyResponseError({
            finishReason: FinishReasons.FAILED,
            inputTokens: 0,
            outputTokens: 0,
          });

          await db.update(tables.chatPreSearch)
            .set({
              errorMessage: errorMetadata.errorMessage || 'No successful searches completed',
              status: MessageStatuses.FAILED,
            })
            .where(eq(tables.chatPreSearch.id, existingSearch.id));

          await bufferedWriteSSE({
            data: JSON.stringify({
              error: errorMetadata.errorMessage || 'No successful searches completed',
              errorCategory: errorMetadata.errorCategory,
            }),
            event: PreSearchSseEvents.FAILED,
          });

          // ✅ POSTHOG TRACKING: Track failed pre-search (no successful searches)
          c.executionCtx.waitUntil(
            trackPreSearchComplete(
              trackingContext,
              {
                failedSearches: totalQueries,
                parentSpanId: preSearchParentSpanId,
                successfulSearches: 0,
                totalQueries,
                totalResults: 0,
                traceId: preSearchTraceId,
              },
              totalTime,
              {
                errorCategory: errorMetadata.errorCategory,
                isError: true,
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
          finishReason: FinishReasons.ERROR,
          providerMetadata: {},
          response: error,
          text: '',
          usage: { inputTokens: 0, outputTokens: 0 },
        });

        await db.update(tables.chatPreSearch)
          .set({
            errorMessage: errorMetadata.errorMessage || (error instanceof Error ? error.message : 'Unknown error'),
            status: MessageStatuses.FAILED,
          })
          .where(eq(tables.chatPreSearch.id, existingSearch.id));

        await bufferedWriteSSE({
          data: JSON.stringify({
            error: errorMetadata.errorMessage || (error instanceof Error ? error.message : 'Pre-search failed'),
            errorCategory: errorMetadata.errorCategory,
            isTransient: errorMetadata.isTransientError,
          }),
          event: PreSearchSseEvents.FAILED,
        });

        // ✅ POSTHOG TRACKING: Track pre-search error
        c.executionCtx.waitUntil(
          trackPreSearchComplete(
            trackingContext,
            {
              failedSearches: 0,
              parentSpanId: preSearchParentSpanId,
              successfulSearches: 0,
              totalQueries: 0,
              totalResults: 0,
              traceId: preSearchTraceId,
            },
            performance.now() - startTime,
            {
              error: error instanceof Error ? error : new Error(String(error)),
              errorCategory: errorMetadata.errorCategory,
              isError: true,
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
 * ✅ ORPHAN CLEANUP: Fire-and-forget via waitUntil (non-blocking)
 */
export const getThreadPreSearchesHandler: RouteHandler<typeof getThreadPreSearchesRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'getThreadPreSearches',
    validateParams: IdParamSchema,
  },
  async (c) => {
    const { user } = c.auth();
    const { id: threadId } = c.validated.params;
    const db = await getDbAsync();

    await verifyThreadOwnership(threadId, user.id, db);

    // ✅ OPTIMIZED: Select only needed columns for faster query
    const allPreSearches = await db.query.chatPreSearch.findMany({
      columns: {
        completedAt: true,
        createdAt: true,
        errorMessage: true,
        id: true,
        roundNumber: true,
        searchData: true,
        status: true,
        threadId: true,
        userQuery: true,
      },
      orderBy: (fields, { asc }) => [asc(fields.roundNumber)],
      where: eq(tables.chatPreSearch.threadId, threadId),
    });

    // ✅ NON-BLOCKING: Fire-and-forget orphan cleanup via waitUntil
    // Don't block response - orphan cleanup happens in background
    // Next request will see updated status if cleanup was needed
    const potentialOrphans = allPreSearches.filter((search) => {
      if (search.status !== MessageStatuses.STREAMING && search.status !== MessageStatuses.PENDING) {
        return false;
      }
      return hasTimestampExceededTimeout(search.createdAt, STREAMING_CONFIG.ORPHAN_CLEANUP_TIMEOUT_MS);
    });

    if (potentialOrphans.length > 0) {
      // ✅ FIRE-AND-FORGET: Orphan cleanup runs after response is sent
      c.executionCtx.waitUntil(
        cleanupOrphanedPreSearches(potentialOrphans, threadId, db, c.env),
      );
    }

    // ✅ RETURN IMMEDIATELY: Don't wait for orphan cleanup
    // Client sees current state; any orphans will be cleaned on next request
    return Responses.ok(c, {
      count: allPreSearches.length,
      items: allPreSearches,
    });
  },
);

/**
 * Background orphan cleanup - runs via waitUntil after response is sent
 */
async function cleanupOrphanedPreSearches(
  potentialOrphans: {
    id: string;
    threadId: string;
    roundNumber: number;
    status: string;
    createdAt: Date;
  }[],
  threadId: string,
  db: Awaited<ReturnType<typeof getDbAsync>>,
  env: ApiEnv['Bindings'],
): Promise<void> {
  try {
    // Check KV for each potential orphan to confirm it's truly orphaned
    const orphanChecks = await Promise.all(
      potentialOrphans.map(async (search) => {
        const streamId = generatePreSearchStreamId(threadId, search.roundNumber);
        const chunks = await getPreSearchStreamChunks(streamId, env);

        if (chunks && chunks.length > 0) {
          const lastChunkTime = Math.max(...chunks.map(chunk => chunk.timestamp));
          const isStale = Date.now() - lastChunkTime > STREAMING_CONFIG.STALE_CHUNK_TIMEOUT_MS;
          if (!isStale) {
            return { isOrphaned: false, search };
          }
        }
        return { isOrphaned: true, search };
      }),
    );

    const orphanedSearches = orphanChecks
      .filter(check => check.isOrphaned)
      .map(check => check.search);

    if (orphanedSearches.length === 0) {
      return;
    }

    // Clean up KV and update DB in parallel
    await Promise.all([
      // Clear KV tracking
      ...orphanedSearches.map(async search =>
        await clearActivePreSearchStream(threadId, search.roundNumber, env),
      ),
      // Update DB status
      ...orphanedSearches.map(search =>
        db.update(tables.chatPreSearch)
          .set({
            errorMessage: 'Search timed out. May have been caused by page refresh or connection issue.',
            status: MessageStatuses.FAILED,
          })
          .where(eq(tables.chatPreSearch.id, search.id)),
      ),
    ]);
  } catch {
    // Silently fail - orphan cleanup is best-effort
    // Will be retried on next request
  }
}
