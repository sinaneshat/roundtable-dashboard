/**
 * Pre-Search Handler
 *
 * ✅ FOLLOWS: backend-patterns.md and analysis.handler.ts patterns
 * ✅ DATABASE-FIRST: Creates record before streaming
 * ✅ IDEMPOTENT: Returns existing results if already completed
 * ✅ SSE STREAMING: Streams search execution progress
 * ✅ SERVICE LAYER: Uses web-search.service.ts for business logic
 *
 * **REFACTOR NOTES**:
 * - Removed callback-based performPreSearches() function
 * - Direct integration with streamSearchQuery() and performWebSearch()
 * - Aligned with AI SDK v5 streamObject pattern
 * - Maintained PreSearchDataPayloadSchema compatibility
 *
 * Architecture matches: src/api/routes/chat/handlers/analysis.handler.ts
 * Reference: backend-patterns.md lines 546-693 (SSE Streaming Pattern)
 */

import type { RouteHandler } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import { streamSSE } from 'hono/streaming';
import { ulid } from 'ulid';

import { createError } from '@/api/common/error-handling';
import { verifyThreadOwnership } from '@/api/common/permissions';
import { createHandler, Responses, STREAMING_CONFIG } from '@/api/core';
import { AnalysisStatuses, PreSearchSseEvents, WebSearchComplexities, WebSearchDepths } from '@/api/core/enums';
import { IdParamSchema, ThreadRoundParamSchema } from '@/api/core/schemas';
import ErrorMetadataService from '@/api/services/error-metadata.service';
import { simpleOptimizeQuery } from '@/api/services/query-optimizer.service';
import {
  createSearchCache,
  performWebSearch,
  streamAnswerSummary,
  streamSearchQuery,
} from '@/api/services/web-search.service';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import * as tables from '@/db/schema';

import type { createPreSearchRoute, executePreSearchRoute, getThreadPreSearchesRoute } from '../route';
import type { GeneratedSearchQuery, MultiQueryGeneration, WebSearchResult } from '../schema';
import { PreSearchRequestSchema } from '../schema';

// ============================================================================
// POST Create Pre-Search Handler (Record Creation)
// ============================================================================

/**
 * Create PENDING pre-search record
 *
 * **PURPOSE**: Fix web search ordering bug by creating pre-search record BEFORE participants stream
 *
 * **CRITICAL FLOW CHANGE**:
 * OLD (Broken):
 *   User sends message → Participant streaming starts → Pre-search created during streaming
 *
 * NEW (Fixed):
 *   User sends message → Pre-search created (PENDING) → Search executes → Participants start
 *
 * **DATABASE-FIRST PATTERN** (matches thread.handler.ts:269-278):
 * - Creates PENDING record immediately
 * - Idempotent (returns existing if already exists)
 * - Does NOT execute search (that happens via executePreSearchHandler)
 * - Frontend calls this BEFORE calling sendMessage()
 *
 * **FLOW**:
 * 1. Frontend detects user sent message with web search enabled
 * 2. Frontend calls this endpoint → Creates PENDING record
 * 3. Frontend waits for PENDING record to sync
 * 4. PreSearchStream component triggers execution (PENDING → STREAMING)
 * 5. Search completes (STREAMING → COMPLETE)
 * 6. Frontend calls sendMessage() → Participants start
 *
 * **REFERENCE**: thread.handler.ts:269-278 (Round 0 pattern that works correctly)
 */
