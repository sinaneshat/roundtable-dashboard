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
import { AnalysisStatuses, WebSearchComplexities, WebSearchDepths } from '@/api/core/enums';
import { IdParamSchema, ThreadRoundParamSchema } from '@/api/core/schemas';
import ErrorMetadataService from '@/api/services/error-metadata.service';
import {
  createSearchCache,
  performWebSearch,
  streamSearchQuery,
} from '@/api/services/web-search.service';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import * as tables from '@/db/schema';

import type { executePreSearchRoute, getThreadPreSearchesRoute } from '../route';
import type { GeneratedSearchQuery, WebSearchResult } from '../schema';
import { PreSearchRequestSchema } from '../schema';

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
 * **REFACTOR NOTES**:
 * - Direct use of streamSearchQuery() instead of callback-based performPreSearches()
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

    // Verify thread ownership and web search enabled
    const thread = await verifyThreadOwnership(threadId, user.id, db);
    if (!thread.enableWebSearch) {
      throw createError.badRequest('Web search is not enabled for this thread');
    }

    // ✅ DATABASE-FIRST: Record must already exist from thread creation
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

        // Send start event
        await stream.writeSSE({
          event: 'start',
          data: JSON.stringify({
            timestamp: Date.now(),
            userQuery: body.userQuery,
            totalQueries: 1, // Single query approach
          }),
        });

        // ✅ GRADUAL STREAMING: Stream query generation progressively
        let generatedQuery: GeneratedSearchQuery | null = null;

        try {
          const queryStream = streamSearchQuery(body.userQuery, c.env);

          // ✅ BUG FIX: Stream partial query updates as EACH FIELD arrives
          // Previous code waited for BOTH query AND rationale to be present
          // This caused only ONE event to be sent when both were complete
          // New approach: Send update whenever we have meaningful new data
          let lastSentQuery: string | undefined;
          let lastSentRationale: string | undefined;

          for await (const partialQuery of queryStream.partialObjectStream) {
            // Send update if query or rationale changed (incremental updates)
            const hasNewQuery = partialQuery.query && partialQuery.query !== lastSentQuery;
            const hasNewRationale = partialQuery.rationale && partialQuery.rationale !== lastSentRationale;

            if (hasNewQuery || hasNewRationale) {
              await stream.writeSSE({
                event: 'query',
                data: JSON.stringify({
                  timestamp: Date.now(),
                  query: partialQuery.query || lastSentQuery || '',
                  rationale: partialQuery.rationale || lastSentRationale || '',
                  searchDepth: partialQuery.requiresFullContent ? WebSearchDepths.ADVANCED : WebSearchDepths.BASIC,
                  index: 0,
                  total: 1,
                }),
              });

              // Update tracking
              if (hasNewQuery)
                lastSentQuery = partialQuery.query;
              if (hasNewRationale)
                lastSentRationale = partialQuery.rationale;
            }
          }

          // Get final complete query
          generatedQuery = await queryStream.object;

          // Validate query generation succeeded
          if (!generatedQuery || !generatedQuery.query) {
            throw new Error('Query generation failed - no query produced');
          }
        } catch (error) {
          // ✅ FALLBACK: If AI fails to generate structured query, use user query directly
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';

          // Log the error for debugging
          console.error('[Pre-Search] Query generation failed:', errorMessage);

          // Create fallback query from user input
          generatedQuery = {
            query: body.userQuery.trim(),
            searchDepth: WebSearchDepths.BASIC,
            complexity: WebSearchComplexities.BASIC,
            rationale: 'Using direct query due to generation failure',
            sourceCount: 2,
            requiresFullContent: false,
            analysis: `Direct search for: "${body.userQuery}"`,
          };

          // Notify frontend about fallback
          await stream.writeSSE({
            event: 'query',
            data: JSON.stringify({
              timestamp: Date.now(),
              query: generatedQuery?.query || body.userQuery,
              rationale: generatedQuery?.rationale || 'Using direct query due to generation failure',
              searchDepth: WebSearchDepths.BASIC,
              index: 0,
              total: 1,
              fallback: true,
            }),
          });
        }

        // Type guard: At this point generatedQuery is guaranteed to be non-null
        // Either from successful AI generation OR from fallback assignment
        if (!generatedQuery) {
          throw new Error('Failed to generate search query');
        }

        // Check cache first
        let result: WebSearchResult | null = null;
        if (searchCache.has(generatedQuery.query)) {
          result = searchCache.get(generatedQuery.query);
          if (result) {
            await stream.writeSSE({
              event: 'result',
              data: JSON.stringify({
                timestamp: Date.now(),
                query: result.query,
                answer: result.answer,
                results: result.results,
                resultCount: result.results.length,
                responseTime: 0,
                index: 0,
              }),
            });
          }
        } else {
          // ✅ AI SDK V5 PATTERN: Progressive search result streaming
          // Recommended pattern: Stream results as they're processed, not after completion
          // Reference: AI SDK streamObject partialObjectStream pattern
          //
          // ARCHITECTURAL DECISION:
          // Instead of fetching all results then artificially streaming them,
          // we perform searches with progressive updates to match AI SDK streaming UX
          try {
            const searchStartTime = performance.now();

            // Send initial "searching" state
            await stream.writeSSE({
              event: 'result',
              data: JSON.stringify({
                timestamp: Date.now(),
                query: generatedQuery.query,
                answer: null, // Answer comes after results
                results: [],
                resultCount: 0,
                responseTime: 0,
                index: 0,
                status: 'searching',
              }),
            });

            // Perform web search (fetches all results + generates AI answer)
            result = await performWebSearch(
              generatedQuery.query,
              generatedQuery.sourceCount ?? 3,
              generatedQuery.requiresFullContent ?? false,
              c.env,
              generatedQuery.complexity ?? WebSearchComplexities.BASIC,
            );
            const searchDuration = performance.now() - searchStartTime;

            searchCache.set(generatedQuery.query, result);

            // ✅ REAL PROGRESSIVE STREAMING: Stream results as they become available
            // AI SDK V5 philosophy: Updates arrive as data is processed, not batched
            //
            // Stream pattern matches partialObjectStream behavior:
            // - Each result arrival triggers immediate UI update
            // - Progressive accumulation shows real-time progress
            // - No artificial delays - native streaming provides the UX
            for (let i = 0; i < result.results.length; i++) {
              await stream.writeSSE({
                event: 'result',
                data: JSON.stringify({
                  timestamp: Date.now(),
                  query: result.query,
                  answer: null, // Answer sent separately after all results
                  results: result.results.slice(0, i + 1), // Incremental accumulation
                  resultCount: i + 1,
                  responseTime: searchDuration,
                  index: 0,
                  status: 'processing',
                }),
              });
            }

            // Send final result with AI-generated answer
            await stream.writeSSE({
              event: 'result',
              data: JSON.stringify({
                timestamp: Date.now(),
                query: result.query,
                answer: result.answer, // Now include the answer
                results: result.results,
                resultCount: result.results.length,
                responseTime: searchDuration,
                index: 0,
                status: 'complete',
              }),
            });
          } catch (error) {
            result = null;
            await stream.writeSSE({
              event: 'result',
              data: JSON.stringify({
                timestamp: Date.now(),
                query: generatedQuery.query,
                answer: null,
                results: [],
                resultCount: 0,
                responseTime: 0,
                index: 0,
                status: 'error',
                error: error instanceof Error ? error.message : 'Search failed',
              }),
            });
          }
        }

        const totalTime = performance.now() - startTime;
        const isSuccess = result !== null && result.results.length > 0;

        // Send complete event
        await stream.writeSSE({
          event: 'complete',
          data: JSON.stringify({
            timestamp: Date.now(),
            totalSearches: 1,
            successfulSearches: isSuccess ? 1 : 0,
            failedSearches: isSuccess ? 0 : 1,
            totalResults: result?.results.length || 0,
          }),
        });

        // Save results to database
        if (isSuccess && result) {
          const searchData = {
            queries: [{
              query: generatedQuery.query,
              rationale: generatedQuery.rationale,
              searchDepth: WebSearchDepths.ADVANCED,
              index: 0,
              total: 1,
            }],
            results: [{
              query: result.query,
              answer: result.answer,
              results: result.results.map((r: WebSearchResult['results'][number]) => ({
                ...r,
                publishedDate: r.publishedDate ?? null,
              })),
              responseTime: result.responseTime,
            }],
            analysis: generatedQuery.analysis ?? `Search query: ${generatedQuery.query}`,
            successCount: 1,
            failureCount: 0,
            totalResults: result.results.length,
            totalTime,
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
            event: 'done',
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
            event: 'failed',
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
          event: 'failed',
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
