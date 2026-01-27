/**
 * Serper Search Service - Google Search via Serper API
 *
 * Primary search engine for web searches. Uses Serper.dev API
 * which provides fast, reliable Google search results.
 *
 * Pricing: $50/month for 50,000 searches, 2,500 free/month
 * Speed: ~1.8s average response time
 */

import { RlogCategories } from '@roundtable/shared/enums';

import type { ApiEnv } from '@/types';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Serper API search parameters
 */
type SerperSearchParams = {
  q: string;
  gl?: string; // Country code (e.g., "us", "uk")
  hl?: string; // Language code (e.g., "en", "es")
  num?: number; // Number of results (default: 10, max: 100)
  autocorrect?: boolean;
  page?: number;
  type?: 'search' | 'images' | 'news' | 'places';
};

/**
 * Serper organic search result
 */
type SerperOrganicResult = {
  title: string;
  link: string;
  snippet: string;
  position: number;
  date?: string;
  sitelinks?: Array<{ title: string; link: string }>;
};

/**
 * Serper knowledge graph result
 */
type SerperKnowledgeGraph = {
  title?: string;
  type?: string;
  website?: string;
  description?: string;
  attributes?: Record<string, string>;
};

/**
 * Serper API response
 */
type SerperSearchResponse = {
  searchParameters: {
    q: string;
    gl: string;
    hl: string;
    num: number;
    type: string;
  };
  organic: SerperOrganicResult[];
  knowledgeGraph?: SerperKnowledgeGraph;
  peopleAlsoAsk?: Array<{
    question: string;
    snippet: string;
    link: string;
  }>;
  relatedSearches?: Array<{ query: string }>;
  credits?: number;
};

/**
 * Normalized search result for internal use
 */
export type SerperSearchResult = {
  title: string;
  url: string;
  snippet: string;
  position: number;
  date?: string;
};

/**
 * Search response with metadata
 */
export type SerperSearchOutput = {
  results: SerperSearchResult[];
  knowledgeGraph?: SerperKnowledgeGraph;
  relatedSearches?: string[];
  creditsUsed?: number;
  responseTimeMs: number;
};

// ============================================================================
// CONSTANTS
// ============================================================================

const SERPER_API_URL = 'https://google.serper.dev/search';
const DEFAULT_NUM_RESULTS = 10;
const MAX_RESULTS = 100;
const REQUEST_TIMEOUT_MS = 15000;

// ============================================================================
// LOGGING (rlog pattern)
// ============================================================================

const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV === 'development';

function rlogSerper(action: string, detail: string): void {
  if (!isDev) {
    return;
  }
  // eslint-disable-next-line no-console
  console.log(`%c[${RlogCategories.PRESRCH}] serper:${action}: ${detail}`, 'color: #9C27B0; font-weight: bold');
}

// ============================================================================
// SERVICE
// ============================================================================

/**
 * Check if Serper API is configured
 */
export function isSerperConfigured(env: ApiEnv['Bindings']): boolean {
  return !!env.SERPER_API_KEY && env.SERPER_API_KEY !== 'your-serper-api-key-here';
}

/**
 * Perform a Google search via Serper API
 */
export async function searchWithSerper(
  query: string,
  env: ApiEnv['Bindings'],
  options?: {
    numResults?: number;
    country?: string;
    language?: string;
    page?: number;
  },
): Promise<SerperSearchOutput> {
  const startTime = performance.now();

  if (!isSerperConfigured(env)) {
    rlogSerper('skip', 'API key not configured');
    throw new Error('Serper API key not configured');
  }

  const numResults = Math.min(options?.numResults || DEFAULT_NUM_RESULTS, MAX_RESULTS);

  const params: SerperSearchParams = {
    autocorrect: true,
    gl: options?.country || 'us',
    hl: options?.language || 'en',
    num: numResults,
    page: options?.page || 1,
    q: query,
    type: 'search',
  };

  rlogSerper('request', `q="${query.slice(0, 50)}${query.length > 50 ? '...' : ''}" num=${numResults}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(SERPER_API_URL, {
      body: JSON.stringify(params),
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': env.SERPER_API_KEY,
      },
      method: 'POST',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      rlogSerper('error', `status=${response.status} body=${errorText.slice(0, 100)}`);
      throw new Error(`Serper API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as SerperSearchResponse;
    const responseTimeMs = performance.now() - startTime;

    // Normalize results
    const results: SerperSearchResult[] = (data.organic || []).map(r => ({
      date: r.date,
      position: r.position,
      snippet: r.snippet || '',
      title: r.title || '',
      url: r.link || '',
    }));

    rlogSerper('success', `results=${results.length} time=${responseTimeMs.toFixed(0)}ms`);

    return {
      creditsUsed: data.credits,
      knowledgeGraph: data.knowledgeGraph,
      relatedSearches: data.relatedSearches?.map(r => r.query),
      responseTimeMs,
      results,
    };
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      rlogSerper('timeout', `exceeded ${REQUEST_TIMEOUT_MS}ms`);
      throw new Error(`Serper API timeout after ${REQUEST_TIMEOUT_MS}ms`);
    }

    rlogSerper('error', error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}

/**
 * Search with automatic retry on failure
 */
export async function searchWithSerperRetry(
  query: string,
  env: ApiEnv['Bindings'],
  options?: {
    numResults?: number;
    country?: string;
    language?: string;
    maxRetries?: number;
    retryDelayMs?: number;
  },
): Promise<SerperSearchOutput> {
  const maxRetries = options?.maxRetries ?? 2;
  const retryDelayMs = options?.retryDelayMs ?? 500;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await searchWithSerper(query, env, options);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        rlogSerper('retry', `attempt=${attempt + 1}/${maxRetries} delay=${retryDelayMs}ms`);
        await new Promise<void>((resolve) => {
          setTimeout(resolve, retryDelayMs);
        });
      }
    }
  }

  throw lastError || new Error('Serper search failed after retries');
}