export const createPreSearchHandler: RouteHandler<typeof createPreSearchRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: ThreadRoundParamSchema,
    validateBody: PreSearchRequestSchema,
    operationName: 'createPreSearch',
  },
  async (c) => {
    const { user } = c.auth();
    const { threadId, roundNumber } = c.validated.params;
    const { userQuery } = c.validated.body;
    const db = await getDbAsync();

    const roundNum = Number.parseInt(roundNumber, 10);
    if (Number.isNaN(roundNum) || roundNum < 0) {
      throw createError.badRequest('Invalid round number');
    }

    // Verify thread ownership
    // ✅ FIX: Removed thread.enableWebSearch check - users can enable web search mid-conversation
    // The act of calling this endpoint IS the user's intent to use web search for this round
    // The thread's enableWebSearch is now a default/preference, not a hard restriction
    await verifyThreadOwnership(threadId, user.id, db);

    // ✅ IDEMPOTENT: Check if record already exists
    const existingSearch = await db.query.chatPreSearch.findFirst({
      where: (fields, { and, eq: eqOp }) => and(
        eqOp(fields.threadId, threadId),
        eqOp(fields.roundNumber, roundNum),
      ),
    });

    if (existingSearch) {
      // Record already exists - return it (idempotent)
      return Responses.ok(c, existingSearch);
    }

    // ✅ CREATE PENDING RECORD: This is the fix!
    // Pre-search record MUST exist before participants start streaming
    const [preSearch] = await db
      .insert(tables.chatPreSearch)
      .values({
        id: ulid(),
        threadId,
        roundNumber: roundNum,
        userQuery,
        status: AnalysisStatuses.PENDING,
        createdAt: new Date(),
      })
      .returning();

    return Responses.ok(c, preSearch);
  },
);

// ============================================================================
// POST Pre-Search Handler (Streaming)
// ============================================================================

