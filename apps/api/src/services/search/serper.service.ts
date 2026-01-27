/**
 * Serper Search Service - Google Search via Serper.dev API
 *
 * Uses Serper.dev's REST endpoint with native fetch (Workers-compatible).
 * Provides organic results, knowledge graph, and related searches.
 *
 * @see https://serper.dev/
 */

import { SERPER_COST_PER_SEARCH } from '@roundtable/shared/constants';
import { RlogCategories } from '@roundtable/shared/enums';

import { generateTraceId, trackSpan } from '@/services/errors/posthog-llm-tracking.service';
import type { ApiEnv } from '@/types';

// ============================================================================
// TYPES (from Serper.dev response)
// ============================================================================

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
 * Serper knowledge graph (internal type)
 */
type SerperKnowledgeGraphInternal = {
  title?: string;
  type?: string;
  website?: string;
  description?: string;
  attributes?: Record<string, string>;
};

/**
 * Serper People Also Ask
 */
type SerperPeopleAlsoAsk = {
  question: string;
  snippet: string;
  title: string;
  link: string;
};

/**
 * Serper related search
 */
type SerperRelatedSearch = {
  query: string;
};

/**
 * Serper API response
 */
type SerperApiResponse = {
  searchParameters: {
    q: string;
    type: string;
    engine: string;
    num?: number;
  };
  organic?: SerperOrganicResult[];
  knowledgeGraph?: SerperKnowledgeGraphInternal;
  peopleAlsoAsk?: SerperPeopleAlsoAsk[];
  relatedSearches?: SerperRelatedSearch[];
  answerBox?: {
    title?: string;
    answer?: string;
    snippet?: string;
  };
  credits?: number;
};

// ============================================================================
// EXPORTED TYPES
// ============================================================================

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
 * Knowledge graph data
 */
export type SerperKnowledgeGraph = {
  title?: string;
  type?: string;
  website?: string;
  description?: string;
};

/**
 * Search response with metadata
 */
export type SerperSearchOutput = {
  results: SerperSearchResult[];
  knowledgeGraph?: SerperKnowledgeGraph;
  relatedSearches?: string[];
  relatedQuestions?: Array<{ question: string; snippet?: string }>;
  answerBox?: { title?: string; answer?: string; snippet?: string };
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
  return !!env.SERP_API_KEY && env.SERP_API_KEY !== 'your-serper-api-key-here';
}

/**
 * Perform a Google search via Serper.dev API
 *
 * Uses native fetch for Cloudflare Workers compatibility.
 */
export async function searchWithSerper(
  query: string,
  env: ApiEnv['Bindings'],
  options?: {
    numResults?: number;
    country?: string;
    language?: string;
  },
): Promise<SerperSearchOutput> {
  const startTime = performance.now();

  if (!isSerperConfigured(env)) {
    rlogSerper('skip', 'API key not configured');
    throw new Error('Serper API key not configured');
  }

  const numResults = Math.min(options?.numResults || DEFAULT_NUM_RESULTS, MAX_RESULTS);

  rlogSerper('request', `q="${query.slice(0, 50)}${query.length > 50 ? '...' : ''}" num=${numResults}`);

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(SERPER_API_URL, {
      body: JSON.stringify({
        autocorrect: true,
        gl: options?.country || 'us',
        hl: options?.language || 'en',
        num: numResults,
        q: query,
      }),
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': env.SERP_API_KEY,
      },
      method: 'POST',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      rlogSerper('http-error', `status=${response.status} body=${errorText.slice(0, 200)}`);
      throw new Error(`Serper HTTP error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as SerperApiResponse;
    const responseTimeMs = performance.now() - startTime;

    // Normalize organic results
    const results: SerperSearchResult[] = (data.organic || []).map((r) => {
      const result: SerperSearchResult = {
        position: r.position,
        snippet: r.snippet || '',
        title: r.title || '',
        url: r.link || '',
      };
      if (r.date) {
        result.date = r.date;
      }
      return result;
    });

    // Build output
    const output: SerperSearchOutput = {
      responseTimeMs,
      results,
    };

    // Add knowledge graph if present
    if (data.knowledgeGraph) {
      const kg = data.knowledgeGraph;
      output.knowledgeGraph = {
        description: kg.description,
        title: kg.title,
        type: kg.type,
        website: kg.website,
      };
    }

    // Add related searches if present
    if (data.relatedSearches && data.relatedSearches.length > 0) {
      output.relatedSearches = data.relatedSearches.map(r => r.query);
    }

    // Add related questions (People Also Ask) if present
    if (data.peopleAlsoAsk && data.peopleAlsoAsk.length > 0) {
      output.relatedQuestions = data.peopleAlsoAsk.map(r => ({
        question: r.question,
        snippet: r.snippet,
      }));
    }

    // Add answer box if present
    if (data.answerBox) {
      output.answerBox = {
        answer: data.answerBox.answer,
        snippet: data.answerBox.snippet,
        title: data.answerBox.title,
      };
    }

    rlogSerper('success', `results=${results.length} time=${responseTimeMs.toFixed(0)}ms`);

    // Track Serper search cost for PostHog analytics
    const traceId = generateTraceId();
    trackSpan(
      { userId: 'system' },
      {
        inputState: { numResults, query },
        outputState: { resultsCount: results.length },
        spanName: 'serper_search',
        traceId,
      },
      responseTimeMs,
      {
        additionalProperties: {
          actual_cost_usd: SERPER_COST_PER_SEARCH,
          operation_type: 'web_search',
          provider: 'serper',
        },
      },
    ).catch(() => {}); // Fire and forget

    return output;
  } catch (error) {
    clearTimeout(timeoutId);
    const responseTimeMs = performance.now() - startTime;

    if (error instanceof Error && error.name === 'AbortError') {
      rlogSerper('timeout', `exceeded ${REQUEST_TIMEOUT_MS}ms`);
      throw new Error(`Serper timeout after ${REQUEST_TIMEOUT_MS}ms`);
    }

    rlogSerper('error', `${error instanceof Error ? error.message : 'Unknown error'} time=${responseTimeMs.toFixed(0)}ms`);
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
