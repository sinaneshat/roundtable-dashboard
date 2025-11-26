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
import { AnalysisStatuses, PreSearchQueryStatuses, PreSearchSseEvents, WebSearchComplexities, WebSearchDepths } from '@/api/core/enums';
import { IdParamSchema, ThreadRoundParamSchema } from '@/api/core/schemas';
import ErrorMetadataService from '@/api/services/error-metadata.service';
import { analyzeQueryComplexity } from '@/api/services/prompts.service';
import { isQuerySearchable, simpleOptimizeQuery } from '@/api/services/query-optimizer.service';
import {
  createSearchCache,
  generateSearchQuery,
  performWebSearch,
  streamSearchQuery,
} from '@/api/services/web-search.service';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import * as tables from '@/db/schema';
import { formatAgeMs, getTimestampAge, hasTimestampExceededTimeout } from '@/db/utils/timestamps';

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

    // Check for stale STREAMING status
    if (existingSearch.status === AnalysisStatuses.STREAMING) {
      // Check if stream has timed out using clean timestamp utilities
      if (hasTimestampExceededTimeout(existingSearch.createdAt, STREAMING_CONFIG.STREAM_TIMEOUT_MS)) {
        // SSE connections can get interrupted without backend knowing
        await db.update(tables.chatPreSearch)
          .set({
            status: AnalysisStatuses.FAILED,
            errorMessage: `Stream timeout after ${formatAgeMs(getTimestampAge(existingSearch.createdAt))} - SSE connection likely interrupted`,
          })
          .where(eq(tables.chatPreSearch.id, existingSearch.id));

        // Continue to create new search below
      } else {
        // Still within timeout window - reject duplicate request
        const ageMs = getTimestampAge(existingSearch.createdAt);
        throw createError.conflict(
          `Pre-search is already in progress (age: ${formatAgeMs(ageMs)}). Please wait for it to complete.`,
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

        // ✅ EARLY CHECK: Skip AI generation for non-searchable queries
        // Prevents AI_NoObjectGeneratedError for greetings, commands, etc.
        const queryIsSearchable = isQuerySearchable(body.userQuery);

        if (!queryIsSearchable) {
          const optimizedQuery = simpleOptimizeQuery(body.userQuery);

          // Create fallback with single query
          multiQueryResult = {
            totalQueries: 1,
            analysisRationale: 'Fallback: Query not suitable for complex search',
            queries: [{
              query: optimizedQuery,
              searchDepth: WebSearchDepths.BASIC,
              complexity: WebSearchComplexities.BASIC,
              rationale: 'Simple query optimization (non-searchable content detected)',
              sourceCount: 3,
              requiresFullContent: false,
              chunksPerSource: 1,
              needsAnswer: 'basic',
              analysis: `Fallback: Query "${body.userQuery}" simplified to "${optimizedQuery}"`,
            }],
          };

          // Send start event for fallback
          await stream.writeSSE({
            event: PreSearchSseEvents.START,
            data: JSON.stringify({
              timestamp: Date.now(),
              userQuery: body.userQuery,
              totalQueries: 1,
              analysisRationale: 'Fallback mode - non-searchable query',
            }),
          });

          // Notify frontend about fallback
          await stream.writeSSE({
            event: PreSearchSseEvents.QUERY,
            data: JSON.stringify({
              timestamp: Date.now(),
              query: optimizedQuery,
              rationale: 'Simple query optimization (non-searchable content detected)',
              searchDepth: WebSearchDepths.BASIC,
              index: 0,
              total: 1,
              fallback: true,
            }),
          });
        } else {
          // ✅ NORMAL FLOW: Attempt AI generation for searchable queries
          try {
            const queryStream = streamSearchQuery(body.userQuery, c.env);

            // ✅ INCREMENTAL STREAMING: Stream each query update as it's generated
            const lastSentQueries: string[] = [];
            let lastTotalQueries = 0;

            for await (const partialResult of queryStream.partialObjectStream) {
            // Send start event once we know totalQueries
              // Coerce string numbers to actual numbers
              const totalQueries = typeof partialResult.totalQueries === 'string'
                ? Number.parseInt(partialResult.totalQueries, 10)
                : partialResult.totalQueries;

              if (totalQueries && totalQueries !== lastTotalQueries) {
                lastTotalQueries = totalQueries;
                await stream.writeSSE({
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
                    await stream.writeSSE({
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

            // Get final complete result
            multiQueryResult = await queryStream.object;

            // ✅ FIX: Send FINAL query events with correct searchDepth values
            // During streaming, partial objects may have incomplete searchDepth (defaulted to 'basic')
            // Send corrected events with the complete data from final result
            if (multiQueryResult?.queries) {
              for (let i = 0; i < multiQueryResult.queries.length; i++) {
                const query = multiQueryResult.queries[i];
                if (query?.query) {
                  await stream.writeSSE({
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
              throw new Error('Query generation failed - no queries produced');
            }
          } catch {
          // ✅ FALLBACK LEVEL 1: Try non-streaming generation (streaming failed silently)
            try {
              multiQueryResult = await generateSearchQuery(body.userQuery, c.env);

              // Validate generation succeeded
              if (!multiQueryResult || !multiQueryResult.queries || multiQueryResult.queries.length === 0) {
                throw new Error('Non-streaming query generation failed - no queries produced');
              }

              // Send start event for non-streaming result
              await stream.writeSSE({
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
                  await stream.writeSSE({
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
            // ✅ FALLBACK LEVEL 2: If all AI fails, use simple query optimizer
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
          }
        } // Close the else block for queryIsSearchable

        // Type guard
        if (!multiQueryResult) {
          throw new Error('Failed to generate search queries');
        }

        // Coerce string numbers to actual numbers
        const rawTotalQueries = typeof multiQueryResult.totalQueries === 'string'
          ? Number.parseInt(multiQueryResult.totalQueries, 10)
          : multiQueryResult.totalQueries;
        const rawGeneratedQueries = multiQueryResult.queries;

        // ✅ COMPLEXITY-AWARE: Limit queries based on user prompt complexity
        // Simple queries (definitions, single facts) = 1 query
        // Moderate queries (how-to, comparisons) = 2 queries max
        // Complex queries (multi-part, research) = 3 queries max
        const complexityResult = analyzeQueryComplexity(body.userQuery);

        // Apply complexity limits - slice queries to maxQueries
        const generatedQueries = rawGeneratedQueries.slice(0, complexityResult.maxQueries);
        const totalQueries = Math.min(rawTotalQueries, complexityResult.maxQueries);

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
        await stream.writeSSE({
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
                status: PreSearchQueryStatuses.COMPLETE,
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

        // Combine all results - NO ANSWER GENERATION during pre-search
        // ✅ TAVILY PATTERN: Expose raw data directly to participants
        // Participants synthesize from raw content, not from pre-generated summaries
        const successfulResults = allResults.filter((r): r is { query: GeneratedSearchQuery; result: WebSearchResult; duration: number } => r.result !== null);
        const allSearchResults = successfulResults.flatMap(r => r.result.results);

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
            results: successfulResults.map(r => ({
              query: r.result!.query,
              answer: null, // No pre-generated answers - participants synthesize from raw data
              results: r.result!.results.map((res: WebSearchResult['results'][number]) => ({
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
            })),
            analysis: multiQueryResult.analysisRationale || `Multi-query search: ${totalQueries} queries`,
            successCount: successfulResults.length,
            failureCount: totalQueries - successfulResults.length,
            totalResults: allSearchResults.length,
            totalTime,
            // ✅ NO combinedAnswer - participants synthesize directly from raw data
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

    // Mark stale STREAMING/PENDING searches as FAILED
    const orphanedSearches = allPreSearches.filter((search) => {
      if (search.status !== AnalysisStatuses.STREAMING && search.status !== AnalysisStatuses.PENDING) {
        return false;
      }

      // Check if timestamp has exceeded orphan cleanup timeout
      return hasTimestampExceededTimeout(search.createdAt, STREAMING_CONFIG.ORPHAN_CLEANUP_TIMEOUT_MS);
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