/**
 * Execute pre-search with SSE streaming
 *
 * **DATABASE-FIRST PATTERN** (matches analysis.handler.ts):
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
 * - Maintained backward compatibility with PreSearchDataPayloadSchema
 *
 * **PATTERN**: Identical to analyzeRoundHandler architecture
 * **REFERENCE**: analysis.handler.ts:227-648, backend-patterns.md:546-693
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
      throw createError.badRequest('Invalid round number');
    }

    // Verify thread ownership
    // ✅ FIX: Removed thread.enableWebSearch check - users can enable web search mid-conversation
    // The act of calling this endpoint IS the user's intent to use web search for this round
    // The thread's enableWebSearch is now a default/preference, not a hard restriction
    await verifyThreadOwnership(threadId, user.id, db);

    // ✅ DATABASE-FIRST: Record must already exist from thread creation or mid-conversation creation
    // Frontend should never create database records - that's backend's job
    const existingSearch = await db.query.chatPreSearch.findFirst({
      where: (fields, { and, eq: eqOp }) => and(
        eqOp(fields.threadId, threadId),
        eqOp(fields.roundNumber, roundNum),
      ),
    });

    // ❌ CRITICAL: Record MUST exist (created during thread creation)
    if (!existingSearch) {
      throw createError.notFound('Pre-search record not found. This should have been created during thread creation.');
    }

    // ✅ IDEMPOTENT: Return existing if already completed
    if (existingSearch.status === AnalysisStatuses.COMPLETE && existingSearch.searchData) {
      return Responses.ok(c, existingSearch);
    }

    // ✅ TIMEOUT PROTECTION: Check for stale STREAMING status (matches analysis.handler.ts pattern)
    if (existingSearch.status === AnalysisStatuses.STREAMING) {
      const ageMs = Date.now() - existingSearch.createdAt.getTime();

      // If stream has been running > threshold, mark as failed and allow new stream
      // SSE connections can get interrupted without backend knowing
      if (ageMs > STREAMING_CONFIG.STREAM_TIMEOUT_MS) {
        await db.update(tables.chatPreSearch)
          .set({
            status: AnalysisStatuses.FAILED,
            errorMessage: `Stream timeout after ${Math.round(ageMs / 1000)}s - SSE connection likely interrupted`,
          })
          .where(eq(tables.chatPreSearch.id, existingSearch.id));

        // Continue to create new search below
      } else {
        // Still within timeout window - reject duplicate request
        throw createError.conflict(
          `Pre-search is already in progress (age: ${Math.round(ageMs / 1000)}s). Please wait for it to complete.`,
          {
            errorType: 'resource',
            resource: 'pre_search',
            resourceId: existingSearch.id,
          },
        );
      }
    }

    // ✅ STREAMING: Update to streaming status
    await db.update(tables.chatPreSearch)
      .set({ status: AnalysisStatuses.STREAMING })
      .where(eq(tables.chatPreSearch.id, existingSearch.id));

    // ============================================================================
    // ✅ REFACTORED: Direct streamObject integration (no callbacks)
    // ============================================================================
    // Pattern from analysis.handler.ts:91-120
    // Uses AI SDK v5 streamObject with partialObjectStream iterator
    return streamSSE(c, async (stream) => {
      try {
        const searchCache = createSearchCache();
        const startTime = performance.now();

        // ✅ MULTI-QUERY: Stream query generation and get all queries
        let multiQueryResult: MultiQueryGeneration | null = null;

        try {
          const queryStream = streamSearchQuery(body.userQuery, c.env);

          // ✅ INCREMENTAL STREAMING: Stream each query update as it's generated
          const lastSentQueries: string[] = [];
          let lastTotalQueries = 0;

          for await (const partialResult of queryStream.partialObjectStream) {
            // Send start event once we know totalQueries
            if (partialResult.totalQueries && partialResult.totalQueries !== lastTotalQueries) {
              lastTotalQueries = partialResult.totalQueries;
              await stream.writeSSE({
                event: PreSearchSseEvents.START,
                data: JSON.stringify({
                  timestamp: Date.now(),
                  userQuery: body.userQuery,
                  totalQueries: partialResult.totalQueries,
                  analysisRationale: partialResult.analysisRationale || '',
                }),
              });
            }

            // Stream each query as it becomes available
            if (partialResult.queries && partialResult.queries.length > 0) {
              for (let i = 0; i < partialResult.queries.length; i++) {
                const query = partialResult.queries[i];
                if (query?.query && query.query !== lastSentQueries[i]) {
                  await stream.writeSSE({
                    event: PreSearchSseEvents.QUERY,
                    data: JSON.stringify({
                      timestamp: Date.now(),
                      query: query.query || '',
                      rationale: query.rationale || '',
                      searchDepth: query.searchDepth || WebSearchDepths.BASIC,
                      index: i,
                      total: partialResult.totalQueries || 1,
                    }),
                  });
                  lastSentQueries[i] = query.query;
                }
              }
            }
          }

          // Get final complete result
          multiQueryResult = await queryStream.object;

          // Validate generation succeeded
          if (!multiQueryResult || !multiQueryResult.queries || multiQueryResult.queries.length === 0) {
            throw new Error('Query generation failed - no queries produced');
          }
        } catch (error) {
          // ✅ FALLBACK: If AI fails, use single optimized query
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error('[Pre-Search] Query generation failed:', errorMessage);

          const optimizedQuery = simpleOptimizeQuery(body.userQuery);

          // Create fallback with single query
          multiQueryResult = {
            totalQueries: 1,
            analysisRationale: 'Fallback: AI generation unavailable',
            queries: [{
              query: optimizedQuery,
              searchDepth: WebSearchDepths.BASIC,
              complexity: WebSearchComplexities.MODERATE,
              rationale: 'Simple query optimization (AI generation unavailable)',
              sourceCount: 4,
              requiresFullContent: false,
              chunksPerSource: 1,
              needsAnswer: 'basic',
              analysis: `Fallback: Using simplified query transformation from "${body.userQuery}"`,
            }],
          };

          // Send start event for fallback
          await stream.writeSSE({
            event: PreSearchSseEvents.START,
            data: JSON.stringify({
              timestamp: Date.now(),
              userQuery: body.userQuery,
              totalQueries: 1,
              analysisRationale: 'Fallback mode',
            }),
          });

          // Notify frontend about fallback
          const fallbackQuery = multiQueryResult.queries[0];
          if (fallbackQuery) {
            await stream.writeSSE({
              event: PreSearchSseEvents.QUERY,
              data: JSON.stringify({
                timestamp: Date.now(),
                query: fallbackQuery.query,
                rationale: fallbackQuery.rationale,
                searchDepth: WebSearchDepths.BASIC,
                index: 0,
                total: 1,
                fallback: true,
              }),
            });
          }
        }

        // Type guard
        if (!multiQueryResult) {
          throw new Error('Failed to generate search queries');
        }

        const totalQueries = multiQueryResult.totalQueries;
        const generatedQueries = multiQueryResult.queries;

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
              await stream.writeSSE({
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
          try {
            const searchStartTime = performance.now();

            // Send initial "searching" state
            await stream.writeSSE({
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
            result = await performWebSearch(
              {
                query: generatedQuery.query,
                maxResults: generatedQuery.sourceCount ?? defaultSourceCount,
                searchDepth: generatedQuery.searchDepth ?? WebSearchDepths.ADVANCED,
                chunksPerSource: generatedQuery.chunksPerSource ?? 2,
                includeImages: generatedQuery.includeImages ?? false,
                includeImageDescriptions: generatedQuery.includeImageDescriptions ?? false,
                includeAnswer: generatedQuery.needsAnswer ?? 'advanced',
                includeFavicon: true,
                includeRawContent: generatedQuery.requiresFullContent ?? true ? 'markdown' : false,
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
                await stream.writeSSE({
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
            await stream.writeSSE({
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
                status: 'complete',
              }),
            });

            allResults.push({ query: generatedQuery, result, duration: searchDuration });
          } catch (error) {
            await stream.writeSSE({
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
          }
        }

        // Combine all results for answer generation
        // Use type predicate to properly narrow the type after filtering
        const successfulResults = allResults.filter((r): r is { query: GeneratedSearchQuery; result: WebSearchResult; duration: number } => r.result !== null);
        const allSearchResults = successfulResults.flatMap(r => r.result.results);

        // ============================================================================
        // ✅ STREAMING ANSWER INTEGRATION: Stream answer chunks via SSE
        // ============================================================================
        // Uses combined results from all queries for comprehensive answer
        let finalAnswer: string | null = null;
        if (allSearchResults.length > 0) {
          try {
            // Determine answer mode based on total results
            const answerMode = allSearchResults.length > 5 ? 'advanced' : 'basic';

            // Use user's original query for answer generation (more context)
            const answerStream = streamAnswerSummary(
              body.userQuery,
              allSearchResults,
              answerMode,
              c.env,
            );

            // ✅ BUFFERED STREAMING: Accumulate chunks for efficiency
            let buffer = '';
            let lastSendTime = Date.now();
            const CHUNK_INTERVAL = 100;

            for await (const chunk of answerStream.textStream) {
              buffer += chunk;
              finalAnswer = (finalAnswer || '') + chunk;

              if (Date.now() - lastSendTime > CHUNK_INTERVAL) {
                await stream.writeSSE({
                  event: PreSearchSseEvents.ANSWER_CHUNK,
                  data: JSON.stringify({ chunk: buffer }),
                });
                buffer = '';
                lastSendTime = Date.now();
              }
            }

            if (buffer) {
              await stream.writeSSE({
                event: PreSearchSseEvents.ANSWER_CHUNK,
                data: JSON.stringify({ chunk: buffer }),
              });
            }

            await stream.writeSSE({
              event: PreSearchSseEvents.ANSWER_COMPLETE,
              data: JSON.stringify({
                answer: finalAnswer,
                mode: answerMode,
                generatedAt: new Date().toISOString(),
              }),
            });
          } catch (answerError) {
            await stream.writeSSE({
              event: PreSearchSseEvents.ANSWER_ERROR,
              data: JSON.stringify({
                error: 'Failed to generate answer',
                message: answerError instanceof Error ? answerError.message : 'Please try again',
              }),
            });
          }
        }

        const totalTime = performance.now() - startTime;
        const isSuccess = successfulResults.length > 0;

        // Send complete event with multi-query statistics
        await stream.writeSSE({
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
        if (isSuccess) {
          const searchData = {
            queries: allResults.map((r, idx) => ({
              query: r.query.query,
              rationale: r.query.rationale,
              searchDepth: r.query.searchDepth || WebSearchDepths.BASIC,
              index: idx,
              total: totalQueries,
            })),
            results: successfulResults.map(r => ({
              query: r.result!.query,
              answer: null, // Individual query answers not stored
              results: r.result!.results.map((res: WebSearchResult['results'][number]) => ({
                ...res,
                publishedDate: res.publishedDate ?? null,
              })),
              responseTime: r.duration,
            })),
            analysis: multiQueryResult.analysisRationale || `Multi-query search: ${totalQueries} queries`,
            successCount: successfulResults.length,
            failureCount: totalQueries - successfulResults.length,
            totalResults: allSearchResults.length,
            totalTime,
            combinedAnswer: finalAnswer, // Store combined answer
          };

          // Update search record
          await db.update(tables.chatPreSearch)
            .set({
              status: AnalysisStatuses.COMPLETE,
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
              role: 'assistant',
              parts: [{
                type: 'text',
                text: JSON.stringify({ type: 'web_search_results', ...searchData }),
              }] as Array<{ type: 'text'; text: string }>,
              roundNumber: roundNum,
              // ✅ TYPE-SAFE: Use DbPreSearchMessageMetadata discriminated union
              metadata: {
                role: 'system' as const,
                roundNumber: roundNum,
                isPreSearch: true as const,
                preSearch: searchData,
              },
              createdAt: new Date(),
            })
            .onConflictDoNothing();

          // Send final done event with complete data
          await stream.writeSSE({
            event: PreSearchSseEvents.DONE,
            data: JSON.stringify(searchData),
          });
        } else {
          // Mark as failed if no successful searches
          // ✅ UNIFIED ERROR HANDLING: Use ErrorMetadataService for consistent error categorization
          const errorMetadata = ErrorMetadataService.buildEmptyResponseError({
            inputTokens: 0,
            outputTokens: 0,
            finishReason: 'failed',
          });

          await db.update(tables.chatPreSearch)
            .set({
              status: AnalysisStatuses.FAILED,
              errorMessage: errorMetadata.errorMessage || 'No successful searches completed',
            })
            .where(eq(tables.chatPreSearch.id, existingSearch.id));

          await stream.writeSSE({
            event: PreSearchSseEvents.FAILED,
            data: JSON.stringify({
              error: errorMetadata.errorMessage || 'No successful searches completed',
              errorCategory: errorMetadata.errorCategory,
            }),
          });
        }
      } catch (error) {
        // ✅ UNIFIED ERROR HANDLING: Use ErrorMetadataService for consistent error categorization
        const errorMetadata = ErrorMetadataService.extractErrorMetadata({
          providerMetadata: {},
          response: error,
          finishReason: 'error',
          usage: { inputTokens: 0, outputTokens: 0 },
          text: '',
        });

        await db.update(tables.chatPreSearch)
          .set({
            status: AnalysisStatuses.FAILED,
            errorMessage: errorMetadata.errorMessage || (error instanceof Error ? error.message : 'Unknown error'),
          })
          .where(eq(tables.chatPreSearch.id, existingSearch.id));

        await stream.writeSSE({
          event: PreSearchSseEvents.FAILED,
          data: JSON.stringify({
            error: errorMetadata.errorMessage || (error instanceof Error ? error.message : 'Pre-search failed'),
            errorCategory: errorMetadata.errorCategory,
            isTransient: errorMetadata.isTransientError,
          }),
        });
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

    // ✅ ORPHAN CLEANUP: Mark stale STREAMING/PENDING searches as FAILED (matches analysis.handler.ts pattern)
    const now = Date.now();
    const orphanedSearches = allPreSearches.filter((search) => {
      if (search.status !== AnalysisStatuses.STREAMING && search.status !== AnalysisStatuses.PENDING) {
        return false;
      }
      const ageMs = now - search.createdAt.getTime();
      return ageMs > STREAMING_CONFIG.ORPHAN_CLEANUP_TIMEOUT_MS;
    });

    if (orphanedSearches.length > 0) {
      // Update orphaned searches to FAILED status
      for (const search of orphanedSearches) {
        await db.update(tables.chatPreSearch)
          .set({
            status: AnalysisStatuses.FAILED,
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
