/**
 * Chat Pre-Search Service - SSE Streaming Web Search Execution
 *
 * 100% type-safe service for pre-search SSE streaming
 * Handles Server-Sent Events for real-time search progress
 */

import type { InferRequestType, InferResponseType } from 'hono/client';
import { parseResponse } from 'hono/client';
import { z } from 'zod';

import type { ApiClientType } from '@/lib/api/client';
import { createApiClient } from '@/lib/api/client';

// ============================================================================
// Type Inference
// ============================================================================

type PreSearchEndpoint = ApiClientType['chatFeature']['chat']['threads'][':threadId']['rounds'][':roundNumber']['pre-search']['$post'];
export type PreSearchRequest = InferRequestType<PreSearchEndpoint>;
export type PreSearchResponse = InferResponseType<PreSearchEndpoint, 200>;

type GetThreadPreSearchesEndpoint = ApiClientType['chatFeature']['chat']['threads'][':id']['pre-searches']['$get'];
export type GetThreadPreSearchesRequest = InferRequestType<GetThreadPreSearchesEndpoint>;
export type GetThreadPreSearchesResponse = InferResponseType<GetThreadPreSearchesEndpoint, 200>;

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Get all pre-search results for a thread
 * Protected endpoint - requires authentication
 */
export async function getThreadPreSearchesService(
  data: GetThreadPreSearchesRequest,
  options?: { cookieHeader?: string },
) {
  const client = createApiClient({ cookieHeader: options?.cookieHeader });
  return parseResponse(client.chatFeature.chat.threads[':id']['pre-searches'].$get(data));
}

// ============================================================================
// Derived Types - RPC INFERENCE (SINGLE SOURCE OF TRUTH)
// ============================================================================

/**
 * StoredPreSearch - Pre-search item derived from API response
 */
export type StoredPreSearch = Extract<
  GetThreadPreSearchesResponse,
  { success: true }
> extends { data: { items: (infer P)[] } }
  ? P
  : never;

/**
 * PreSearchDataPayload - Derived from StoredPreSearch.searchData
 */
export type PreSearchDataPayload = NonNullable<StoredPreSearch['searchData']>;

/**
 * PartialPreSearchData - Partial version of PreSearchDataPayload for streaming
 */
export type PartialPreSearchData = Partial<PreSearchDataPayload>;

/**
 * PreSearchQuery - Query item derived from PreSearchDataPayload
 */
export type PreSearchQuery = PreSearchDataPayload['queries'][number];

/**
 * PreSearchResult - Result item derived from PreSearchDataPayload
 */
export type PreSearchResult = PreSearchDataPayload['results'][number];

/**
 * WebSearchResultItem - Web search result derived from PreSearchResult
 */
export type WebSearchResultItem = PreSearchResult['results'][number];

/**
 * GeneratedSearchQuery - Search query with status (extends PreSearchQuery)
 */
export type GeneratedSearchQuery = PreSearchQuery & {
  status?: string;
};

// ============================================================================
// Validation Schema - Derived from RPC Type
// ============================================================================

/**
 * StoredPreSearchSchema - Custom Zod schema that accepts the RPC StoredPreSearch type
 * Uses z.custom<StoredPreSearch>() to trust the RPC type without duplicating validation
 */
export const StoredPreSearchSchema = z.custom<StoredPreSearch>(
  (val): val is StoredPreSearch => {
    return (
      typeof val === 'object'
      && val !== null
      && 'id' in val
      && 'threadId' in val
      && 'roundNumber' in val
      && 'status' in val
    );
  },
  { message: 'Invalid StoredPreSearch object' },
);

export type StoredPreSearchValidated = StoredPreSearch;
